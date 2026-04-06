import { useCallback, useEffect, useRef } from 'react';
import { getPageText } from '../pdfUtils';
import { analyzePageTerms } from '../ai';
import type { AppState, AnalysisResult, TermEntry } from '../types';

interface Step2Props {
  state: AppState;
  setState: (fn: (prev: AppState) => AppState) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function Step2Analysis({ state, setState, onNext, onPrev }: Step2Props) {
  const abortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);

  const offset = state.firstNumberedPdfPage - state.firstBookPageNumber;

  // Build initial analysis results if empty
  useEffect(() => {
    if (state.analysisResults.length > 0) return;
    const results: AnalysisResult[] = [];
    for (let p = state.analyzeFrom; p <= state.analyzeTo; p++) {
      if (state.excludedPages.includes(p)) continue;
      results.push({
        pdfPage: p,
        bookPage: p - offset,
        terms: [],
        status: 'pending',
      });
    }
    setState((prev) => ({ ...prev, analysisResults: results }));
  }, [state.analyzeFrom, state.analyzeTo, state.excludedPages, offset, setState, state.analysisResults.length]);

  const runAnalysis = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    abortRef.current = new AbortController();

    setState((prev) => ({ ...prev, isAnalyzing: true, isPaused: false }));

    const results = [...state.analysisResults];
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'done' || results[i].status === 'skipped') continue;

      // Check for pause/abort
      if (abortRef.current?.signal.aborted) break;

      setState((prev) => ({
        ...prev,
        currentAnalysisPage: i,
        analysisResults: prev.analysisResults.map((r, idx) =>
          idx === i ? { ...r, status: 'analyzing' } : r
        ),
      }));

      try {
        const text = await getPageText(results[i].pdfPage);
        if (!text || text.length < 20) {
          setState((prev) => ({
            ...prev,
            analysisResults: prev.analysisResults.map((r, idx) =>
              idx === i ? { ...r, status: 'skipped', error: 'Geen of weinig tekst gevonden' } : r
            ),
          }));
          continue;
        }

        let attempts = 0;
        let terms: string[] = [];
        let lastError = '';
        while (attempts < 3) {
          try {
            terms = await analyzePageTerms(text, results[i].bookPage, abortRef.current?.signal);
            break;
          } catch (err) {
            lastError = (err as Error).message;
            attempts++;
            if (attempts >= 3 || abortRef.current?.signal.aborted) break;
            await new Promise((r) => setTimeout(r, 1000 * attempts));
          }
        }

        if (abortRef.current?.signal.aborted) break;

        if (attempts >= 3 && terms.length === 0) {
          setState((prev) => ({
            ...prev,
            analysisResults: prev.analysisResults.map((r, idx) =>
              idx === i ? { ...r, status: 'error', error: lastError } : r
            ),
          }));
        } else {
          setState((prev) => ({
            ...prev,
            analysisResults: prev.analysisResults.map((r, idx) =>
              idx === i ? { ...r, status: 'done', terms } : r
            ),
          }));
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') break;
        setState((prev) => ({
          ...prev,
          analysisResults: prev.analysisResults.map((r, idx) =>
            idx === i ? { ...r, status: 'error', error: (err as Error).message } : r
          ),
        }));
      }
    }

    isRunningRef.current = false;
    setState((prev) => ({ ...prev, isAnalyzing: false }));
  }, [state.analysisResults, setState]);

  const pauseAnalysis = useCallback(() => {
    abortRef.current?.abort();
    isRunningRef.current = false;
    setState((prev) => ({
      ...prev,
      isAnalyzing: false,
      isPaused: true,
      analysisResults: prev.analysisResults.map((r) =>
        r.status === 'analyzing' ? { ...r, status: 'pending' } : r
      ),
    }));
  }, [setState]);

  const retryFailed = useCallback(() => {
    setState((prev) => ({
      ...prev,
      analysisResults: prev.analysisResults.map((r) =>
        r.status === 'error' ? { ...r, status: 'pending', error: undefined } : r
      ),
    }));
  }, [setState]);

  // Build terms from analysis results
  const buildTerms = useCallback(() => {
    const termMap = new Map<string, Set<number>>();
    for (const result of state.analysisResults) {
      if (result.status !== 'done') continue;
      for (const term of result.terms) {
        const normalized = term.trim();
        if (!normalized) continue;
        if (!termMap.has(normalized)) termMap.set(normalized, new Set());
        termMap.get(normalized)!.add(result.bookPage);
      }
    }

    const terms: TermEntry[] = Array.from(termMap.entries()).map(([term, pages]) => ({
      id: crypto.randomUUID(),
      term,
      pages: Array.from(pages).sort((a, b) => a - b),
      selected: true,
    }));

    setState((prev) => ({ ...prev, terms }));
    onNext();
  }, [state.analysisResults, setState, onNext]);

  const doneCount = state.analysisResults.filter((r) => r.status === 'done').length;
  const errorCount = state.analysisResults.filter((r) => r.status === 'error').length;
  const skippedCount = state.analysisResults.filter((r) => r.status === 'skipped').length;
  const totalPages = state.analysisResults.length;
  const processedCount = doneCount + errorCount + skippedCount;
  const percentage = totalPages > 0 ? Math.round((processedCount / totalPages) * 100) : 0;
  const isDone = processedCount === totalPages && totalPages > 0;

  const allTerms = new Set<string>();
  state.analysisResults
    .filter((r) => r.status === 'done')
    .forEach((r) => r.terms.forEach((t) => allTerms.add(t)));

  const recentTerms = state.analysisResults
    .filter((r) => r.status === 'done')
    .slice(-5)
    .flatMap((r) => r.terms)
    .slice(-20);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-900">AI-analyse</h1>
        <p className="text-warm-500 mt-2">
          Elke pagina wordt geanalyseerd op registertermen.
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-warm-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-warm-700">
            {state.isAnalyzing
              ? `Pagina ${state.currentAnalysisPage + 1} van ${totalPages}...`
              : isDone
                ? 'Analyse voltooid'
                : state.isPaused
                  ? 'Gepauzeerd'
                  : 'Klaar om te starten'}
          </span>
          <span className="text-sm font-bold text-primary-700">{percentage}%</span>
        </div>

        <div className="w-full bg-warm-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              state.isAnalyzing ? 'bg-primary-500' : isDone ? 'bg-green-500' : 'bg-primary-400'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-warm-500">
          <span>{doneCount} geanalyseerd</span>
          {errorCount > 0 && <span className="text-amber-600">{errorCount} fouten</span>}
          {skippedCount > 0 && <span>{skippedCount} overgeslagen</span>}
          <span>{allTerms.size} unieke termen</span>
        </div>

        {/* Controls */}
        <div className="flex gap-3 mt-4">
          {!state.isAnalyzing && !isDone && (
            <button
              onClick={runAnalysis}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
            >
              {state.isPaused || processedCount > 0 ? 'Hervat analyse' : 'Start analyse'}
            </button>
          )}
          {state.isAnalyzing && (
            <button
              onClick={pauseAnalysis}
              className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition"
            >
              Pauzeer
            </button>
          )}
          {errorCount > 0 && !state.isAnalyzing && (
            <button
              onClick={retryFailed}
              className="px-4 py-2 border border-warm-300 rounded-lg text-sm hover:bg-warm-50 transition"
            >
              Foutpagina&apos;s opnieuw proberen
            </button>
          )}
        </div>
      </div>

      {/* Recent terms feed */}
      {recentTerms.length > 0 && (
        <div className="bg-white border border-warm-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-warm-700 mb-3">Recent gevonden termen</h3>
          <div className="flex flex-wrap gap-2">
            {recentTerms.map((t, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-primary-50 text-primary-700 rounded-full text-xs font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary when done */}
      {isDone && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-800 font-medium">
            Analyse voltooid: {doneCount} pagina&apos;s geanalyseerd, {skippedCount} overgeslagen
            {errorCount > 0 ? `, ${errorCount} met fouten` : ''}.
          </p>
          <p className="text-green-700 text-sm mt-1">
            {allTerms.size} unieke termen gevonden.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onPrev}
          className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition"
        >
          &larr; Vorige
        </button>
        <button
          onClick={buildTerms}
          disabled={allTerms.size === 0}
          className={`px-8 py-3 rounded-lg font-medium text-sm transition-all ${
            allTerms.size > 0
              ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md'
              : 'bg-warm-200 text-warm-400 cursor-not-allowed'
          }`}
        >
          Ga naar termselectie &rarr;
        </button>
      </div>
    </div>
  );
}
