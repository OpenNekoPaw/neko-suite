/**
 * Badge Component
 *
 * Small status indicator with colored text.
 */

import React from 'react';
import { Text } from 'ink';
import type { InkColor } from '../../types/theme';

interface BadgeProps {
  readonly label: string;
  readonly color: InkColor;
  readonly bold?: boolean;
}

export function Badge({ label, color, bold }: BadgeProps): React.JSX.Element {
  return (
    <Text color={color} bold={bold}>
      [{label}]
    </Text>
  );
}
