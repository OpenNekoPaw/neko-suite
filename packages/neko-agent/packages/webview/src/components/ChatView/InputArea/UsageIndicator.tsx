/**
 * UsageIndicator Component
 * Shows context token usage and allows manual compression
 */

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/I18nContext';

interface UsageIndicatorProps {
  /** Current context token count */
  tokenCount: number;
  /** Maximum context tokens (for percentage calculation) */
  maxTokens?: number;
  /** Whether compression is in progress */
  isCompressing?: boolean;
  /** Callback to trigger compression */
  onCompress?: () => Promise<void>;
}

/**
 * Format token count for display
 */
function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Get color based on usage percentage
 */
function getUsageColor(percentage: number): string {
  if (percentage >= 90) {
    return 'var(--vscode-errorForeground)';
  }
  if (percentage >= 70) {
    return 'var(--vscode-editorWarning-foreground)';
  }
  return 'var(--vscode-descriptionForeground)';
}

export function UsageIndicator({
  tokenCount,
  maxTokens = 100000,
  isCompressing = false,
  onCompress,
}: UsageIndicatorProps) {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);

  const percentage = Math.min((tokenCount / maxTokens) * 100, 100);
  const color = getUsageColor(percentage);

  const handleClick = useCallback(async () => {
    if (!onCompress || isCompressing) return;

    try {
      await onCompress();
    } catch (error) {
      console.error('[UsageIndicator] Compression failed:', error);
    }
  }, [onCompress, isCompressing]);

  // Don't show if no tokens yet (no conversation started)
  if (tokenCount === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={isCompressing || !onCompress}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
          isCompressing
            ? 'opacity-50 cursor-wait'
            : onCompress
            ? 'hover:bg-[var(--vscode-toolbar-hoverBackground)] cursor-pointer'
            : 'cursor-default'
        }`}
        title={t('chat.usage.clickToCompress')}
      >
        {/* Token icon */}
        <TokenIcon className="w-3 h-3" style={{ color }} />

        {/* Token count */}
        <span style={{ color }}>
          {isCompressing ? (
            <span className="animate-pulse">{t('chat.usage.compressing')}</span>
          ) : (
            formatTokenCount(tokenCount)
          )}
        </span>

        {/* Progress bar (only show if usage is significant) */}
        {percentage >= 20 && (
          <div className="w-8 h-1 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${percentage}%`,
                backgroundColor: color,
              }}
            />
          </div>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-editorWidget-border)] rounded shadow-lg text-[11px] whitespace-nowrap z-50">
          <div className="text-[var(--vscode-foreground)]">
            {t('chat.usage.tokens')}: {tokenCount.toLocaleString()} / {maxTokens.toLocaleString()}
          </div>
          <div className="text-[var(--vscode-descriptionForeground)]">
            {percentage.toFixed(1)}% {t('chat.usage.used')}
          </div>
          {onCompress && (
            <div className="text-[var(--vscode-textLink-foreground)] mt-1">
              {t('chat.usage.clickToCompress')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Token icon
function TokenIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM2 8a6 6 0 1 1 12 0A6 6 0 0 1 2 8z" />
      <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
    </svg>
  );
}

export default UsageIndicator;
