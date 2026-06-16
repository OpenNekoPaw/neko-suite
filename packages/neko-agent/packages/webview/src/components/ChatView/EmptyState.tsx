import { useTranslation } from '@/i18n/I18nContext';
import { ArrowRightIcon } from '@neko/shared/icons';

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
    <div className="agent-empty-state flex h-full min-h-[260px] select-none items-start justify-center px-3 py-5 sm:px-4 sm:py-7">
      <section
        className="agent-empty-panel w-full max-w-[420px]"
        aria-labelledby="neko-agent-empty-title"
      >
        <div className="min-w-0">
          <h2
            id="neko-agent-empty-title"
            className="agent-empty-title text-[13px] font-semibold leading-5 text-[var(--agent-fg)]"
          >
            {t('chat.emptyState.title')}
          </h2>
          <p className="agent-empty-copy mt-1 text-[12px] leading-5 text-[var(--agent-empty-copy)]">
            {t('chat.emptyState.description')}
          </p>
        </div>

        <div className="agent-empty-actions mt-5 grid gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion)}
              className="agent-empty-action group flex min-h-9 w-full cursor-pointer items-center rounded-md border border-[var(--agent-empty-action-border)] bg-[var(--agent-empty-action-bg)] px-3 py-2 text-left text-[12px] leading-5 text-[var(--agent-fg)] transition-colors hover:border-[var(--agent-empty-action-hover-border)] hover:bg-[var(--agent-empty-action-hover-bg)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-accent)]"
            >
              <span className="min-w-0 flex-1 break-words">{suggestion}</span>
              <ArrowRightIcon className="agent-empty-action-icon ml-2 h-3.5 w-3.5 flex-shrink-0" />
            </button>
          ))}
        </div>

        <p className="agent-empty-disclaimer mt-4 text-[10px] leading-4 text-[var(--agent-empty-muted)]">
          {t('chat.emptyState.disclaimer')}
        </p>
      </section>
    </div>
  );
}
