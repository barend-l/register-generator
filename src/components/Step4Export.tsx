import { useState, useMemo, useCallback, useEffect } from 'react';
import { categorizeTerms } from '../ai';
import {
  exportFlatDocx,
  exportCategorizedDocx,
  generateFlatRegister,
  generateCategorizedText,
} from '../exportDocx';
import type { AppState, Category } from '../types';

interface Step4Props {
  state: AppState;
  setState: (fn: (prev: AppState) => AppState) => void;
  onPrev: () => void;
}

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

// Safe accessors for categories
function safeSubcategories(cat: Category) {
  return Array.isArray(cat.subcategories) ? cat.subcategories : [];
}

function safeTerms(sub: { terms?: string[] }) {
  return Array.isArray(sub.terms) ? sub.terms : [];
}

export function Step4Export({ state, setState, onPrev }: Step4Props) {
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [catError, setCatError] = useState('');
  const [copiedFlat, setCopiedFlat] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);

  // Drag state
  const [dragTerm, setDragTerm] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<{ catIdx: number; subIdx: number } | null>(null);

  const useCat = state.useCategorized && state.categories.length > 0;
  const selectedTerms = state.terms.filter(t => t.selected && t.term && t.term.length > 0);
  const termMap = useMemo(() => {
    const m = new Map<string, typeof selectedTerms[0]>();
    selectedTerms.forEach(t => m.set(t.term, t));
    return m;
  }, [selectedTerms]);

  // Auto-categorize on first visit if no categories yet
  useEffect(() => {
    if (state.categories.length === 0 && selectedTerms.length > 0 && !isCategorizing) {
      handleCategorize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCategorize = async () => {
    setIsCategorizing(true);
    setCatError('');
    try {
      const terms = selectedTerms.map(t => t.term);
      const result = await categorizeTerms(terms);
      setState(prev => ({
        ...prev,
        categories: result.categories,
        useCategorized: true,
      }));
    } catch (err) {
      setCatError((err as Error).message);
    } finally {
      setIsCategorizing(false);
    }
  };

  // Category editing
  const updateCategoryName = useCallback((catIdx: number, name: string) => {
    setState(prev => ({
      ...prev,
      categories: prev.categories.map((c, i) => i === catIdx ? { ...c, name } : c),
    }));
  }, [setState]);

  const updateSubcategoryName = useCallback((catIdx: number, subIdx: number, name: string) => {
    setState(prev => ({
      ...prev,
      categories: prev.categories.map((c, ci) =>
        ci === catIdx ? { ...c, subcategories: safeSubcategories(c).map((s, si) => si === subIdx ? { ...s, name } : s) } : c
      ),
    }));
  }, [setState]);

  const addCategory = useCallback(() => {
    if (!newCatName.trim()) return;
    setState(prev => ({
      ...prev,
      categories: [...prev.categories, { name: newCatName.trim(), subcategories: [{ name: newCatName.trim(), terms: [] }] }],
    }));
    setNewCatName('');
    setShowNewCat(false);
  }, [newCatName, setState]);

  const removeCategory = useCallback((catIdx: number) => {
    setState(prev => {
      const cat = prev.categories[catIdx];
      // Move orphaned terms to "Overig" or last category
      const orphans = safeSubcategories(cat).flatMap(s => safeTerms(s));
      const newCats = prev.categories.filter((_, i) => i !== catIdx);
      if (orphans.length > 0 && newCats.length > 0) {
        const lastCat = newCats[newCats.length - 1];
        const subs = safeSubcategories(lastCat);
        if (subs.length > 0) {
          subs[subs.length - 1] = { ...subs[subs.length - 1], terms: [...safeTerms(subs[subs.length - 1]), ...orphans] };
        } else {
          newCats[newCats.length - 1] = { ...lastCat, subcategories: [{ name: '', terms: orphans }] };
        }
      }
      return { ...prev, categories: newCats };
    });
  }, [setState]);

  const addSubcategory = useCallback((catIdx: number) => {
    setState(prev => ({
      ...prev,
      categories: prev.categories.map((c, i) =>
        i === catIdx ? { ...c, subcategories: [...safeSubcategories(c), { name: 'Nieuwe subcategorie', terms: [] }] } : c
      ),
    }));
  }, [setState]);

  // Drag & drop
  const handleDragStart = useCallback((term: string, catIdx: number, subIdx: number) => {
    setDragTerm(term);
    setDragFrom({ catIdx, subIdx });
  }, []);

  const handleDrop = useCallback((toCatIdx: number, toSubIdx: number) => {
    if (!dragTerm || !dragFrom) return;
    if (dragFrom.catIdx === toCatIdx && dragFrom.subIdx === toSubIdx) return;

    setState(prev => {
      const cats = JSON.parse(JSON.stringify(prev.categories)) as Category[];
      // Remove from source
      const srcSub = safeSubcategories(cats[dragFrom.catIdx])[dragFrom.subIdx];
      if (srcSub) srcSub.terms = safeTerms(srcSub).filter(t => t !== dragTerm);
      // Add to target
      const tgtCat = cats[toCatIdx];
      const tgtSubs = safeSubcategories(tgtCat);
      if (tgtSubs[toSubIdx]) {
        tgtSubs[toSubIdx].terms = [...safeTerms(tgtSubs[toSubIdx]), dragTerm!];
      }
      return { ...prev, categories: cats };
    });
    setDragTerm(null);
    setDragFrom(null);
  }, [dragTerm, dragFrom, setState]);

  // Find uncategorized terms
  const categorizedTermNames = useMemo(() => {
    const set = new Set<string>();
    (state.categories || []).forEach(c =>
      safeSubcategories(c).forEach(s =>
        safeTerms(s).forEach(t => set.add(t))
      )
    );
    return set;
  }, [state.categories]);

  const uncategorizedTerms = useMemo(() =>
    selectedTerms.filter(t => !categorizedTermNames.has(t.term)),
    [selectedTerms, categorizedTermNames]
  );

  // Preview text
  const previewText = useMemo(() => {
    try {
      if (useCat) return generateCategorizedText(state.terms, state.categories);
      return generateFlatRegister(state.terms);
    } catch { return '(Fout bij preview)'; }
  }, [state.terms, state.categories, useCat]);

  const handleExport = async () => {
    try {
      if (useCat) await exportCategorizedDocx(state.terms, state.categories, state.fontFamily, state.fontSize);
      else await exportFlatDocx(state.terms, state.fontFamily, state.fontSize);
    } catch (err) { alert('Fout bij exporteren: ' + (err as Error).message); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewText);
    setCopiedFlat(true);
    setTimeout(() => setCopiedFlat(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-900">Register samenstellen</h1>
        <p className="text-warm-500 mt-2">
          {isCategorizing ? 'AI categoriseert je termen...' : `${selectedTerms.length} termen in je register`}
        </p>
      </div>

      {/* Top controls */}
      <div className="bg-white border border-warm-200 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <button onClick={() => setState(prev => ({ ...prev, useCategorized: true }))}
            className={`px-4 py-2 rounded-lg text-sm transition ${useCat ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'}`}>
            Gecategoriseerd
          </button>
          <button onClick={() => setState(prev => ({ ...prev, useCategorized: false }))}
            className={`px-4 py-2 rounded-lg text-sm transition ${!useCat ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'}`}>
            Plat (A-Z)
          </button>
        </div>

        <button onClick={handleCategorize} disabled={isCategorizing}
          className="px-4 py-2 text-xs border border-primary-300 text-primary-700 rounded-lg hover:bg-primary-50 transition flex items-center gap-2">
          {isCategorizing && <span className="w-3 h-3 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin" />}
          {state.categories.length > 0 ? '✨ Opnieuw categoriseren' : '✨ AI categorisering'}
        </button>

        <div className="ml-auto flex gap-2 items-center">
          <span className="text-xs text-warm-400">Lettertype:</span>
          <select value={state.fontFamily} onChange={(e) => setState(prev => ({ ...prev, fontFamily: e.target.value }))}
            className="px-2 py-1 border border-warm-300 rounded text-xs">
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Calibri">Calibri</option>
            <option value="Garamond">Garamond</option>
            <option value="Georgia">Georgia</option>
          </select>
          <select value={state.fontSize} onChange={(e) => setState(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
            className="px-2 py-1 border border-warm-300 rounded text-xs">
            {[8, 9, 10, 11, 12].map(s => <option key={s} value={s}>{s}pt</option>)}
          </select>
        </div>
      </div>

      {catError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{catError}</div>
      )}

      {/* Loading state */}
      {isCategorizing && (
        <div className="bg-white border border-warm-200 rounded-xl p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-warm-600 font-medium">AI categoriseert {selectedTerms.length} termen...</p>
          <p className="text-xs text-warm-400">Dit kan even duren bij veel termen.</p>
        </div>
      )}

      {/* Visual Category Editor */}
      {useCat && !isCategorizing && state.categories.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-warm-500">Sleep termen tussen categorieën. Klik op namen om te bewerken.</p>
            <button onClick={() => setShowNewCat(true)}
              className="px-3 py-1 text-xs border border-warm-300 rounded-lg hover:bg-warm-50">
              + Categorie toevoegen
            </button>
          </div>

          {showNewCat && (
            <div className="flex gap-2 items-center">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategory()}
                placeholder="Naam nieuwe categorie" autoFocus
                className="px-3 py-2 border border-warm-300 rounded-lg text-sm flex-1" />
              <button onClick={addCategory} className="px-3 py-2 bg-primary-600 text-white rounded-lg text-xs">Toevoegen</button>
              <button onClick={() => setShowNewCat(false)} className="px-3 py-2 text-xs text-warm-500">Annuleer</button>
            </div>
          )}

          {state.categories.map((cat, catIdx) => (
            <div key={catIdx}
              className="bg-white border border-warm-200 rounded-xl overflow-hidden"
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                const subs = safeSubcategories(cat);
                handleDrop(catIdx, subs.length > 0 ? 0 : 0);
              }}>
              {/* Category header */}
              <div className="bg-primary-50 px-4 py-3 flex items-center justify-between border-b border-primary-100">
                {editingCat === `${catIdx}` ? (
                  <input value={cat.name}
                    onChange={e => updateCategoryName(catIdx, e.target.value)}
                    onBlur={() => setEditingCat(null)}
                    onKeyDown={e => e.key === 'Enter' && setEditingCat(null)}
                    className="font-semibold text-primary-900 text-sm bg-white px-2 py-1 rounded border border-primary-300 outline-none"
                    autoFocus />
                ) : (
                  <h3 className="font-semibold text-primary-900 text-sm cursor-pointer hover:text-primary-700"
                    onClick={() => setEditingCat(`${catIdx}`)}>
                    {cat.name}
                  </h3>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-primary-500">
                    {safeSubcategories(cat).reduce((sum, s) => sum + safeTerms(s).length, 0)} termen
                  </span>
                  <button onClick={() => addSubcategory(catIdx)}
                    className="text-xs text-primary-600 hover:text-primary-800">+ sub</button>
                  <button onClick={() => removeCategory(catIdx)}
                    className="text-xs text-red-400 hover:text-red-600 ml-1">✕</button>
                </div>
              </div>

              {/* Subcategories */}
              <div className="p-3 space-y-3">
                {safeSubcategories(cat).map((sub, subIdx) => (
                  <div key={subIdx}
                    className={`rounded-lg p-3 transition-colors ${dragTerm ? 'bg-primary-50/50 border-2 border-dashed border-primary-200' : 'bg-warm-50'}`}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => { e.stopPropagation(); handleDrop(catIdx, subIdx); }}>
                    {/* Subcategory label */}
                    {(safeSubcategories(cat).length > 1 || (sub.name && sub.name !== cat.name)) && (
                      editingSub === `${catIdx}-${subIdx}` ? (
                        <input value={sub.name || ''}
                          onChange={e => updateSubcategoryName(catIdx, subIdx, e.target.value)}
                          onBlur={() => setEditingSub(null)}
                          onKeyDown={e => e.key === 'Enter' && setEditingSub(null)}
                          className="text-xs font-medium text-warm-600 bg-white px-2 py-1 rounded border border-warm-300 outline-none mb-2 block"
                          autoFocus />
                      ) : (
                        <p className="text-xs font-medium text-warm-600 mb-2 cursor-pointer hover:text-primary-600"
                          onClick={() => setEditingSub(`${catIdx}-${subIdx}`)}>
                          {sub.name || '(naamloos)'}
                        </p>
                      )
                    )}

                    {/* Term chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {safeTerms(sub).map(termName => {
                        const entry = termMap.get(termName);
                        return (
                          <div key={termName}
                            draggable
                            onDragStart={() => handleDragStart(termName, catIdx, subIdx)}
                            onDragEnd={() => { setDragTerm(null); setDragFrom(null); }}
                            className={`group inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs cursor-grab active:cursor-grabbing transition-all ${
                              dragTerm === termName
                                ? 'bg-primary-200 text-primary-900 shadow-md scale-105'
                                : 'bg-white border border-warm-200 text-warm-800 hover:border-primary-300 hover:shadow-sm'
                            }`}>
                            <span className="font-medium">{termName}</span>
                            {entry && (
                              <span className="text-warm-400 text-[10px]">({compressPages(entry.pages)})</span>
                            )}
                          </div>
                        );
                      })}
                      {safeTerms(sub).length === 0 && (
                        <span className="text-xs text-warm-300 italic py-1">Sleep termen hierheen</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Uncategorized terms */}
          {uncategorizedTerms.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                Niet gecategoriseerd ({uncategorizedTerms.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {uncategorizedTerms.map(t => (
                  <div key={t.id}
                    draggable
                    onDragStart={() => setDragTerm(t.term)}
                    onDragEnd={() => { setDragTerm(null); setDragFrom(null); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-200 rounded-md text-xs cursor-grab active:cursor-grabbing hover:border-primary-300">
                    <span className="font-medium">{t.term}</span>
                    <span className="text-warm-400 text-[10px]">({compressPages(t.pages)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Flat register preview (non-categorized mode) */}
      {!useCat && !isCategorizing && (
        <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
          <div className="bg-warm-50 px-6 py-3 border-b border-warm-200">
            <h3 className="text-sm font-semibold text-warm-700">Plat register (A-Z)</h3>
          </div>
          <pre className="p-6 text-sm text-warm-800 font-mono whitespace-pre-wrap max-h-[50vh] overflow-y-auto leading-relaxed">
            {previewText}
          </pre>
        </div>
      )}

      {/* Preview toggle for categorized */}
      {useCat && !isCategorizing && state.categories.length > 0 && (
        <div>
          <button onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-primary-600 hover:underline mb-2">
            {showPreview ? '▲ Verberg tekstpreview' : '▼ Toon tekstpreview'}
          </button>
          {showPreview && (
            <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
              <pre className="p-6 text-sm text-warm-800 font-mono whitespace-pre-wrap max-h-[40vh] overflow-y-auto leading-relaxed">
                {previewText}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex flex-wrap justify-between gap-3">
        <button onClick={onPrev}
          className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition">
          &larr; Vorige
        </button>
        <div className="flex gap-3">
          <button onClick={handleCopy}
            className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition">
            {copiedFlat ? '✓ Gekopieerd!' : 'Kopieer als tekst'}
          </button>
          <button onClick={handleExport}
            className="px-8 py-3 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 shadow-md transition">
            Download als Word
          </button>
        </div>
      </div>
    </div>
  );
}
