import { useState, useMemo } from 'react';
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

export function Step4Export({ state, setState, onPrev }: Step4Props) {
  const [copiedFlat, setCopiedFlat] = useState(false);

  const useCat = state.useCategorized && state.categories.length > 0;

  // Category editing
  const updateCategoryName = (catIdx: number, name: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((c, i) => (i === catIdx ? { ...c, name } : c)),
    }));
  };

  const moveTermToCategory = (term: string, fromCatIdx: number, fromSubIdx: number, toCatIdx: number) => {
    setState((prev) => {
      const cats = JSON.parse(JSON.stringify(prev.categories)) as Category[];
      // Remove from old
      cats[fromCatIdx].subcategories[fromSubIdx].terms = cats[fromCatIdx].subcategories[fromSubIdx].terms.filter(
        (t) => t !== term
      );
      // Remove empty subcategories
      cats[fromCatIdx].subcategories = cats[fromCatIdx].subcategories.filter((s) => s.terms.length > 0);
      // Add to new
      if (cats[toCatIdx].subcategories.length === 0) {
        cats[toCatIdx].subcategories.push({ name: '', terms: [] });
      }
      cats[toCatIdx].subcategories[0].terms.push(term);
      return { ...prev, categories: cats };
    });
  };

  const previewText = useMemo(() => {
    try {
      if (useCat) {
        return generateCategorizedText(state.terms, state.categories);
      }
      return generateFlatRegister(state.terms, state.fontFamily, state.fontSize);
    } catch (err) {
      console.error('Preview generation error:', err);
      return '(Fout bij het genereren van de preview)';
    }
  }, [state.terms, state.categories, useCat, state.fontFamily, state.fontSize]);

  const handleExport = async () => {
    try {
      if (useCat) {
        await exportCategorizedDocx(state.terms, state.categories, state.fontFamily, state.fontSize);
      } else {
        await exportFlatDocx(state.terms, state.fontFamily, state.fontSize);
      }
    } catch (err) {
      alert('Fout bij het exporteren: ' + (err as Error).message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewText);
    setCopiedFlat(true);
    setTimeout(() => setCopiedFlat(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-900">Exporteren</h1>
        <p className="text-warm-500 mt-2">Bekijk en download je register.</p>
      </div>

      {/* Options */}
      <div className="bg-white border border-warm-200 rounded-xl p-6 flex flex-wrap gap-6 items-end">
        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Type register</label>
          <div className="flex gap-2">
            <button
              onClick={() => setState((prev) => ({ ...prev, useCategorized: false }))}
              className={`px-4 py-2 rounded-lg text-sm transition ${
                !useCat ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'
              }`}
            >
              Plat (A-Z)
            </button>
            <button
              onClick={() => setState((prev) => ({ ...prev, useCategorized: true }))}
              disabled={state.categories.length === 0}
              className={`px-4 py-2 rounded-lg text-sm transition ${
                useCat ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'
              } ${state.categories.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Gecategoriseerd
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Lettertype</label>
          <select
            value={state.fontFamily}
            onChange={(e) => setState((prev) => ({ ...prev, fontFamily: e.target.value }))}
            className="px-3 py-2 border border-warm-300 rounded-lg text-sm"
          >
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Calibri">Calibri</option>
            <option value="Garamond">Garamond</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-warm-700 mb-1">Lettergrootte</label>
          <select
            value={state.fontSize}
            onChange={(e) => setState((prev) => ({ ...prev, fontSize: parseInt(e.target.value) }))}
            className="px-3 py-2 border border-warm-300 rounded-lg text-sm"
          >
            {[8, 9, 10, 11, 12].map((s) => (
              <option key={s} value={s}>
                {s}pt
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category editing */}
      {useCat && (
        <div className="bg-white border border-warm-200 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-warm-700">Categorieën bewerken</h3>
          <p className="text-xs text-warm-400">
            Pas categorienamen aan of verplaats termen met de dropdown.
          </p>
          {state.categories.map((cat, catIdx) => (
            <div key={catIdx} className="border border-warm-100 rounded-lg p-4">
              <input
                value={cat.name}
                onChange={(e) => updateCategoryName(catIdx, e.target.value)}
                className="font-semibold text-primary-900 text-sm border-b border-transparent hover:border-warm-300 focus:border-primary-500 outline-none w-full mb-2 px-1 py-0.5"
              />
              {cat.subcategories.map((sub, subIdx) => (
                <div key={subIdx} className="ml-4 mt-2">
                  {sub.name && sub.name !== cat.name && (
                    <p className="text-xs font-medium text-warm-600 mb-1">{sub.name}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {sub.terms.map((term) => (
                      <div key={term} className="group flex items-center gap-1 px-2 py-1 bg-warm-50 rounded text-xs">
                        <span>{term}</span>
                        <select
                          className="opacity-0 group-hover:opacity-100 text-xs border-none bg-transparent cursor-pointer w-4 -mr-1"
                          defaultValue=""
                          onChange={(e) => {
                            const newCatIdx = parseInt(e.target.value);
                            if (!isNaN(newCatIdx) && newCatIdx !== catIdx) {
                              moveTermToCategory(term, catIdx, subIdx, newCatIdx);
                            }
                          }}
                        >
                          <option value="" disabled>
                            ↗
                          </option>
                          {state.categories.map((c, i) =>
                            i !== catIdx ? (
                              <option key={i} value={i}>
                                → {c.name}
                              </option>
                            ) : null
                          )}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
        <div className="bg-warm-50 px-6 py-3 flex items-center justify-between border-b border-warm-200">
          <h3 className="text-sm font-semibold text-warm-700">Preview</h3>
          <span className="text-xs text-warm-400">
            {state.terms.filter((t) => t.selected).length} termen
          </span>
        </div>
        <pre className="p-6 text-sm text-warm-800 font-mono whitespace-pre-wrap max-h-[50vh] overflow-y-auto leading-relaxed">
          {previewText}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-between gap-3">
        <button
          onClick={onPrev}
          className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition"
        >
          &larr; Vorige
        </button>

        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="px-6 py-3 border border-warm-300 rounded-lg text-sm font-medium hover:bg-warm-50 transition"
          >
            {copiedFlat ? '✓ Gekopieerd!' : 'Kopieer als tekst'}
          </button>
          <button
            onClick={handleExport}
            className="px-8 py-3 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 shadow-md transition"
          >
            Download als Word
          </button>
        </div>
      </div>
    </div>
  );
}
