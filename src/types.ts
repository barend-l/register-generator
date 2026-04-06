export interface PageMapping {
  pdfPage: number;
  bookPage: number;
}

export interface TermEntry {
  id: string;
  term: string;
  pages: number[]; // book page numbers
  selected: boolean;
  mergedFrom?: string[]; // terms that were merged into this one
}

export interface Category {
  name: string;
  subcategories: SubCategory[];
}

export interface SubCategory {
  name: string;
  terms: string[];
}

export interface AnalysisResult {
  pdfPage: number;
  bookPage: number;
  terms: string[];
  status: 'pending' | 'analyzing' | 'done' | 'error' | 'skipped';
  error?: string;
}

export interface AppState {
  currentStep: number;
  // Step 1
  pdfFile: File | null;
  pdfFileName: string;
  pdfFileSize: number;
  totalPdfPages: number;
  firstNumberedPdfPage: number;
  firstBookPageNumber: number;
  analyzeFrom: number;
  analyzeTo: number;
  excludedPages: number[];
  // Step 2
  analysisResults: AnalysisResult[];
  isAnalyzing: boolean;
  isPaused: boolean;
  currentAnalysisPage: number;
  // Step 3
  terms: TermEntry[];
  categories: Category[];
  useCategorized: boolean;
  // Step 4
  fontFamily: string;
  fontSize: number;
}

export const DEFAULT_STATE: Omit<AppState, 'pdfFile'> & { pdfFile: null } = {
  currentStep: 1,
  pdfFile: null,
  pdfFileName: '',
  pdfFileSize: 0,
  totalPdfPages: 0,
  firstNumberedPdfPage: 5,
  firstBookPageNumber: 1,
  analyzeFrom: 0,
  analyzeTo: 0,
  excludedPages: [],
  analysisResults: [],
  isAnalyzing: false,
  isPaused: false,
  currentAnalysisPage: 0,
  terms: [],
  categories: [],
  useCategorized: false,
  fontFamily: 'Arial',
  fontSize: 10,
};
