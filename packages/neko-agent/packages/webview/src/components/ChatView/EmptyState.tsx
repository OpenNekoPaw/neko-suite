import { useTranslation } from '@/i18n/I18nContext';

interface EmptyStateProps {
  onSuggestionClick?: (text: string) => void;
}

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const { t } = useTranslation();

  const suggestions = [
    t('chat.emptyState.suggestion1'),
    t('chat.emptyState.suggestion2'),
    t('chat.emptyState.suggestion3'),
  ];

  return (
    <div className="agent-empty-state flex h-full min-h-[220px] select-none items-start justify-center px-4 py-8 sm:py-10">
      <section className="w-full max-w-[360px]" aria-labelledby="neko-agent-empty-title">
        <div className="min-w-0">
          <h2
            id="neko-agent-empty-title"
            className="text-[13px] font-semibold leading-5 text-[var(--agent-fg)]"
          >
            {t('chat.emptyState.title')}
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[var(--agent-empty-copy)]">
            {t('chat.emptyState.description')}
          </p>
        </div>

        <div className="mt-5 grid gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion)}
              className="flex min-h-9 w-full items-center rounded-md border border-[var(--agent-empty-action-border)] bg-[var(--agent-empty-action-bg)] px-3 py-2 text-left text-[12px] leading-5 text-[var(--agent-fg)] transition-colors hover:border-[var(--agent-empty-action-hover-border)] hover:bg-[var(--agent-empty-action-hover-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-accent)]"
            >
              <span className="min-w-0 flex-1 break-words">{suggestion}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
          {t('chat.emptyState.disclaimer')}
        </p>
      </section>
    </div>
  );
}
