import { useState, useMemo, useCallback } from 'react';
import { smartFilterTerms } from '../ai';
import type { AppState, TermEntry } from '../types';

interface Step3Props {
  state: AppState;
  setState: (fn: (prev: AppState) => AppState) => void;
  onNext: () => void;
  onPrev: () => void;
}

type SortMode = 'alpha' | 'frequency' | 'firstPage';

function compressPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const ranges: string[] = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) end = sorted[i];
    else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = sorted[i]; end = sorted[i]; }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

export function Step3Terms({ state, setState, onNext, onPrev }: Step3Props) {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [isMerging, setIsMerging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newPages, setNewPages] = useState('');

  // AI filter state
  const [showAiFilter, setShowAiFilter] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiFiltering, setIsAiFiltering] = useState(false);
  const [aiResult, setAiResult] = useState<string>('');

  const selectedCount = state.terms.filter((t) => t.selected).length;

  const filteredTerms = useMemo(() => {
    let terms = state.terms;
    if (search) {
      const q = search.toLowerCase();
      terms = terms.filter((t) => t.term.toLowerCase().includes(q));
    }
    switch (sortMode) {
      case 'alpha': return [...terms].sort((a, b) => a.term.localeCompare(b.term, 'nl'));
      case 'frequency': return [...terms].sort((a, b) => b.pages.length - a.pages.length);
      case 'firstPage': return [...terms].sort((a, b) => (a.pages[0] || 0) - (b.pages[0] || 0));
    }
  }, [state.terms, search, sortMode]);

  const toggleTerm = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      terms: prev.terms.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)),
    }));
  }, [setState]);

  const selectAll = () => setState((prev) => ({ ...prev, terms: prev.terms.map((t) => ({ ...t, selected: true })) }));
  const deselectAll = () => setState((prev) => ({ ...prev, terms: prev.terms.map((t) => ({ ...t, selected: false })) }));
  const invertSelection = () => setState((prev) => ({ ...prev, terms: prev.terms.map((t) => ({ ...t, selected: !t.selected })) }));

  // Merge
  const toggleMergeSelect = (id: string) => {
    setMergeSelection((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const executeMerge = (primaryId: string) => {
    setState((prev) => {
      const primary = prev.terms.find((t) => t.id === primaryId);
      if (!primary) return prev;
      const toMerge = prev.terms.filter((t) => mergeSelection.has(t.id) && t.id !== primaryId);
      const mergedPages = new Set([...primary.pages, ...toMerge.flatMap((t) => t.pages)]);
      const mergedFrom = [...(primary.mergedFrom || []), ...toMerge.map((t) => t.term)];
      return {
        ...prev,
        terms: prev.terms
          .filter((t) => !mergeSelection.has(t.id) || t.id === primaryId)
          .map((t) => t.id === primaryId
            ? { ...t, pages: Array.from(mergedPages).sort((a, b) => a - b), mergedFrom, selected: true }
            : t
          ),
      };
    });
    setMergeSelection(new Set());
    setIsMerging(false);
  };

  const startEdit = (t: TermEntry) => { setEditingId(t.id); setEditText(t.term); };
  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    setState((prev) => ({ ...prev, terms: prev.terms.map((t) => (t.id === editingId ? { ...t, term: editText.trim() } : t)) }));
    setEditingId(null);
  };

  const addTerm = () => {
    if (!newTerm.trim()) return;
    const pages = newPages.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    setState((prev) => ({
      ...prev,
      terms: [...prev.terms, { id: crypto.randomUUID(), term: newTerm.trim(), pages: pages.sort((a, b) => a - b), selected: true }],
    }));
    setNewTerm(''); setNewPages(''); setShowAddForm(false);
  };

  // AI smart filter
  const handleAiFilter = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiFiltering(true);
    setAiResult('');
    try {
      const termsData = state.terms.map(t => ({ term: t.term, pages: t.pages, frequency: t.pages.length }));
      const result = await smartFilterTerms(termsData, aiPrompt);

      setState((prev) => {
        let newTerms = prev.terms.map(t => {
          // Check renames
          if (result.rename[t.term]) {
            return { ...t, term: result.rename[t.term], selected: result.keep.includes(t.term) || result.keep.includes(result.rename[t.term]) };
          }
          return { ...t, selected: result.keep.includes(t.term) };
        });
        return { ...prev, terms: newTerms };
      });

      setAiResult(result.suggestions);
    } catch (err) {
      setAiResult('Fout: ' + (err as Error).message);
    } finally {
      setIsAiFiltering(false);
    }
  };

  const goToRegisterEditor = () => {
    onNext();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-900">Termselectie</h1>
        <p className="text-warm-500 mt-2">
          {selectedCount} van {state.terms.length} termen geselecteerd
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-warm-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek termen..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-3 py-2 border border-warm-300 rounded-lg text-sm">
          <option value="alpha">A-Z</option>
          <option value="frequency">Meest frequent</option>
          <option value="firstPage">Eerste pagina</option>
        </select>
        <div className="flex gap-1">
          <button onClick={selectAll} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">Alles</button>
          <button onClick={deselectAll} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">Niets</button>
          <button onClick={invertSelection} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">Inverteer</button>
        </div>
        <button onClick={() => setIsMerging(!isMerging)}
          className={`px-3 py-2 text-xs rounded-lg transition ${isMerging ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'}`}>
          {isMerging ? 'Annuleer samenvoegen' : 'Samenvoegen'}
        </button>
        <button onClick={() => setShowAddForm(!showAddForm)} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">
          + Toevoegen
        </button>
      </div>

      {/* AI Smart Filter */}
      <div className="bg-white border border-warm-200 rounded-xl p-4">
        <button onClick={() => setShowAiFilter(!showAiFilter)}
          className="flex items-center gap-2 text-sm font-medium text-primary-700 hover:text-primary-900">
          <span className="text-lg">✨</span>
          AI-assistent: slim filteren en hernoemen
          <span className="text-xs text-warm-400 ml-1">{showAiFilter ? '▲' : '▼'}</span>
        </button>

        {showAiFilter && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-warm-500">
              Geef de AI een instructie om termen te filteren, hernoemen of normaliseren. Bijvoorbeeld:
              &quot;Selecteer alleen termen die direct met kunstmatige intelligentie te maken hebben&quot; of
              &quot;Zet alle varianten om naar de juiste basisvorm en voeg gerelateerde termen samen&quot;.
            </p>
            <textarea
              value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="bijv. Selecteer alleen de echt belangrijke begrippen over AI en onderwijs. Zet varianten om naar basistermen (formatieve → formatief toetsen, summatieve → summatief toetsen)."
              rows={3}
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            />
            <div className="flex gap-3 items-center">
              <button onClick={handleAiFilter} disabled={isAiFiltering || !aiPrompt.trim()}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  isAiFiltering || !aiPrompt.trim() ? 'bg-warm-200 text-warm-400 cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}>
                {isAiFiltering ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyseren...
                  </span>
                ) : 'Pas toe'}
              </button>
              {aiResult && (
                <p className={`text-xs flex-1 ${aiResult.startsWith('Fout') ? 'text-red-600' : 'text-green-700'}`}>
                  {aiResult}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white border border-warm-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-warm-500 mb-1">Term</label>
            <input value={newTerm} onChange={(e) => setNewTerm(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm" placeholder="Nieuwe term" />
          </div>
          <div className="w-48">
            <label className="block text-xs text-warm-500 mb-1">Pagina&apos;s</label>
            <input value={newPages} onChange={(e) => setNewPages(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm" placeholder="bijv. 12, 45, 78" />
          </div>
          <button onClick={addTerm} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Voeg toe</button>
        </div>
      )}

      {/* Merge bar */}
      {isMerging && mergeSelection.size >= 2 && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
          <p className="text-sm text-primary-800 mb-2">{mergeSelection.size} termen geselecteerd. Kies de hoofdterm:</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(mergeSelection).map((id) => {
              const term = state.terms.find((t) => t.id === id);
              if (!term) return null;
              return (
                <button key={id} onClick={() => executeMerge(id)}
                  className="px-3 py-1 bg-primary-600 text-white rounded-full text-xs hover:bg-primary-700">
                  {term.term}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Terms list */}
      <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-warm-50 sticky top-0 z-10">
              <tr>
                {isMerging && <th className="w-10 px-3 py-3 text-left text-xs font-semibold text-warm-600">Voeg</th>}
                <th className="w-10 px-3 py-3 text-left text-xs font-semibold text-warm-600"></th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-warm-600">Term</th>
                <th className="w-20 px-3 py-3 text-center text-xs font-semibold text-warm-600">#</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-warm-600">Pagina&apos;s</th>
                <th className="w-16 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {filteredTerms.map((t) => (
                <tr key={t.id} className={`hover:bg-warm-50 transition-colors ${!t.selected ? 'opacity-40' : ''}`}>
                  {isMerging && (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={mergeSelection.has(t.id)} onChange={() => toggleMergeSelect(t.id)}
                        className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500" />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={t.selected} onChange={() => toggleTerm(t.id)}
                      className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500" />
                  </td>
                  <td className="px-3 py-2">
                    {editingId === t.id ? (
                      <div className="flex gap-2">
                        <input value={editText} onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                          className="flex-1 px-2 py-1 border border-primary-300 rounded text-sm" autoFocus />
                        <button onClick={saveEdit} className="text-xs text-primary-600 hover:underline">OK</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-warm-500 hover:underline">Annuleer</button>
                      </div>
                    ) : (
                      <span className="text-sm text-primary-900 font-medium">
                        {t.term}
                        {t.mergedFrom && t.mergedFrom.length > 0 && (
                          <span className="ml-2 text-xs text-warm-400">(ook: {t.mergedFrom.join(', ')})</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-warm-500">{t.pages.length}</td>
                  <td className="px-3 py-2 text-xs text-warm-500">{compressPages(t.pages)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => startEdit(t)} className="text-xs text-warm-400 hover:text-primary-600">bewerk</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTerms.length === 0 && (
            <div className="p-8 text-center text-warm-400 text-sm">
              Geen termen gevonden{search ? ` voor "${search}"` : ''}.
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap justify-between gap-3">
        <button onClick={onPrev}
          className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition">
          &larr; Vorige
        </button>
        <button onClick={goToRegisterEditor} disabled={selectedCount === 0}
          className={`px-8 py-3 rounded-lg text-sm font-medium transition-all ${
            selectedCount > 0 ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md' : 'bg-warm-200 text-warm-400 cursor-not-allowed'
          }`}>
          Register samenstellen &rarr;
        </button>
      </div>
    </div>
  );
}
