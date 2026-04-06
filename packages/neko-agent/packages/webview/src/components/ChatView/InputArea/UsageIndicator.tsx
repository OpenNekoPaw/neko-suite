/**
 * UsageIndicator Component
 * Compact SVG pie chart showing context token usage percentage.
 * Click to trigger context compression.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('UsageIndicator');

// Pie chart geometry
const RADIUS = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface UsageIndicatorProps {
  tokenCount: number;
  maxTokens?: number;
  isCompressing?: boolean;
  onCompress?: () => Promise<void>;
}

function formatTokenCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'var(--vscode-errorForeground)';
  if (percentage >= 70) return 'var(--vscode-editorWarning-foreground)';
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
  // stroke-dashoffset controls how much of the arc is "filled"
  const dashOffset = CIRCUMFERENCE * (1 - percentage / 100);

  const handleClick = useCallback(async () => {
    if (!onCompress || isCompressing) return;
    try {
      await onCompress();
    } catch (error) {
      logger.error('Compression failed:', error);
    }
  }, [onCompress, isCompressing]);

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={isCompressing || !onCompress}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
          isCompressing
            ? 'opacity-50 cursor-wait'
            : onCompress
              ? 'hover:bg-[var(--vscode-toolbar-hoverBackground)] cursor-pointer'
              : 'cursor-default'
        }`}
        title={t('chat.usage.clickToCompress')}
      >
        {isCompressing ? (
          /* Spinning ring while compressing */
          <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin">
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke="var(--vscode-descriptionForeground)"
              strokeWidth="2"
              strokeDasharray={`${CIRCUMFERENCE * 0.75} ${CIRCUMFERENCE * 0.25}`}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          /* Pie chart */
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ transform: 'rotate(-90deg)' }}>
            {/* Track (background circle) */}
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke="var(--vscode-input-background)"
              strokeWidth="10"
            />
            {/* Filled arc */}
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
            {/* Border ring */}
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="0.5"
              opacity="0.4"
            />
          </svg>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-editorWidget-border)] rounded shadow-lg text-[11px] whitespace-nowrap z-50">
          <div className="text-[var(--vscode-foreground)]">
            {t('chat.usage.tokens')}: {tokenCount.toLocaleString()} / {maxTokens.toLocaleString()}
          </div>
          <div className="text-[var(--vscode-descriptionForeground)]">
            {percentage.toFixed(1)}% {t('chat.usage.used')} — {formatTokenCount(tokenCount)}
          </div>
          {onCompress && !isCompressing && (
            <div className="text-[var(--vscode-textLink-foreground)] mt-1">
              {t('chat.usage.clickToCompress')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
