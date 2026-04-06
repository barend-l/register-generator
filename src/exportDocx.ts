import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
} from 'docx';
import { saveAs } from 'file-saver';
import type { TermEntry, Category, RegisterEntry } from './types';

function compressPages(pages: number[]): string {
  if (!pages || pages.length === 0) return '';
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

function safeSubcategories(cat: Category) {
  return Array.isArray(cat?.subcategories) ? cat.subcategories : [];
}

function safeTerms(sub: { terms?: string[] }) {
  return Array.isArray(sub?.terms) ? sub.terms : [];
}

export function generateFlatRegister(terms: TermEntry[]): string {
  const selected = terms
    .filter((t) => t.selected && t.term && t.term.length > 0)
    .sort((a, b) => a.term.localeCompare(b.term, 'nl'));

  const lines: string[] = [];
  let currentLetter = '';

  for (const t of selected) {
    const letter = (t.term[0] || '').toUpperCase();
    if (letter !== currentLetter) {
      currentLetter = letter;
      if (lines.length > 0) lines.push('');
      lines.push(letter);
    }
    lines.push(`${t.term}  ${compressPages(t.pages)}`);
  }

  return lines.join('\n');
}

export async function exportFlatDocx(
  terms: TermEntry[],
  fontFamily: string,
  fontSize: number
) {
  const selected = terms
    .filter((t) => t.selected && t.term && t.term.length > 0)
    .sort((a, b) => a.term.localeCompare(b.term, 'nl'));

  const paragraphs: Paragraph[] = [
    new Paragraph({ text: 'Register', heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
  ];

  let currentLetter = '';
  for (const t of selected) {
    const letter = (t.term[0] || '').toUpperCase();
    if (letter !== currentLetter) {
      currentLetter = letter;
      paragraphs.push(new Paragraph({ text: letter, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }));
    }
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: `${t.term}  ${compressPages(t.pages)}`, font: fontFamily, size: fontSize * 2 })],
      spacing: { after: 40 },
    }));
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'register.docx');
}

export async function exportCategorizedDocx(
  terms: TermEntry[],
  categories: Category[],
  fontFamily: string,
  fontSize: number
) {
  const termMap = new Map<string, TermEntry>();
  terms.filter((t) => t.selected).forEach((t) => termMap.set(t.term, t));

  const paragraphs: Paragraph[] = [
    new Paragraph({ text: 'Register', heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
  ];

  for (const cat of (categories || [])) {
    paragraphs.push(new Paragraph({ text: cat.name, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } }));

    for (const sub of safeSubcategories(cat)) {
      if (sub.name && sub.name !== cat.name) {
        paragraphs.push(new Paragraph({ text: sub.name, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 }, indent: { left: 360 } }));
      }

      const sortedTerms = [...safeTerms(sub)].sort((a, b) => a.localeCompare(b, 'nl'));
      for (const termName of sortedTerms) {
        const entry = termMap.get(termName);
        if (!entry) continue;
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: `${entry.term}  ${compressPages(entry.pages)}`, font: fontFamily, size: fontSize * 2 })],
          spacing: { after: 40 },
          indent: { left: sub.name && sub.name !== cat.name ? 720 : 360 },
        }));
      }
    }
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'register.docx');
}

export function generateCategorizedText(
  terms: TermEntry[],
  categories: Category[]
): string {
  const termMap = new Map<string, TermEntry>();
  terms.filter((t) => t.selected).forEach((t) => termMap.set(t.term, t));

  const lines: string[] = [];

  for (const cat of (categories || [])) {
    if (lines.length > 0) lines.push('');
    lines.push(cat.name);

    for (const sub of safeSubcategories(cat)) {
      if (sub.name && sub.name !== cat.name) {
        lines.push(`   ${sub.name}`);
      }

      const sortedTerms = [...safeTerms(sub)].sort((a, b) => a.localeCompare(b, 'nl'));
      for (const termName of sortedTerms) {
        const entry = termMap.get(termName);
        if (!entry) continue;
        const indent = sub.name && sub.name !== cat.name ? '      ' : '   ';
        lines.push(`${indent}${entry.term}  ${compressPages(entry.pages)}`);
      }
    }
  }

  return lines.join('\n');
}

// --- New hierarchical register functions (using RegisterEntry) ---

function buildHierarchy(terms: TermEntry[], entries: RegisterEntry[]) {
  const termMap = new Map<string, TermEntry>();
  terms.filter(t => t.selected).forEach(t => termMap.set(t.term, t));

  const entryMap = new Map<string, RegisterEntry>();
  entries.forEach(e => entryMap.set(e.term, e));

  // Get level 1 terms sorted
  const level1 = entries
    .filter(e => e.level === 1 && termMap.has(e.term))
    .sort((a, b) => a.term.localeCompare(b.term, 'nl'));

  // Get level 2 grouped by parent
  const level2ByParent = new Map<string, RegisterEntry[]>();
  const orphan2: RegisterEntry[] = [];
  for (const e of entries) {
    if (e.level !== 2 || !termMap.has(e.term)) continue;
    if (e.parentTerm && entryMap.has(e.parentTerm)) {
      if (!level2ByParent.has(e.parentTerm)) level2ByParent.set(e.parentTerm, []);
      level2ByParent.get(e.parentTerm)!.push(e);
    } else {
      orphan2.push(e);
    }
  }
  // Sort children
  level2ByParent.forEach(arr => arr.sort((a, b) => a.term.localeCompare(b.term, 'nl')));
  orphan2.sort((a, b) => a.term.localeCompare(b.term, 'nl'));

  // Get level 3 grouped by parent
  const level3ByParent = new Map<string, RegisterEntry[]>();
  const orphan3: RegisterEntry[] = [];
  for (const e of entries) {
    if (e.level !== 3 || !termMap.has(e.term)) continue;
    if (e.parentTerm && entryMap.has(e.parentTerm)) {
      if (!level3ByParent.has(e.parentTerm)) level3ByParent.set(e.parentTerm, []);
      level3ByParent.get(e.parentTerm)!.push(e);
    } else {
      orphan3.push(e);
    }
  }
  level3ByParent.forEach(arr => arr.sort((a, b) => a.term.localeCompare(b.term, 'nl')));
  orphan3.sort((a, b) => a.term.localeCompare(b.term, 'nl'));

  return { termMap, level1, level2ByParent, level3ByParent, orphan2, orphan3 };
}

export function generateHierarchicalText(
  terms: TermEntry[],
  entries: RegisterEntry[]
): string {
  const { termMap, level1, level2ByParent, level3ByParent, orphan2, orphan3 } = buildHierarchy(terms, entries);

  const lines: string[] = [];

  for (const l1 of level1) {
    const entry = termMap.get(l1.term);
    if (!entry) continue;
    if (lines.length > 0) lines.push('');
    lines.push(`${entry.term}  ${compressPages(entry.pages)}`);

    const children2 = level2ByParent.get(l1.term) || [];
    for (const l2 of children2) {
      const e2 = termMap.get(l2.term);
      if (!e2) continue;
      lines.push(`   ${e2.term}  ${compressPages(e2.pages)}`);

      const children3 = level3ByParent.get(l2.term) || [];
      for (const l3 of children3) {
        const e3 = termMap.get(l3.term);
        if (!e3) continue;
        lines.push(`      ${e3.term}  ${compressPages(e3.pages)}`);
      }
    }
  }

  // Orphaned level 2 terms (no valid parent)
  for (const o2 of orphan2) {
    const e = termMap.get(o2.term);
    if (!e) continue;
    lines.push(`   ${e.term}  ${compressPages(e.pages)}`);
  }

  // Orphaned level 3 terms
  for (const o3 of orphan3) {
    const e = termMap.get(o3.term);
    if (!e) continue;
    lines.push(`      ${e.term}  ${compressPages(e.pages)}`);
  }

  return lines.join('\n');
}

export async function exportHierarchicalDocx(
  terms: TermEntry[],
  entries: RegisterEntry[],
  fontFamily: string,
  fontSize: number
) {
  const { termMap, level1, level2ByParent, level3ByParent, orphan2, orphan3 } = buildHierarchy(terms, entries);

  const paragraphs: Paragraph[] = [
    new Paragraph({ text: 'Register', heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
  ];

  const addTermLine = (entry: TermEntry, indent: number) => {
    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: `${entry.term}  ${compressPages(entry.pages)}`, font: fontFamily, size: fontSize * 2 })],
      spacing: { after: 40 },
      indent: { left: indent },
    }));
  };

  for (const l1 of level1) {
    const entry = termMap.get(l1.term);
    if (!entry) continue;

    // Level 1: no indent, bold
    paragraphs.push(new Paragraph({
      children: [
        new TextRun({ text: entry.term, font: fontFamily, size: fontSize * 2, bold: true }),
        new TextRun({ text: `  ${compressPages(entry.pages)}`, font: fontFamily, size: fontSize * 2 }),
      ],
      spacing: { before: 160, after: 40 },
    }));

    const children2 = level2ByParent.get(l1.term) || [];
    for (const l2 of children2) {
      const e2 = termMap.get(l2.term);
      if (!e2) continue;
      addTermLine(e2, 360);

      const children3 = level3ByParent.get(l2.term) || [];
      for (const l3 of children3) {
        const e3 = termMap.get(l3.term);
        if (!e3) continue;
        addTermLine(e3, 720);
      }
    }
  }

  // Orphans
  for (const o of orphan2) {
    const e = termMap.get(o.term);
    if (e) addTermLine(e, 360);
  }
  for (const o of orphan3) {
    const e = termMap.get(o.term);
    if (e) addTermLine(e, 720);
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'register.docx');
}
