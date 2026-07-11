import { AgentMessageQueueOperationError } from '@neko/agent/runtime';
import type { AgentMessageQueueSnapshot } from '@neko-agent/types';

export function formatTuiQueueSnapshot(snapshot: AgentMessageQueueSnapshot): string {
  if (snapshot.items.length === 0) {
    return `Queue: empty (version ${snapshot.version})`;
  }
  return [
    `Queue: ${snapshot.pendingCount} pending (version ${snapshot.version})`,
    ...snapshot.items.map(
      (item, index) => `${index + 1}. ${item.id} [${item.source}] ${item.content}`,
    ),
  ].join('\n');
}

export function formatTuiQueueError(error: unknown): string {
  if (error instanceof AgentMessageQueueOperationError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
