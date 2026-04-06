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

// Display item for the outliner
interface DisplayItem {
  term: string;
  level: 1 | 2 | 3;
  parentTerm: string | null;
  pages: number[];
  hasChildren: boolean;
}

export function Step4Export({ state, setState, onPrev }: Step4Props) {
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState('');
  const [copiedFlat, setCopiedFlat] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTerm, setEditingTerm] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const editRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [dragTerm, setDragTerm] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

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

  // Build ordered display list (outliner order)
  const displayItems = useMemo(() => {
    const entryMap = new Map<string, RegisterEntry>();
    entries.forEach(e => entryMap.set(e.term, e));

    const selectedSet = new Set(selectedTerms.map(t => t.term));

    // Collect entries by level, ensuring all selected terms are included
    const allEntries: RegisterEntry[] = [];
    const seen = new Set<string>();

    for (const e of entries) {
      if (selectedSet.has(e.term) && !seen.has(e.term)) {
        allEntries.push(e);
        seen.add(e.term);
      }
    }
    for (const t of selectedTerms) {
      if (!seen.has(t.term)) {
        allEntries.push({ term: t.term, level: 1, parentTerm: null });
        seen.add(t.term);
      }
    }

    // Build child maps
    const childrenOf = new Map<string, RegisterEntry[]>();
    const level1: RegisterEntry[] = [];
    const orphans: RegisterEntry[] = [];

    for (const e of allEntries) {
      if (e.level === 1) {
        level1.push(e);
      } else if (e.parentTerm && entryMap.has(e.parentTerm) && selectedSet.has(e.parentTerm)) {
        if (!childrenOf.has(e.parentTerm)) childrenOf.set(e.parentTerm, []);
        childrenOf.get(e.parentTerm)!.push(e);
      } else {
        orphans.push(e);
      }
    }

    // Sort
    const nlSort = (a: RegisterEntry, b: RegisterEntry) => a.term.localeCompare(b.term, 'nl');
    level1.sort(nlSort);
    childrenOf.forEach(arr => arr.sort(nlSort));
    orphans.sort(nlSort);

    // Check if a term has children
    const hasChildrenSet = new Set<string>();
    for (const [parent] of childrenOf) {
      hasChildrenSet.add(parent);
    }

    // Build flat display list in hierarchy order
    const items: DisplayItem[] = [];
    const isCollapsed = (term: string) => collapsed.has(term);

    for (const l1 of level1) {
      const entry = termMap.get(l1.term);
      const hasKids = hasChildrenSet.has(l1.term);
      items.push({
        term: l1.term,
        level: 1,
        parentTerm: null,
        pages: entry?.pages || [],
        hasChildren: hasKids,
      });

      if (hasKids && !isCollapsed(l1.term)) {
        const l2children = childrenOf.get(l1.term) || [];
        for (const l2 of l2children) {
          const e2 = termMap.get(l2.term);
          const l2HasKids = hasChildrenSet.has(l2.term);
          items.push({
            term: l2.term,
            level: 2,
            parentTerm: l1.term,
            pages: e2?.pages || [],
            hasChildren: l2HasKids,
          });

          if (l2HasKids && !isCollapsed(l2.term)) {
            const l3children = childrenOf.get(l2.term) || [];
            for (const l3 of l3children) {
              const e3 = termMap.get(l3.term);
              items.push({
                term: l3.term,
                level: 3,
                parentTerm: l2.term,
                pages: e3?.pages || [],
                hasChildren: false,
              });
            }
          }
        }
      }
    }

    // Add orphans at end
    for (const o of orphans) {
      const entry = termMap.get(o.term);
      items.push({
        term: o.term,
        level: o.level,
        parentTerm: null,
        pages: entry?.pages || [],
        hasChildren: false,
      });
    }

    return items;
  }, [entries, selectedTerms, termMap, collapsed]);

  // Auto-classify on first visit
  useEffect(() => {
    if (entries.length === 0 && selectedTerms.length > 0 && !isClassifying) {
      handleClassify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Toggle collapse
  const toggleCollapse = useCallback((term: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  }, []);

  // Remove term from register
  const removeTerm = useCallback((termName: string) => {
    setState(prev => {
      const newTerms = prev.terms.map(t =>
        t.term === termName ? { ...t, selected: false } : t
      );
      const newEntries = (prev.registerEntries || []).filter(e => e.term !== termName);
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
      const newTerms = prev.terms.map(t =>
        t.term === editingTerm ? { ...t, term: newName } : t
      );
      const newEntries = (prev.registerEntries || []).map(e => ({
        ...e,
        term: e.term === editingTerm ? newName : e.term,
        parentTerm: e.parentTerm === editingTerm ? newName : e.parentTerm,
      }));
      return { ...prev, terms: newTerms, registerEntries: newEntries };
    });
    setEditingTerm(null);
  }, [editingTerm, editText, setState]);

  // Indent (→) - increase level
  const indentTerm = useCallback((termName: string) => {
    setState(prev => {
      const newEntries = [...(prev.registerEntries || [])];
      const idx = newEntries.findIndex(e => e.term === termName);
      if (idx < 0) return prev;

      const entry = newEntries[idx];
      if (entry.level >= 3) return prev; // Can't indent further

      const newLevel = (entry.level + 1) as 1 | 2 | 3;

      // Find the nearest term at the level above in display order
      // to use as parent
      let parentTerm: string | null = null;
      const targetParentLevel = (newLevel - 1) as 1 | 2 | 3;
      for (const item of displayItems) {
        if (item.term === termName) break;
        if (item.level === targetParentLevel) {
          parentTerm = item.term;
        }
      }

      newEntries[idx] = { ...entry, level: newLevel, parentTerm };
      return { ...prev, registerEntries: newEntries };
    });
  }, [setState, displayItems]);

  // Outdent (←) - decrease level
  const outdentTerm = useCallback((termName: string) => {
    setState(prev => {
      const newEntries = [...(prev.registerEntries || [])];
      const idx = newEntries.findIndex(e => e.term === termName);
      if (idx < 0) return prev;

      const entry = newEntries[idx];
      if (entry.level <= 1) return prev; // Can't outdent further

      const newLevel = (entry.level - 1) as 1 | 2 | 3;

      // New parent: if going from 3→2, parent = the level 1 parent of the old parent
      // If going from 2→1, parent = null
      let parentTerm: string | null = null;
      if (newLevel === 2 && entry.parentTerm) {
        // Find the parent's parent (level 1 term)
        const oldParent = newEntries.find(e => e.term === entry.parentTerm);
        parentTerm = oldParent?.parentTerm || null;
      }

      // Orphan children that pointed to this term if going to level 1
      const updated = newEntries.map(e => {
        if (e.parentTerm === termName && e.level === entry.level + 1) {
          return { ...e, parentTerm: null };
        }
        return e;
      });

      const myIdx = updated.findIndex(e => e.term === termName);
      updated[myIdx] = { ...updated[myIdx], level: newLevel, parentTerm };

      return { ...prev, registerEntries: updated };
    });
  }, [setState]);

  // Drag and drop for reordering
  const handleDragStart = useCallback((e: React.DragEvent, term: string) => {
    setDragTerm(term);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragTerm(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!dragTerm) return;

    const sourceIndex = displayItems.findIndex(item => item.term === dragTerm);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDragTerm(null);
      setDropTarget(null);
      return;
    }

    // Determine the new parent based on the drop position
    // Look at the item above the drop position to determine context
    const targetItem = displayItems[targetIndex];
    const itemAbove = targetIndex > 0 ? displayItems[targetIndex - 1] : null;
    const dragEntry = entries.find(e => e.term === dragTerm);
    if (!dragEntry) return;

    setState(prev => {
      const newEntries = [...(prev.registerEntries || [])];
      const idx = newEntries.findIndex(e => e.term === dragTerm);
      if (idx < 0) return prev;

      // Keep the same level, but update parent based on new position
      let newParent = newEntries[idx].parentTerm;
      const level = newEntries[idx].level;

      if (level === 2) {
        // Find the nearest level 1 term above the target position
        let foundParent: string | null = null;
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (displayItems[i] && displayItems[i].level === 1) {
            foundParent = displayItems[i].term;
            break;
          }
        }
        newParent = foundParent;
      } else if (level === 3) {
        let foundParent: string | null = null;
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (displayItems[i] && displayItems[i].level === 2) {
            foundParent = displayItems[i].term;
            break;
          }
        }
        newParent = foundParent;
      }

      newEntries[idx] = { ...newEntries[idx], parentTerm: newParent };
      return { ...prev, registerEntries: newEntries };
    });

    setDragTerm(null);
    setDropTarget(null);
  }, [dragTerm, displayItems, entries, setState]);

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

  // Level stats
  const levelCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const item of displayItems) {
      counts[item.level]++;
    }
    return counts;
  }, [displayItems]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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

      {/* Outliner view */}
      {useCat && !isClassifying && (
        <div>
          {/* Level stats */}
          <div className="flex items-center gap-4 mb-3">
            <p className="text-xs text-warm-500">
              Sleep het ⠿ icoon om te verplaatsen. Gebruik ← → om inspringniveau te wijzigen. Klik op tekst om te bewerken.
            </p>
            <div className="ml-auto flex gap-3 text-[10px] text-warm-400">
              <span>Niveau 1: <strong className="text-primary-600">{levelCounts[1]}</strong></span>
              <span>Niveau 2: <strong className="text-indigo-600">{levelCounts[2]}</strong></span>
              <span>Niveau 3: <strong className="text-violet-600">{levelCounts[3]}</strong></span>
            </div>
          </div>

          <div className="bg-white border border-warm-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-warm-100 max-h-[65vh] overflow-y-auto">
              {displayItems.map((item, index) => {
                const isEditing = editingTerm === item.term;
                const isDragging = dragTerm === item.term;
                const isDropTarget = dropTarget === index;
                const indent = (item.level - 1) * 28;

                const levelColors = {
                  1: 'border-l-primary-500',
                  2: 'border-l-indigo-400',
                  3: 'border-l-violet-400',
                };

                return (
                  <div key={item.term}>
                    {/* Drop indicator line */}
                    {isDropTarget && dragTerm && dragTerm !== item.term && (
                      <div className="h-0.5 bg-primary-500 mx-2" />
                    )}
                    <div
                      className={`flex items-center gap-2 py-2 pr-3 border-l-3 transition-colors ${levelColors[item.level]} ${
                        isDragging ? 'opacity-40 bg-primary-50' : 'hover:bg-warm-50'
                      }`}
                      style={{ paddingLeft: `${12 + indent}px` }}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      {/* Drag handle */}
                      <span
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.term)}
                        onDragEnd={handleDragEnd}
                        className="cursor-grab active:cursor-grabbing text-warm-300 hover:text-warm-500 select-none flex-shrink-0 text-sm"
                        title="Sleep om te verplaatsen"
                      >
                        ⠿
                      </span>

                      {/* Collapse toggle for items with children */}
                      {item.hasChildren ? (
                        <button
                          onClick={() => toggleCollapse(item.term)}
                          className="w-4 h-4 flex items-center justify-center text-warm-400 hover:text-warm-600 flex-shrink-0 text-xs"
                        >
                          {collapsed.has(item.term) ? '▸' : '▾'}
                        </button>
                      ) : (
                        <span className="w-4 flex-shrink-0" />
                      )}

                      {/* Term text */}
                      <div className="flex-1 min-w-0 flex items-center gap-2">
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
                            className="bg-white border border-primary-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary-400 w-full max-w-xs"
                          />
                        ) : (
                          <>
                            <span
                              className={`text-sm truncate cursor-text hover:text-primary-700 ${
                                item.level === 1 ? 'font-semibold text-warm-900' :
                                item.level === 2 ? 'font-medium text-warm-800' :
                                'text-warm-700'
                              }`}
                              onClick={() => startEdit(item.term)}
                              title={`${item.term} — klik om te bewerken`}
                            >
                              {item.term}
                            </span>
                            <span className="text-[10px] text-warm-400 flex-shrink-0 tabular-nums">
                              {compressPages(item.pages)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Level indicator */}
                      {!isEditing && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                          item.level === 1 ? 'bg-primary-100 text-primary-600' :
                          item.level === 2 ? 'bg-indigo-100 text-indigo-600' :
                          'bg-violet-100 text-violet-600'
                        }`}>
                          N{item.level}
                        </span>
                      )}

                      {/* Action buttons */}
                      {!isEditing && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => outdentTerm(item.term)}
                            disabled={item.level <= 1}
                            className={`w-6 h-6 flex items-center justify-center rounded text-xs transition ${
                              item.level <= 1
                                ? 'text-warm-200 cursor-not-allowed'
                                : 'text-warm-400 hover:text-primary-600 hover:bg-primary-50'
                            }`}
                            title="Niveau omhoog (←)"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => indentTerm(item.term)}
                            disabled={item.level >= 3}
                            className={`w-6 h-6 flex items-center justify-center rounded text-xs transition ${
                              item.level >= 3
                                ? 'text-warm-200 cursor-not-allowed'
                                : 'text-warm-400 hover:text-primary-600 hover:bg-primary-50'
                            }`}
                            title="Niveau omlaag (→)"
                          >
                            →
                          </button>
                          <button
                            onClick={() => removeTerm(item.term)}
                            className="w-6 h-6 flex items-center justify-center rounded text-xs text-warm-300 hover:text-red-500 hover:bg-red-50 transition"
                            title="Verwijder uit register"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Final drop zone */}
              {dragTerm && (
                <div
                  className={`py-4 text-center text-xs text-warm-300 ${
                    dropTarget === displayItems.length ? 'bg-primary-50' : ''
                  }`}
                  onDragOver={(e) => handleDragOver(e, displayItems.length)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => handleDrop(e, displayItems.length)}
                >
                  Sleep hierheen om onderaan te plaatsen
                </div>
              )}

              {displayItems.length === 0 && !isClassifying && (
                <div className="p-8 text-center text-warm-400 text-sm">
                  Geen termen. Klik op "AI classificering" om te beginnen.
                </div>
              )}
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
