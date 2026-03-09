/**
 * StatusBar Component
 *
 * Fixed bottom bar showing model, mode, tokens, and time.
 * Aligned with Claude Code's persistent status display.
 *
 * Layout: [model] │ [mode] │ [status/spinner] │ ... │ [tokens bar] │ [elapsed] │ [shortcuts]
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useAgentStore } from '../../stores/agent-store';
import { useConfigStore } from '../../stores/config-store';
import { useTimer, formatDuration } from '../../hooks/useTimer';
import { tokens } from '../../theme/tokens';
import { TokenUsage } from './TokenUsage';
import { Spinner } from '../shared/Spinner';

export function StatusBar(): React.JSX.Element {
  const status = useAgentStore((s) => s.status);
  const mode = useAgentStore((s) => s.executionMode);
  const usage = useAgentStore((s) => s.usage);
  const iteration = useAgentStore((s) => s.iteration);
  const config = useConfigStore((s) => s.config);
  const elapsed = useTimer();

  const isRunning = status === 'running';

  // Truncate model name to fit
  const modelName = truncateModel(config.model);

  return (
    <Box borderStyle="single" borderColor={tokens.muted} paddingLeft={1} paddingRight={1}>
      {/* Model */}
      <Text color={tokens.info} bold>
        {modelName}
      </Text>
      <Text dimColor> │ </Text>

      {/* Mode badge */}
      <Text color={modeColor(mode)}>{mode}</Text>
      <Text dimColor> │ </Text>

      {/* Status / Iteration */}
      {isRunning ? (
        <>
          <Spinner />
          {iteration.max > 0 ? (
            <Text dimColor>
              {' '}
              {iteration.current}/{iteration.max}
            </Text>
          ) : null}
        </>
      ) : (
        <Text color={status === 'error' ? tokens.error : tokens.muted}>{status}</Text>
      )}

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Token usage bar */}
      {usage.total > 0 ? (
        <>
          <TokenUsage usage={usage} />
          <Text dimColor> │ </Text>
        </>
      ) : null}

      {/* Elapsed time */}
      {isRunning && elapsed > 0 ? (
        <>
          <Text dimColor>{formatDuration(elapsed)}</Text>
          <Text dimColor> │ </Text>
        </>
      ) : null}

      {/* Shortcuts hint */}
      <Text dimColor>Esc:cancel ^L:clear</Text>
    </Box>
  );
}

/** Get theme color for execution mode */
function modeColor(mode: string): string {
  switch (mode) {
    case 'auto':
      return tokens.success;
    case 'plan':
      return tokens.warning;
    case 'ask':
      return tokens.info;
    default:
      return tokens.muted;
  }
}

/** Truncate model name: claude-sonnet-4-20250514 → claude-sonnet-4 */
function truncateModel(model: string): string {
  // Remove date suffix like -20250514
  return model.replace(/-\d{8}$/, '');
}
