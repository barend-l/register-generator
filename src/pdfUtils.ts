import * as pdfjsLib from 'pdfjs-dist';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

let currentDoc: pdfjsLib.PDFDocumentProxy | null = null;

export async function loadPdf(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  currentDoc = pdf;
  return pdf.numPages;
}

export async function getPageText(pageNumber: number): Promise<string> {
  if (!currentDoc) throw new Error('Geen PDF geladen');
  const page = await currentDoc.getPage(pageNumber);
  const textContent = await page.getTextContent();
  return textContent.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPdfDoc() {
  return currentDoc;
}
