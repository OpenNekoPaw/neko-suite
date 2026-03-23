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
    <div className="flex flex-col items-center justify-center h-full px-4 select-none">
      {/* Icon */}
      <div className="mb-5 relative">
        {/* Outer glow */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--vscode-charts-purple)] to-[var(--vscode-charts-blue)] opacity-20 blur-xl scale-110" />
        {/* Icon container */}
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--vscode-charts-purple)] to-[var(--vscode-charts-blue)] flex items-center justify-center shadow-lg">
          <NekoIcon className="w-9 h-9" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-[15px] font-semibold mb-1.5 tracking-tight">
        {t('chat.emptyState.title')}
      </h2>
      <p className="text-[12px] text-[var(--vscode-descriptionForeground)] text-center mb-5 max-w-[260px] leading-relaxed">
        {t('chat.emptyState.description')}
      </p>

      {/* Suggestion chips */}
      <div className="flex flex-col items-stretch gap-1.5 w-full max-w-[260px] mb-6">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestionClick?.(s)}
            className="px-3 py-1.5 text-[11px] text-left text-[var(--vscode-descriptionForeground)] border border-[var(--vscode-panel-border)] rounded-lg hover:border-[var(--vscode-focusBorder)] hover:text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-50 text-center">
        {t('chat.emptyState.disclaimer')}
      </p>
    </div>
  );
}

/** Neko (cat) icon — white silhouette with mask-cut eyes and nose */
function NekoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <defs>
        <mask id="neko-mask">
          <rect width="24" height="24" fill="white" />
          {/* Left eye */}
          <ellipse cx="9" cy="14" rx="1.6" ry="1.9" fill="black" />
          {/* Right eye */}
          <ellipse cx="15" cy="14" rx="1.6" ry="1.9" fill="black" />
          {/* Nose */}
          <path d="M11.3 17 L12 17.9 L12.7 17 Z" fill="black" />
        </mask>
      </defs>

      {/* Cat silhouette: head + ears, masked */}
      <g fill="white" mask="url(#neko-mask)">
        {/* Left ear */}
        <path d="M8 11.5 L4.5 4 L11 9.5 Z" />
        {/* Right ear */}
        <path d="M16 11.5 L19.5 4 L13 9.5 Z" />
        {/* Head */}
        <circle cx="12" cy="14.5" r="8.5" />
      </g>

      {/* Inner ear highlights (softer white fill) */}
      <path d="M8 10.5 L5.8 5.5 L10.2 9.5 Z" fill="white" opacity="0.35" />
      <path d="M16 10.5 L18.2 5.5 L13.8 9.5 Z" fill="white" opacity="0.35" />

      {/* Eye shine dots */}
      <circle cx="9.7" cy="13.2" r="0.55" fill="white" opacity="0.7" />
      <circle cx="15.7" cy="13.2" r="0.55" fill="white" opacity="0.7" />
    </svg>
  );
}
