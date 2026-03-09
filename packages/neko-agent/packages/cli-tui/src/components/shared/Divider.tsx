/**
 * Divider Component
 *
 * Horizontal divider line for visual separation.
 */

import React from 'react';
import { Text } from 'ink';
import { tokens } from '../../theme/tokens';

interface DividerProps {
  /** Width in characters (defaults to 40) */
  readonly width?: number;
  /** Character to use (defaults to ─) */
  readonly char?: string;
}

export function Divider({ width = 40, char = '─' }: DividerProps): React.JSX.Element {
  return <Text color={tokens.muted}>{char.repeat(width)}</Text>;
}
