import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../i18n/index';
import { webviewErrorHandler } from '../platform/errors';

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
    void webviewErrorHandler.handleError(error, {
      showToUser: false,
      severity: 'fatal',
    });
    void webviewErrorHandler.handleError(
      new Error(errorInfo.componentStack ?? 'React component stack unavailable'),
      {
        showToUser: false,
        severity: 'error',
      },
    );
  }

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--model-bg)] px-4 text-center text-[var(--model-fg)]">
          <h2 className="text-base font-semibold">{t('error.title')}</h2>
          <p className="max-w-md text-sm text-[var(--model-fg-secondary)]">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="model-btn-primary"
          >
            {t('error.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
