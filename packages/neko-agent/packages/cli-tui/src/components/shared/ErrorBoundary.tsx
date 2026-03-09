/**
 * ErrorBoundary Component
 *
 * React error boundary for the TUI. Catches rendering errors
 * and displays a user-friendly fallback instead of crashing.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { tokens } from '../../theme/tokens';

interface ErrorBoundaryProps {
  readonly children: React.ReactNode;
  /** Optional label for identifying the failing region */
  readonly label?: string;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      const label = this.props.label ?? 'Component';
      return (
        <Box flexDirection="column" borderStyle="single" borderColor={tokens.error} paddingX={1}>
          <Text color={tokens.error} bold>{label} crashed</Text>
          <Text dimColor>{this.state.error.message}</Text>
          <Text dimColor>Press Ctrl+L to reset, or Ctrl+C to quit.</Text>
        </Box>
      );
    }

    return this.props.children;
  }
}
