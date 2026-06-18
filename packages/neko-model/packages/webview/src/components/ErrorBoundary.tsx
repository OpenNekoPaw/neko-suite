import { WebviewErrorBoundary } from '@neko/ui/error-boundary';
import type { ErrorInfo, ReactNode } from 'react';
import { t } from '../i18n/index';
import { webviewErrorHandler } from '../platform/errors';
import { getLogger } from '../platform/logger';

const logger = getLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps): ReactNode {
  return (
    <WebviewErrorBoundary
      logger={logger}
      onError={handleModelBoundaryError}
      title={t('error.title')}
      retryLabel={t('error.retry')}
      className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--model-bg)] px-4 text-center text-[var(--model-fg)]"
      contentClassName="flex max-w-md flex-col items-center gap-3"
      buttonClassName="model-btn-primary"
    >
      {children}
    </WebviewErrorBoundary>
  );
}

function handleModelBoundaryError(error: Error, errorInfo: ErrorInfo): void {
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
