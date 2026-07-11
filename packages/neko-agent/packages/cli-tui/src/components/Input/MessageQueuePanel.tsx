import React from 'react';
import { Box, Text } from 'ink';
import type { TuiQueueRowKind } from '../../core/message-queue-presenter';
import { presentTuiMessageQueue } from '../../core/message-queue-presenter';
import { getTuiLabels } from '../../core/tui-locale';
import { useAgentStore } from '../../stores/agent-store';
import { tokens } from '../../theme/tokens';

export function MessageQueuePanel(): React.JSX.Element | null {
  const snapshot = useAgentStore((state) => state.messageQueue.snapshot);
  if (!snapshot || snapshot.pendingCount === 0) {
    return null;
  }

  const labels = getTuiLabels();
  const presentation = presentTuiMessageQueue(snapshot);

  return (
    <Box
      flexDirection="column"
      marginLeft={1}
      marginRight={1}
      paddingLeft={1}
      paddingRight={1}
      borderStyle="single"
      borderColor={tokens.warning}
    >
      <Box>
        <Text color={tokens.warning} bold>
          {labels.queue.nextTurn} · {presentation.pendingCount}
        </Text>
        {presentation.hasPriorityContinuation ? (
          <Text color={tokens.muted}> · {labels.queue.continuationPriority}</Text>
        ) : null}
      </Box>
      {presentation.rows.map((row) => (
        <Box key={row.id}>
          <Text color={row.isPriorityContinuation ? tokens.info : tokens.muted}>
            {row.ordinal}. {queueKindLabel(row.kind, labels.queue)}:{' '}
          </Text>
          <Text>{row.preview}</Text>
        </Box>
      ))}
      {presentation.hiddenCount > 0 ? (
        <Text color={tokens.muted}>
          +{presentation.hiddenCount} {labels.queue.moreItems}
        </Text>
      ) : null}
      <Text color={tokens.muted}>{labels.queue.commandHint}</Text>
    </Box>
  );
}

function queueKindLabel(
  kind: TuiQueueRowKind,
  labels: ReturnType<typeof getTuiLabels>['queue'],
): string {
  switch (kind) {
    case 'user-message':
      return labels.userMessage;
    case 'task-continuation':
      return labels.taskContinuation;
    case 'subagent-continuation':
      return labels.subagentContinuation;
    case 'system-continuation':
      return labels.systemContinuation;
  }
}
