interface StepIndicatorProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  maxReachedStep: number;
}

const steps = [
  { num: 1, label: 'PDF uploaden' },
  { num: 2, label: 'AI-analyse' },
  { num: 3, label: 'Termselectie' },
  { num: 4, label: 'Exporteren' },
];

export function StepIndicator({ currentStep, onStepClick, maxReachedStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {steps.map((step, i) => {
        const isActive = step.num === currentStep;
        const isDone = step.num < currentStep;
        const isClickable = step.num <= maxReachedStep;

        return (
          <div key={step.num} className="flex items-center gap-2">
            <button
              onClick={() => isClickable && onStepClick(step.num)}
              disabled={!isClickable}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary-600 text-white shadow-md'
                  : isDone
                    ? 'bg-primary-100 text-primary-700 hover:bg-primary-200 cursor-pointer'
                    : isClickable
                      ? 'bg-warm-100 text-warm-600 hover:bg-warm-200 cursor-pointer'
                      : 'bg-warm-50 text-warm-400 cursor-not-allowed'
              }`}
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  isActive
                    ? 'bg-white text-primary-600'
                    : isDone
                      ? 'bg-primary-600 text-white'
                      : 'bg-warm-300 text-white'
                }`}
              >
                {isDone ? '✓' : step.num}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`w-8 h-0.5 ${step.num < currentStep ? 'bg-primary-400' : 'bg-warm-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
