import { useState, useMemo, useCallback } from 'react';
import { categorizeTerms } from '../ai';
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
    if (sorted[i] === end + 1) { end = sorted[i]; }
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
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  const selectedCount = state.terms.filter((t) => t.selected).length;

  const filteredTerms = useMemo(() => {
    let terms = state.terms;
    if (search) {
      const q = search.toLowerCase();
      terms = terms.filter((t) => t.term.toLowerCase().includes(q));
    }
    switch (sortMode) {
      case 'alpha':
        return [...terms].sort((a, b) => a.term.localeCompare(b.term, 'nl'));
      case 'frequency':
        return [...terms].sort((a, b) => b.pages.length - a.pages.length);
      case 'firstPage':
        return [...terms].sort((a, b) => (a.pages[0] || 0) - (b.pages[0] || 0));
    }
  }, [state.terms, search, sortMode]);

  const toggleTerm = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        terms: prev.terms.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)),
      }));
    },
    [setState]
  );

  const selectAll = () =>
    setState((prev) => ({ ...prev, terms: prev.terms.map((t) => ({ ...t, selected: true })) }));
  const deselectAll = () =>
    setState((prev) => ({ ...prev, terms: prev.terms.map((t) => ({ ...t, selected: false })) }));
  const invertSelection = () =>
    setState((prev) => ({ ...prev, terms: prev.terms.map((t) => ({ ...t, selected: !t.selected })) }));

  // Merge
  const toggleMergeSelect = (id: string) => {
    setMergeSelection((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const executeMerge = (primaryId: string) => {
    setState((prev) => {
      const primary = prev.terms.find((t) => t.id === primaryId);
      if (!primary) return prev;
      const toMerge = prev.terms.filter((t) => mergeSelection.has(t.id) && t.id !== primaryId);
      const mergedPages = new Set([...primary.pages, ...toMerge.flatMap((t) => t.pages)]);
      const mergedFrom = [...(primary.mergedFrom || []), ...toMerge.map((t) => t.term)];
      const newTerms = prev.terms
        .filter((t) => !mergeSelection.has(t.id) || t.id === primaryId)
        .map((t) =>
          t.id === primaryId
            ? {
                ...t,
                pages: Array.from(mergedPages).sort((a, b) => a - b),
                mergedFrom,
                selected: true,
              }
            : t
        );
      return { ...prev, terms: newTerms };
    });
    setMergeSelection(new Set());
    setIsMerging(false);
  };

  // Edit
  const startEdit = (t: TermEntry) => {
    setEditingId(t.id);
    setEditText(t.term);
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    setState((prev) => ({
      ...prev,
      terms: prev.terms.map((t) => (t.id === editingId ? { ...t, term: editText.trim() } : t)),
    }));
    setEditingId(null);
    setEditText('');
  };

  // Add
  const addTerm = () => {
    if (!newTerm.trim()) return;
    const pages = newPages
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));
    const entry: TermEntry = {
      id: crypto.randomUUID(),
      term: newTerm.trim(),
      pages: pages.sort((a, b) => a - b),
      selected: true,
    };
    setState((prev) => ({ ...prev, terms: [...prev.terms, entry] }));
    setNewTerm('');
    setNewPages('');
    setShowAddForm(false);
  };

  // Categorize
  const handleCategorize = async () => {
    setIsCategorizing(true);
    setCategoryError('');
    try {
      const selectedTerms = state.terms.filter((t) => t.selected).map((t) => t.term);
      const result = await categorizeTerms(selectedTerms);
      setState((prev) => ({
        ...prev,
        categories: result.categories,
        useCategorized: true,
      }));
      onNext();
    } catch (err) {
      setCategoryError((err as Error).message);
    } finally {
      setIsCategorizing(false);
    }
  };

  const goToExportFlat = () => {
    setState((prev) => ({ ...prev, useCategorized: false, categories: [] }));
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
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek termen..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-warm-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
        />

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="px-3 py-2 border border-warm-300 rounded-lg text-sm"
        >
          <option value="alpha">A-Z</option>
          <option value="frequency">Meest frequent</option>
          <option value="firstPage">Eerste pagina</option>
        </select>

        <div className="flex gap-1">
          <button onClick={selectAll} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">
            Alles
          </button>
          <button onClick={deselectAll} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">
            Niets
          </button>
          <button onClick={invertSelection} className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">
            Inverteer
          </button>
        </div>

        <button
          onClick={() => setIsMerging(!isMerging)}
          className={`px-3 py-2 text-xs rounded-lg transition ${
            isMerging ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'
          }`}
        >
          {isMerging ? 'Annuleer samenvoegen' : 'Samenvoegen'}
        </button>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-3 py-2 text-xs border border-warm-300 rounded-lg hover:bg-warm-50"
        >
          + Toevoegen
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white border border-warm-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-warm-500 mb-1">Term</label>
            <input
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm"
              placeholder="Nieuwe term"
            />
          </div>
          <div className="w-48">
            <label className="block text-xs text-warm-500 mb-1">Pagina&apos;s</label>
            <input
              value={newPages}
              onChange={(e) => setNewPages(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 rounded-lg text-sm"
              placeholder="bijv. 12, 45, 78"
            />
          </div>
          <button onClick={addTerm} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">
            Voeg toe
          </button>
        </div>
      )}

      {/* Merge bar */}
      {isMerging && mergeSelection.size >= 2 && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
          <p className="text-sm text-primary-800 mb-2">
            {mergeSelection.size} termen geselecteerd. Kies de hoofdterm:
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(mergeSelection).map((id) => {
              const term = state.terms.find((t) => t.id === id);
              if (!term) return null;
              return (
                <button
                  key={id}
                  onClick={() => executeMerge(id)}
                  className="px-3 py-1 bg-primary-600 text-white rounded-full text-xs hover:bg-primary-700"
                >
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
            <thead className="bg-warm-50 sticky top-0">
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
                <tr
                  key={t.id}
                  className={`hover:bg-warm-50 transition-colors ${!t.selected ? 'opacity-50' : ''}`}
                >
                  {isMerging && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={mergeSelection.has(t.id)}
                        onChange={() => toggleMergeSelect(t.id)}
                        className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={t.selected}
                      onChange={() => toggleTerm(t.id)}
                      className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {editingId === t.id ? (
                      <div className="flex gap-2">
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                          className="flex-1 px-2 py-1 border border-primary-300 rounded text-sm"
                          autoFocus
                        />
                        <button onClick={saveEdit} className="text-xs text-primary-600 hover:underline">
                          OK
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-warm-500 hover:underline">
                          Annuleer
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-primary-900 font-medium">
                        {t.term}
                        {t.mergedFrom && t.mergedFrom.length > 0 && (
                          <span className="ml-2 text-xs text-warm-400">
                            (ook: {t.mergedFrom.join(', ')})
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-warm-500">{t.pages.length}</td>
                  <td className="px-3 py-2 text-xs text-warm-500">{compressPages(t.pages)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => startEdit(t)}
                      className="text-xs text-warm-400 hover:text-primary-600"
                    >
                      bewerk
                    </button>
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

      {/* Category error */}
      {categoryError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {categoryError}
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap justify-between gap-3">
        <button
          onClick={onPrev}
          className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition"
        >
          &larr; Vorige
        </button>

        <div className="flex gap-3">
          <button
            onClick={goToExportFlat}
            disabled={selectedCount === 0}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              selectedCount > 0
                ? 'border border-primary-300 text-primary-700 hover:bg-primary-50'
                : 'bg-warm-200 text-warm-400 cursor-not-allowed'
            }`}
          >
            Plat register &rarr;
          </button>
          <button
            onClick={handleCategorize}
            disabled={selectedCount === 0 || isCategorizing}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              selectedCount > 0 && !isCategorizing
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md'
                : 'bg-warm-200 text-warm-400 cursor-not-allowed'
            }`}
          >
            {isCategorizing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Categoriseren...
              </span>
            ) : (
              'Categoriseer & exporteer →'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
