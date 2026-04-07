/**
 * ErrorBoundary Component
 * React 错误边界 - 捕获子组件渲染错误，防止整个应用崩溃
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLogger } from '../../utils/logger';

const logger = getLogger('ErrorBoundary');

// =============================================================================
// Types
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 自定义错误回退 UI */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** 错误回调 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// =============================================================================
// Component
// =============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 记录错误
    logger.error('Caught error:', error);
    logger.error('Error info:', errorInfo);

    // 调用可选的错误回调
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // 如果提供了自定义 fallback
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.handleReset);
        }
        return this.props.fallback;
      }

      // 默认错误 UI
      return <DefaultErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

// =============================================================================
// Default Error Fallback
// =============================================================================

interface DefaultErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

function DefaultErrorFallback({ error, onReset }: DefaultErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]">
      <div className="max-w-md text-center">
        {/* 错误图标 */}
        <div className="text-4xl mb-4 text-red-500">⚠️</div>

        {/* 标题 */}
        <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>

        {/* 错误信息 */}
        <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
          {error.message || 'An unexpected error occurred'}
        </p>

        {/* 错误堆栈（开发模式） */}
        {process.env.NODE_ENV === 'development' && error.stack && (
          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-xs text-[var(--vscode-descriptionForeground)]">
              Error details
            </summary>
            <pre className="mt-2 p-2 bg-[var(--vscode-input-background)] rounded text-xs overflow-auto max-h-40">
              {error.stack}
            </pre>
          </details>
        )}

        {/* 重试按钮 */}
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] rounded transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
