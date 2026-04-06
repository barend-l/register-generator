import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
} from 'docx';
import { saveAs } from 'file-saver';
import type { TermEntry, Category } from './types';

function compressPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

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

export function generateFlatRegister(
  terms: TermEntry[],
  _fontFamily?: string,
  _fontSize?: number
): string {
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
    new Paragraph({
      text: 'Register',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
  ];

  let currentLetter = '';

  for (const t of selected) {
    const letter = (t.term[0] || '').toUpperCase();
    if (letter !== currentLetter) {
      currentLetter = letter;
      paragraphs.push(
        new Paragraph({
          text: letter,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        })
      );
    }
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${t.term}  ${compressPages(t.pages)}`,
            font: fontFamily,
            size: fontSize * 2, // docx uses half-points
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

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
    new Paragraph({
      text: 'Register',
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }),
  ];

  for (const cat of categories) {
    paragraphs.push(
      new Paragraph({
        text: cat.name,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      })
    );

    for (const sub of cat.subcategories) {
      if (sub.name && sub.name !== cat.name) {
        paragraphs.push(
          new Paragraph({
            text: sub.name,
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 160, after: 80 },
            indent: { left: 360 },
          })
        );
      }

      const sortedTerms = [...sub.terms].sort((a, b) => a.localeCompare(b, 'nl'));
      for (const termName of sortedTerms) {
        const entry = termMap.get(termName);
        if (!entry) continue;
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${entry.term}  ${compressPages(entry.pages)}`,
                font: fontFamily,
                size: fontSize * 2,
              }),
            ],
            spacing: { after: 40 },
            indent: { left: sub.name && sub.name !== cat.name ? 720 : 360 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

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

  for (const cat of categories) {
    if (lines.length > 0) lines.push('');
    lines.push(cat.name);

    for (const sub of cat.subcategories) {
      if (sub.name && sub.name !== cat.name) {
        lines.push(`   ${sub.name}`);
      }

      const sortedTerms = [...sub.terms].sort((a, b) => a.localeCompare(b, 'nl'));
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
