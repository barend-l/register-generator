import { useCallback, useState, type DragEvent } from 'react';
import { loadPdf } from '../pdfUtils';
import type { AppState } from '../types';

interface Step1Props {
  state: AppState;
  setState: (fn: (prev: AppState) => AppState) => void;
  onNext: () => void;
}

export function Step1Upload({ state, setState, onNext }: Step1Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.pdf')) {
        alert('Selecteer een PDF-bestand.');
        return;
      }
      setLoading(true);
      try {
        const numPages = await loadPdf(file);
        setState((prev) => ({
          ...prev,
          pdfFile: file,
          pdfFileName: file.name,
          pdfFileSize: file.size,
          totalPdfPages: numPages,
          analyzeFrom: prev.analyzeFrom || prev.firstNumberedPdfPage,
          analyzeTo: prev.analyzeTo || numPages,
        }));
      } catch (err) {
        alert('Fout bij het laden van de PDF: ' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [setState]
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const offset = state.firstNumberedPdfPage - state.firstBookPageNumber;
  const canProceed = state.totalPdfPages > 0 && state.firstNumberedPdfPage > 0;

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-900">PDF uploaden</h1>
        <p className="text-warm-500 mt-2">Upload je manuscript en stel de paginanummering in.</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : state.pdfFile
              ? 'border-green-400 bg-green-50'
              : 'border-warm-300 bg-warm-50 hover:border-primary-400 hover:bg-primary-50'
        }`}
        onClick={() => document.getElementById('pdf-input')?.click()}
      >
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          onChange={handleFileInput}
          className="hidden"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-warm-600">PDF wordt geladen...</p>
          </div>
        ) : state.pdfFile ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium text-primary-900">{state.pdfFileName}</p>
            <p className="text-sm text-warm-500">
              {formatSize(state.pdfFileSize)} &middot; {state.totalPdfPages} pagina&apos;s
            </p>
            <p className="text-xs text-warm-400 mt-1">Klik of sleep om een ander bestand te kiezen</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-12 h-12 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-warm-600 font-medium">Sleep je PDF hierheen of klik om te uploaden</p>
            <p className="text-sm text-warm-400">Alleen .pdf bestanden</p>
          </div>
        )}
      </div>

      {/* Page numbering settings */}
      {state.totalPdfPages > 0 && (
        <div className="bg-white border border-warm-200 rounded-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-primary-900">Paginanummering instellen</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">
                Eerste PDF-pagina met paginanummer
              </label>
              <input
                type="number"
                min={1}
                max={state.totalPdfPages}
                value={state.firstNumberedPdfPage}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    firstNumberedPdfPage: parseInt(e.target.value) || 1,
                    analyzeFrom: parseInt(e.target.value) || prev.analyzeFrom,
                  }))
                }
                className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
              <p className="text-xs text-warm-400 mt-1">De PDF-pagina (niet het gedrukte nummer)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-1">
                Gedrukt paginanummer op die pagina
              </label>
              <input
                type="number"
                min={1}
                value={state.firstBookPageNumber}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    firstBookPageNumber: parseInt(e.target.value) || 1,
                  }))
                }
                className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Preview mapping */}
          <div className="bg-warm-50 rounded-lg p-4">
            <p className="text-sm font-medium text-warm-700 mb-2">Preview paginanummering:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-warm-600 max-w-xs">
              {Array.from({ length: Math.min(8, state.totalPdfPages - state.firstNumberedPdfPage + 1) }, (_, i) => {
                const pdfPage = state.firstNumberedPdfPage + i;
                const bookPage = pdfPage - offset;
                return (
                  <div key={i} className="flex justify-between">
                    <span>PDF-pagina {pdfPage}</span>
                    <span className="text-primary-700 font-medium">= p. {bookPage}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analyse range */}
          <div>
            <h3 className="text-sm font-semibold text-warm-700 mb-2">Analysebereik (optioneel)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-warm-500 mb-1">Van PDF-pagina</label>
                <input
                  type="number"
                  min={1}
                  max={state.totalPdfPages}
                  value={state.analyzeFrom}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      analyzeFrom: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-warm-500 mb-1">Tot en met PDF-pagina</label>
                <input
                  type="number"
                  min={1}
                  max={state.totalPdfPages}
                  value={state.analyzeTo}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      analyzeTo: parseInt(e.target.value) || state.totalPdfPages,
                    }))
                  }
                  className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Excluded pages */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              Pagina&apos;s uitsluiten (optioneel)
            </label>
            <input
              type="text"
              placeholder="bijv. 10, 20, 50 (PDF-paginanummers)"
              value={state.excludedPages.join(', ')}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  excludedPages: e.target.value
                    .split(',')
                    .map((s) => parseInt(s.trim()))
                    .filter((n) => !isNaN(n)),
                }))
              }
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <p className="text-xs text-warm-400 mt-1">
              Kommagescheiden PDF-paginanummers die overgeslagen moeten worden
            </p>
          </div>
        </div>
      )}

      {/* Next button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`px-8 py-3 rounded-lg font-medium text-sm transition-all ${
            canProceed
              ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg'
              : 'bg-warm-200 text-warm-400 cursor-not-allowed'
          }`}
        >
          Start analyse &rarr;
        </button>
      </div>
    </div>
  );
}
