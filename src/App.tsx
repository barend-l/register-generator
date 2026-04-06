import { useState, useCallback, useEffect } from 'react';
import { StepIndicator } from './components/StepIndicator';
import { SettingsModal } from './components/SettingsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Step1Upload } from './components/Step1Upload';
import { Step2Analysis } from './components/Step2Analysis';
import { Step3Terms } from './components/Step3Terms';
import { Step4Export } from './components/Step4Export';
import type { AppState } from './types';
import { DEFAULT_STATE } from './types';

const STORAGE_KEY = 'register_tool_state';

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_STATE, ...parsed, pdfFile: null, isAnalyzing: false };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_STATE };
}

function saveState(state: AppState) {
  try {
    const { pdfFile, isAnalyzing, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch { /* ignore */ }
}

export default function App() {
  const [state, setStateRaw] = useState<AppState>(loadState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maxStep, setMaxStep] = useState(state.currentStep);

  const setState = useCallback((fn: (prev: AppState) => AppState) => {
    setStateRaw((prev) => {
      const next = fn(prev);
      saveState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (state.currentStep > maxStep) setMaxStep(state.currentStep);
  }, [state.currentStep, maxStep]);

  const goToStep = useCallback(
    (step: number) => setState((prev) => ({ ...prev, currentStep: step })),
    [setState]
  );

  const handleReset = () => {
    if (confirm('Weet je zeker dat je opnieuw wilt beginnen? Alle voortgang gaat verloren.')) {
      localStorage.removeItem(STORAGE_KEY);
      setStateRaw({ ...DEFAULT_STATE });
      setMaxStep(1);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Header */}
      <header className="bg-white border-b border-warm-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-primary-900">Register Generator</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs text-warm-500 hover:text-warm-700 hover:bg-warm-100 rounded-lg transition"
            >
              Opnieuw beginnen
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 text-warm-500 hover:text-primary-600 hover:bg-warm-100 rounded-lg transition"
              title="Instellingen"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        <StepIndicator
          currentStep={state.currentStep}
          onStepClick={goToStep}
          maxReachedStep={maxStep}
        />
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <ErrorBoundary onReset={() => goToStep(Math.max(1, state.currentStep - 1))}>
          {state.currentStep === 1 && (
            <Step1Upload
              state={state}
              setState={setState}
              onNext={() => goToStep(2)}
            />
          )}
          {state.currentStep === 2 && (
            <Step2Analysis
              state={state}
              setState={setState}
              onNext={() => goToStep(3)}
              onPrev={() => goToStep(1)}
            />
          )}
          {state.currentStep === 3 && (
            <Step3Terms
              state={state}
              setState={setState}
              onNext={() => goToStep(4)}
              onPrev={() => goToStep(2)}
            />
          )}
          {state.currentStep === 4 && (
            <Step4Export
              state={state}
              setState={setState}
              onPrev={() => goToStep(3)}
            />
          )}
        </ErrorBoundary>
      </main>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
