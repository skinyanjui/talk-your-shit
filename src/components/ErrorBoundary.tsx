import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        readable = `Database access error (${parsed.operationType || 'operation'} on ${parsed.path || 'unknown'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('TYS ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0C0C0C] px-6 py-12">
          <div className="max-w-lg w-full border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg p-8">
            <div className="text-sm font-extrabold tracking-[-0.03em] text-[#CC0000]">
              TYS
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#0C0C0C] dark:text-[#F2F2F2]">
              Something interrupted the session
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#595959] dark:text-[#A3A3A3] break-words">
              {this.state.message}
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-semibold bg-[#CC0000] text-white rounded-md hover:bg-[#A80000] transition-colors cursor-pointer"
              >
                Reload TYS
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="px-4 py-2 text-sm font-semibold border border-[#D4D4D4] dark:border-[#333333] text-[#0C0C0C] dark:text-[#F2F2F2] rounded-md hover:bg-[#F7F7F7] dark:hover:bg-[#1F1F1F] transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
