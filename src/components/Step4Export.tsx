import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { classifyTermLevels } from '../ai';
import {
  exportFlatDocx,
  exportHierarchicalDocx,
  generateFlatRegister,
  generateHierarchicalText,
} from '../exportDocx';
import type { AppState, RegisterEntry } from '../types';

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

export function Step4Export({ state, setState, onPrev }: Step4Props) {
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState('');
  const [copiedFlat, setCopiedFlat] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTerm, setEditingTerm] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [dragTerm, setDragTerm] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const useCat = state.useCategorized;
  const selectedTerms = useMemo(() =>
    state.terms.filter(t => t.selected && t.term && t.term.length > 0),
    [state.terms]
  );

  const termMap = useMemo(() => {
    const m = new Map<string, typeof selectedTerms[0]>();
    selectedTerms.forEach(t => m.set(t.term, t));
    return m;
  }, [selectedTerms]);

  const entries = state.registerEntries || [];

  // Build level maps
  const { level1, level2Grouped, level3Grouped, unassigned2, unassigned3 } = useMemo(() => {
    const entryMap = new Map<string, RegisterEntry>();
    entries.forEach(e => entryMap.set(e.term, e));

    const l1: RegisterEntry[] = [];
    const l2: RegisterEntry[] = [];
    const l3: RegisterEntry[] = [];

    // Only include entries for terms that are still selected
    const selectedSet = new Set(selectedTerms.map(t => t.term));

    for (const e of entries) {
      if (!selectedSet.has(e.term)) continue;
      if (e.level === 1) l1.push(e);
      else if (e.level === 2) l2.push(e);
      else if (e.level === 3) l3.push(e);
    }

    // Add any selected terms not in registerEntries as level 1
    for (const t of selectedTerms) {
      if (!entryMap.has(t.term)) {
        const newEntry: RegisterEntry = { term: t.term, level: 1, parentTerm: null };
        l1.push(newEntry);
      }
    }

    // Sort all alphabetically
    const nlSort = (a: RegisterEntry, b: RegisterEntry) => a.term.localeCompare(b.term, 'nl');
    l1.sort(nlSort);
    l2.sort(nlSort);
    l3.sort(nlSort);

    // Group level 2 by parent
    const l2g = new Map<string, RegisterEntry[]>();
    const unassigned2: RegisterEntry[] = [];
    const l1Set = new Set(l1.map(e => e.term));
    for (const e of l2) {
      if (e.parentTerm && l1Set.has(e.parentTerm)) {
        if (!l2g.has(e.parentTerm)) l2g.set(e.parentTerm, []);
        l2g.get(e.parentTerm)!.push(e);
      } else {
        unassigned2.push(e);
      }
    }

    // Group level 3 by parent
    const l3g = new Map<string, RegisterEntry[]>();
    const unassigned3: RegisterEntry[] = [];
    const l2Set = new Set(l2.map(e => e.term));
    for (const e of l3) {
      if (e.parentTerm && l2Set.has(e.parentTerm)) {
        if (!l3g.has(e.parentTerm)) l3g.set(e.parentTerm, []);
        l3g.get(e.parentTerm)!.push(e);
      } else {
        unassigned3.push(e);
      }
    }

    return { level1: l1, level2Grouped: l2g, level3Grouped: l3g, unassigned2, unassigned3 };
  }, [entries, selectedTerms]);

  // Auto-classify on first visit if no entries
  useEffect(() => {
    if (entries.length === 0 && selectedTerms.length > 0 && !isClassifying) {
      handleClassify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus edit input
  useEffect(() => {
    if (editingTerm && editRef.current) editRef.current.focus();
  }, [editingTerm]);

  const handleClassify = async () => {
    setIsClassifying(true);
    setClassifyError('');
    try {
      const termNames = selectedTerms.map(t => t.term);
      const result = await classifyTermLevels(termNames);
      const newEntries: RegisterEntry[] = result.map(r => ({
        term: r.term,
        level: r.level,
        parentTerm: r.parent,
      }));
      setState(prev => ({
        ...prev,
        registerEntries: newEntries,
        useCategorized: true,
      }));
    } catch (err) {
      setClassifyError((err as Error).message);
    } finally {
      setIsClassifying(false);
    }
  };

  // Remove term from register (deselect)
  const removeTerm = useCallback((termName: string) => {
    setState(prev => {
      // Deselect the term
      const newTerms = prev.terms.map(t =>
        t.term === termName ? { ...t, selected: false } : t
      );
      // Remove from registerEntries
      const newEntries = (prev.registerEntries || []).filter(e => e.term !== termName);
      // Also clear any parent references to this term
      const cleaned = newEntries.map(e =>
        e.parentTerm === termName ? { ...e, parentTerm: null } : e
      );
      return { ...prev, terms: newTerms, registerEntries: cleaned };
    });
  }, [setState]);

  // Edit term name
  const startEdit = useCallback((term: string) => {
    setEditingTerm(term);
    setEditText(term);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingTerm || !editText.trim() || editText.trim() === editingTerm) {
      setEditingTerm(null);
      return;
    }
    const newName = editText.trim();
    setState(prev => {
      // Update in terms array
      const newTerms = prev.terms.map(t =>
        t.term === editingTerm ? { ...t, term: newName } : t
      );
      // Update in registerEntries (both the term itself and parent references)
      const newEntries = (prev.registerEntries || []).map(e => ({
        ...e,
        term: e.term === editingTerm ? newName : e.term,
        parentTerm: e.parentTerm === editingTerm ? newName : e.parentTerm,
      }));
      return { ...prev, terms: newTerms, registerEntries: newEntries };
    });
    setEditingTerm(null);
  }, [editingTerm, editText, setState]);

  // Drag & drop handlers
  const handleDragStart = useCallback((term: string) => {
    setDragTerm(term);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragTerm(null);
    setDragOverTarget(null);
  }, []);

  const handleDropOnLevel = useCallback((targetLevel: 1 | 2 | 3, parentTerm: string | null) => {
    if (!dragTerm) return;
    setDragOverTarget(null);

    setState(prev => {
      const newEntries = [...(prev.registerEntries || [])];
      const idx = newEntries.findIndex(e => e.term === dragTerm);

      const oldLevel = idx >= 0 ? newEntries[idx].level : 1;

      if (idx >= 0) {
        newEntries[idx] = { ...newEntries[idx], level: targetLevel, parentTerm };
      } else {
        newEntries.push({ term: dragTerm!, level: targetLevel, parentTerm });
      }

      // If moving FROM level 1, orphan any level 2 children that pointed to this term
      if (oldLevel === 1 && targetLevel !== 1) {
        for (let i = 0; i < newEntries.length; i++) {
          if (newEntries[i].parentTerm === dragTerm && newEntries[i].level === 2) {
            newEntries[i] = { ...newEntries[i], parentTerm: null };
          }
        }
      }
      // If moving FROM level 2, orphan any level 3 children
      if (oldLevel === 2 && targetLevel !== 2) {
        for (let i = 0; i < newEntries.length; i++) {
          if (newEntries[i].parentTerm === dragTerm && newEntries[i].level === 3) {
            newEntries[i] = { ...newEntries[i], parentTerm: null };
          }
        }
      }

      return { ...prev, registerEntries: newEntries };
    });
    setDragTerm(null);
  }, [dragTerm, setState]);

  // Preview text
  const previewText = useMemo(() => {
    try {
      if (useCat) return generateHierarchicalText(state.terms, state.registerEntries || []);
      return generateFlatRegister(state.terms);
    } catch { return '(Fout bij preview)'; }
  }, [state.terms, state.registerEntries, useCat]);

  const handleExport = async () => {
    try {
      if (useCat) await exportHierarchicalDocx(state.terms, state.registerEntries || [], state.fontFamily, state.fontSize);
      else await exportFlatDocx(state.terms, state.fontFamily, state.fontSize);
    } catch (err) { alert('Fout bij exporteren: ' + (err as Error).message); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewText);
    setCopiedFlat(true);
    setTimeout(() => setCopiedFlat(false), 2000);
  };

  // Term chip component
  const renderTermChip = (termName: string, isDragging: boolean) => {
    const entry = termMap.get(termName);
    const isEditing = editingTerm === termName;

    return (
      <div
        key={termName}
        draggable={!isEditing}
        onDragStart={() => handleDragStart(termName)}
        onDragEnd={handleDragEnd}
        className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-all ${
          isDragging
            ? 'bg-primary-200 text-primary-900 shadow-md scale-105 opacity-50'
            : 'bg-white border border-warm-200 text-warm-800 hover:border-primary-300 hover:shadow-sm'
        } ${isEditing ? '' : 'cursor-grab active:cursor-grabbing'}`}
      >
        {isEditing ? (
          <input
            ref={editRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditingTerm(null);
            }}
            className="bg-transparent outline-none border-b border-primary-400 text-xs font-medium w-24 min-w-0"
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="font-medium cursor-text hover:text-primary-700"
            onClick={(e) => { e.stopPropagation(); startEdit(termName); }}
            title="Klik om te bewerken"
          >
            {termName}
          </span>
        )}
        {entry && !isEditing && (
          <span className="text-warm-400 text-[10px]">({compressPages(entry.pages)})</span>
        )}
        {!isEditing && (
          <button
            onClick={(e) => { e.stopPropagation(); removeTerm(termName); }}
            className="text-warm-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100 ml-0.5"
            title="Verwijder uit register"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  // Drop zone component
  const renderDropZone = (
    level: 1 | 2 | 3,
    parentTerm: string | null,
    dropId: string,
    children: React.ReactNode,
    emptyText: string
  ) => {
    const isOver = dragOverTarget === dropId;
    return (
      <div
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverTarget(dropId); }}
        onDragLeave={() => setDragOverTarget(null)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDropOnLevel(level, parentTerm); }}
        className={`min-h-[40px] rounded-lg p-2 transition-colors ${
          isOver && dragTerm
            ? 'bg-primary-100 border-2 border-dashed border-primary-400'
            : dragTerm
              ? 'border-2 border-dashed border-warm-200'
              : ''
        }`}
      >
        <div className="flex flex-wrap gap-1.5">
          {children}
        </div>
        {!children && (
          <span className="text-xs text-warm-300 italic">{emptyText}</span>
        )}
      </div>
    );
  };

  // Get level 2 terms that are parents of level 3 terms (for column 3 grouping)
  const level2Terms = useMemo(() => {
    const l2: RegisterEntry[] = [];
    const selectedSet = new Set(selectedTerms.map(t => t.term));
    for (const e of entries) {
      if (e.level === 2 && selectedSet.has(e.term)) l2.push(e);
    }
    return l2.sort((a, b) => a.term.localeCompare(b.term, 'nl'));
  }, [entries, selectedTerms]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary-900">Register samenstellen</h1>
        <p className="text-warm-500 mt-2">
          {isClassifying ? 'AI classificeert je termen...' : `${selectedTerms.length} termen in je register`}
        </p>
      </div>

      {/* Top controls */}
      <div className="bg-white border border-warm-200 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <button onClick={() => setState(prev => ({ ...prev, useCategorized: true }))}
            className={`px-4 py-2 rounded-lg text-sm transition ${useCat ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'}`}>
            Hiërarchisch
          </button>
          <button onClick={() => setState(prev => ({ ...prev, useCategorized: false }))}
            className={`px-4 py-2 rounded-lg text-sm transition ${!useCat ? 'bg-primary-600 text-white' : 'border border-warm-300 hover:bg-warm-50'}`}>
            Plat (A-Z)
          </button>
        </div>

        <button onClick={handleClassify} disabled={isClassifying}
          className="px-4 py-2 text-xs border border-primary-300 text-primary-700 rounded-lg hover:bg-primary-50 transition flex items-center gap-2">
          {isClassifying && <span className="w-3 h-3 border-2 border-primary-300 border-t-primary-700 rounded-full animate-spin" />}
          {entries.length > 0 ? 'Opnieuw classificeren' : 'AI classificering'}
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

      {classifyError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{classifyError}</div>
      )}

      {/* Loading state */}
      {isClassifying && (
        <div className="bg-white border border-warm-200 rounded-xl p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-warm-600 font-medium">AI classificeert {selectedTerms.length} termen in niveaus...</p>
          <p className="text-xs text-warm-400">De AI bepaalt welke termen hoofdtermen, subtermen en sub-subtermen zijn.</p>
        </div>
      )}

      {/* Three-column hierarchical editor */}
      {useCat && !isClassifying && (
        <div>
          <p className="text-xs text-warm-500 mb-3">
            Sleep termen tussen kolommen om het niveau te wijzigen. Klik op een term om de tekst te bewerken. Klik ✕ om te verwijderen.
          </p>

          <div className="grid grid-cols-3 gap-4">
            {/* Column 1: Level 1 - Hoofdtermen */}
            <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
              <div className="bg-primary-50 px-4 py-3 border-b border-primary-100">
                <h3 className="font-semibold text-primary-900 text-sm">Niveau 1 — Hoofdtermen</h3>
                <span className="text-xs text-primary-500">{level1.length} termen</span>
              </div>
              <div className="p-3 max-h-[60vh] overflow-y-auto">
                {renderDropZone(1, null, 'col-1', (
                  level1.length > 0 ? (
                    <>
                      {level1.map(e => renderTermChip(e.term, dragTerm === e.term))}
                    </>
                  ) : null
                ), 'Sleep termen hierheen voor niveau 1')}
              </div>
            </div>

            {/* Column 2: Level 2 - Subtermen */}
            <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
              <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100">
                <h3 className="font-semibold text-indigo-900 text-sm">Niveau 2 — Subtermen</h3>
                <span className="text-xs text-indigo-500">
                  {Array.from(level2Grouped.values()).reduce((s, a) => s + a.length, 0) + unassigned2.length} termen
                </span>
              </div>
              <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                {/* Grouped by parent (level 1 terms) */}
                {level1.map(parent => {
                  const children = level2Grouped.get(parent.term) || [];
                  return (
                    <div key={parent.term}>
                      <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-1 truncate" title={parent.term}>
                        ▸ {parent.term}
                      </p>
                      {renderDropZone(2, parent.term, `col-2-${parent.term}`, (
                        children.length > 0 ? (
                          <>
                            {children.map(e => renderTermChip(e.term, dragTerm === e.term))}
                          </>
                        ) : null
                      ), 'Sleep hierheen')}
                    </div>
                  );
                })}

                {/* Unassigned level 2 terms */}
                {unassigned2.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1">
                      Niet toegewezen
                    </p>
                    {renderDropZone(2, null, 'col-2-unassigned', (
                      <>
                        {unassigned2.map(e => renderTermChip(e.term, dragTerm === e.term))}
                      </>
                    ), '')}
                  </div>
                )}

                {/* General drop zone if empty */}
                {level1.length === 0 && unassigned2.length === 0 && (
                  renderDropZone(2, null, 'col-2-empty', null, 'Sleep termen hierheen voor niveau 2')
                )}
              </div>
            </div>

            {/* Column 3: Level 3 - Sub-subtermen */}
            <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
              <div className="bg-violet-50 px-4 py-3 border-b border-violet-100">
                <h3 className="font-semibold text-violet-900 text-sm">Niveau 3 — Sub-subtermen</h3>
                <span className="text-xs text-violet-500">
                  {Array.from(level3Grouped.values()).reduce((s, a) => s + a.length, 0) + unassigned3.length} termen
                </span>
              </div>
              <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                {/* Grouped by parent (level 2 terms) */}
                {level2Terms.map(parent => {
                  const children = level3Grouped.get(parent.term) || [];
                  if (children.length === 0 && !dragTerm) return null;
                  return (
                    <div key={parent.term}>
                      <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-1 truncate" title={parent.term}>
                        ▸ {parent.term}
                      </p>
                      {renderDropZone(3, parent.term, `col-3-${parent.term}`, (
                        children.length > 0 ? (
                          <>
                            {children.map(e => renderTermChip(e.term, dragTerm === e.term))}
                          </>
                        ) : null
                      ), 'Sleep hierheen')}
                    </div>
                  );
                })}

                {/* Unassigned level 3 terms */}
                {unassigned3.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide mb-1">
                      Niet toegewezen
                    </p>
                    {renderDropZone(3, null, 'col-3-unassigned', (
                      <>
                        {unassigned3.map(e => renderTermChip(e.term, dragTerm === e.term))}
                      </>
                    ), '')}
                  </div>
                )}

                {/* General drop zone if no level 2 parents */}
                {level2Terms.length === 0 && unassigned3.length === 0 && (
                  renderDropZone(3, null, 'col-3-empty', null, 'Sleep termen hierheen voor niveau 3')
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flat register preview */}
      {!useCat && !isClassifying && (
        <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
          <div className="bg-warm-50 px-6 py-3 border-b border-warm-200">
            <h3 className="text-sm font-semibold text-warm-700">Plat register (A-Z)</h3>
          </div>
          <pre className="p-6 text-sm text-warm-800 font-mono whitespace-pre-wrap max-h-[50vh] overflow-y-auto leading-relaxed">
            {previewText}
          </pre>
        </div>
      )}

      {/* Preview toggle for hierarchical */}
      {useCat && !isClassifying && entries.length > 0 && (
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
