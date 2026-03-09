/**
 * TokenUsage Component
 *
 * Visual progress bar showing context window usage.
 * Displays input/output token counts with a filled bar.
 */

import React from 'react';
import { Text } from 'ink';
import type { TokenUsage as TokenUsageType } from '../../types/state';
import { tokens } from '../../theme/tokens';

interface TokenUsageProps {
  readonly usage: TokenUsageType;
  /** Context window limit (default: 200K for Claude) */
  readonly maxTokens?: number;
  /** Bar width in characters (default: 15) */
  readonly width?: number;
}

export function TokenUsage({
  usage,
  maxTokens = 200_000,
  width = 15,
}: TokenUsageProps): React.JSX.Element {
  if (usage.total === 0) return <Text />;

  const ratio = Math.min(usage.total / maxTokens, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  // Color based on usage level
  const barColor = ratio > 0.8
    ? tokens.error
    : ratio > 0.5
      ? tokens.warning
      : tokens.success;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Text>
      <Text color={barColor}>{bar}</Text>
      <Text dimColor> {formatCompact(usage.total)}</Text>
    </Text>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
