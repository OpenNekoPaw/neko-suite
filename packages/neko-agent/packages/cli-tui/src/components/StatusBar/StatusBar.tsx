/**
 * StatusBar Component
 *
 * Fixed bottom bar showing chat/media models, mode, tokens, and shortcuts.
 * Execution status is shown inline in ChatView (ActivityIndicator).
 *
 * Layout: [mode] │ [chat:model] │ [media:model(s)] │ ... │ [tokens bar] │ [shortcuts]
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useAgentStore } from '../../stores/agent-store';
import { useConfigStore } from '../../stores/config-store';
import { tokens } from '../../theme/tokens';
import { TokenUsage } from './TokenUsage';

export function StatusBar(): React.JSX.Element {
  const mode = useAgentStore((s) => s.executionMode);
  const activeSkill = useAgentStore((s) => s.activeSkill);
  const usage = useAgentStore((s) => s.usage);
  const config = useConfigStore((s) => s.config);

  const chatModel = truncateModel(config.model);
  const mediaModels = config.mediaModels;

  return (
    <Box paddingLeft={1} paddingRight={1}>
      {/* Mode badge — leftmost */}
      <Text color={modeColor(mode)}>{mode}</Text>
      <Text dimColor> | </Text>

      {/* Active skill badge */}
      {activeSkill ? (
        <>
          <Text color={tokens.info}>skill:</Text>
          <Text color={tokens.info}>{activeSkill}</Text>
          <Text dimColor> | </Text>
        </>
      ) : null}

      {/* Chat model */}
      <Text dimColor>chat:</Text>
      <Text>{chatModel}</Text>
      <Text dimColor> | </Text>

      {/* Media models */}
      <Text dimColor>media:</Text>
      {mediaModels.length > 0 ? (
        <Text>{mediaModels.map(truncateModel).join(',')}</Text>
      ) : (
        <Text color={tokens.muted}>none</Text>
      )}

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Token usage bar */}
      {usage.total > 0 ? <TokenUsage usage={usage} /> : null}
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
