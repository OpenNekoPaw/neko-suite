import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLogger } from '@/utils/logger';

const logger = getLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error(`[ErrorBoundary] Caught error: ${error.message}`, { error, errorInfo });
  }

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--agent-bg)] p-4">
          <div className="agent-card flex max-w-md flex-col items-center gap-3 px-6 py-7 text-center text-[var(--agent-fg)]">
            <div className="text-3xl">&#x26A0;&#xFE0F;</div>
            <h2 className="text-base font-semibold">Something went wrong</h2>
            <p className="text-sm text-[var(--agent-fg-secondary)]">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="vscode-button"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
