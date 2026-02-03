import { useTranslation } from '@/i18n/I18nContext';

export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      {/* Logo/Icon */}
      <div className="mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-[var(--vscode-charts-purple)] to-[var(--vscode-charts-blue)] flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      </div>

      {/* Title */}
      <h2 className="text-lg font-medium mb-1">{t('chat.emptyState.title')}</h2>
      <p className="text-[12px] text-[var(--vscode-descriptionForeground)] text-center mb-6 max-w-[280px]">
        {t('chat.emptyState.description')}
      </p>

      {/* Disclaimer */}
      <p className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-60 text-center">
        {t('chat.emptyState.disclaimer')}
      </p>
    </div>
  );
}
