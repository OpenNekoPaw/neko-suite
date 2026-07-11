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
import { resolveAgentTokenBudget } from '@neko/shared';
import { useAgentStore } from '../../stores/agent-store';
import { useConfigStore } from '../../stores/config-store';
import { tokens } from '../../theme/tokens';
import { formatTuiLabel, getTuiLabels, type TuiLabels } from '../../core/tui-locale';
import { TokenUsage } from './TokenUsage';

export function StatusBar(): React.JSX.Element {
  const sessionMode = useAgentStore((s) => s.sessionMode);
  const mode = useAgentStore((s) => s.executionMode);
  const activeSkill = useAgentStore((s) => s.activeSkill);
  const lifecycleRecords = useAgentStore((s) => s.activeSkillLifecycleRecords);
  const queueSnapshot = useAgentStore((s) => s.messageQueue.snapshot);
  const queuePausedAfterCancel = useAgentStore((s) => s.messageQueue.pausedAfterCancel);
  const runningTaskSummary = useAgentStore((s) => s.tasks.runningSummary);
  const usage = useAgentStore((s) => s.usage);
  const contextTokenCount = useAgentStore((s) => s.contextTokens.count);
  const config = useConfigStore((s) => s.config);
  const labels = getTuiLabels();

  const chatModel = truncateModel(
    `${config.chatModel?.providerId ?? config.provider}:${config.chatModel?.modelId ?? config.model}`,
  );
  const mediaModels = formatMediaModels(config.defaultMediaModels, labels);
  const tokenBudget = resolveAgentTokenBudget({
    modelId: config.chatModel?.modelId ?? config.model,
    contextWindow: config.chatModel?.contextWindow,
    modelMaxOutputTokens: config.chatModel?.maxOutputTokens,
    defaultMaxOutputTokens: config.maxTokens,
    requestedMaxOutputTokens: config.maxTokens,
  });

  return (
    <Box paddingLeft={1} paddingRight={1}>
      {/* Mode badge — leftmost */}
      <Text color={sessionModeColor(sessionMode)}>
        {formatTuiLabel(labels.sessionModes, sessionMode)}
      </Text>
      <Text dimColor>:</Text>
      <Text color={modeColor(mode)}>{formatTuiLabel(labels.executionModes, mode)}</Text>
      <Text dimColor> | </Text>

      {/* Active skill badge */}
      {lifecycleRecords.length > 0 ? (
        <>
          <Text color={tokens.info}>{labels.chrome.skills}:</Text>
          <Text color={tokens.info}>{formatLifecycleRecords(lifecycleRecords, labels)}</Text>
          <Text dimColor> | </Text>
        </>
      ) : activeSkill ? (
        <>
          <Text color={tokens.info}>{labels.chrome.skill}:</Text>
          <Text color={tokens.info}>{activeSkill}</Text>
          <Text dimColor> | </Text>
        </>
      ) : null}

      {/* Chat model */}
      <Text dimColor>{labels.chrome.chat}:</Text>
      <Text>{chatModel}</Text>
      <Text dimColor> | </Text>

      {/* Media models */}
      <Text dimColor>{labels.chrome.media}:</Text>
      {mediaModels ? (
        <Text>{mediaModels}</Text>
      ) : (
        <Text color={tokens.muted}>{labels.chrome.none}</Text>
      )}

      {queueSnapshot && queueSnapshot.pendingCount > 0 ? (
        <>
          <Text dimColor> | </Text>
          <Text color={tokens.warning}>{labels.chrome.queue}:</Text>
          <Text color={tokens.warning}>{queueSnapshot.pendingCount}</Text>
          {queuePausedAfterCancel ? (
            <Text color={tokens.warning}> ({labels.queue.pausedAfterCancel})</Text>
          ) : null}
        </>
      ) : null}

      {runningTaskSummary ? (
        <>
          <Text dimColor> | </Text>
          <Text color={tokens.info}>{labels.chrome.task}:</Text>
          <Text color={tokens.info}>{runningTaskSummary}</Text>
        </>
      ) : null}

      {/* Spacer */}
      <Box flexGrow={1} />

      {/* Token usage bar */}
      <TokenUsage
        usage={{
          ...usage,
          input: contextTokenCount ?? usage.input,
        }}
        maxContextTokens={tokenBudget.effectiveInputBudget}
        maxOutputTokens={tokenBudget.effectiveMaxOutputTokens}
        modelMaxOutputTokens={tokenBudget.modelMaxOutputTokens}
      />
    </Box>
  );
}

function sessionModeColor(mode: string): string {
  switch (mode) {
    case 'agent':
      return tokens.info;
    case 'image':
      return tokens.success;
    case 'video':
      return tokens.warning;
    case 'audio':
      return tokens.code.keyword;
    default:
      return tokens.muted;
  }
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

function formatMediaModels(
  mediaModels: { image?: string; video?: string; audio?: string } | undefined,
  labels: TuiLabels,
): string | null {
  if (!mediaModels) return null;
  const values = (['image', 'video', 'audio'] as const)
    .map((category) =>
      mediaModels[category]
        ? `${formatTuiLabel(labels.mediaCategories, category)}:${truncateModel(mediaModels[category])}`
        : undefined,
    )
    .filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(',') : null;
}

function formatLifecycleRecords(
  records: readonly import('@neko/shared').ActiveSkillLifecycleRecordProjection[],
  labels: TuiLabels,
): string {
  const first = records[0];
  if (!first) return '0';
  const suffix = records.length > 1 ? `+${records.length - 1}` : '';
  const lock = first.clearable ? '' : ` ${labels.chrome.locked}`;
  return `${first.skillName}[${first.slot}]${suffix}${lock}`;
}
