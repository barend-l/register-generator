import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto mt-12 p-8 bg-red-50 border border-red-200 rounded-xl text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Er ging iets mis</h2>
          <p className="text-sm text-red-600 mb-4">{this.state.error?.message}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              Opnieuw proberen
            </button>
            {this.props.onReset && (
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  this.props.onReset?.();
                }}
                className="px-4 py-2 border border-red-300 rounded-lg text-sm text-red-700 hover:bg-red-100"
              >
                Terug naar vorige stap
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
