import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLogger } from '../utils/logger';

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
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '1rem',
            color: 'var(--vscode-editor-foreground)',
            backgroundColor: 'var(--vscode-editor-background)',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>&#x26A0;&#xFE0F;</div>
          <h2 style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
