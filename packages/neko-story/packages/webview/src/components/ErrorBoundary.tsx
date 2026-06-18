import { WebviewErrorBoundary } from '@neko/ui/error-boundary';
import type { ReactNode } from 'react';
import { t } from '../i18n';
import { getLogger } from '../utils/logger';

const logger = getLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps): ReactNode {
  return (
    <WebviewErrorBoundary
      logger={logger}
      title={t('error.title')}
      retryLabel={t('error.retry')}
      className="flex h-full flex-col items-center justify-center p-4 text-center text-[var(--vscode-editor-foreground)] bg-[var(--vscode-editor-background)]"
    >
      {children}
    </WebviewErrorBoundary>
  );
}
