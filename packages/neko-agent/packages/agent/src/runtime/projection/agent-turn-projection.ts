import type { AgentTurnTimelineItem, AgentTurnTimelineOperation } from '@neko-agent/types';

export function applyAgentTurnProjectionOperations(
  items: Map<string, AgentTurnTimelineItem>,
  operations: readonly AgentTurnTimelineOperation[],
): void {
  for (const operation of operations) {
    if (operation.operation === 'complete') {
      applyCompletion(items, operation);
      continue;
    }

    const item = operation.item;
    assertPositiveRevision(item.itemId, item.itemRevision);
    const current = items.get(item.itemId);
    if (!current) {
      assertSequenceAvailable(items, item);
      items.set(item.itemId, cloneValue(item));
      continue;
    }

    assertStableItemIdentity(current, item);
    assertIncreasingRevision(current, item.itemRevision);
    if (operation.operation === 'append') {
      items.set(item.itemId, appendTextItem(current, item));
      continue;
    }
    items.set(item.itemId, cloneValue(item));
  }
}

export function cloneAgentTurnProjectionItem(item: AgentTurnTimelineItem): AgentTurnTimelineItem {
  return cloneValue(item);
}

function applyCompletion(
  items: Map<string, AgentTurnTimelineItem>,
  operation: Extract<AgentTurnTimelineOperation, { readonly operation: 'complete' }>,
): void {
  const current = items.get(operation.itemId);
  if (!current || (current.kind !== 'assistant_text' && current.kind !== 'thinking')) {
    throw new Error(
      `Turn projection completion references unknown text item: ${operation.itemId}.`,
    );
  }
  if (current.kind !== operation.kind) {
    throw new Error(`Turn projection completion changed item kind: ${operation.itemId}.`);
  }
  if (current.payload.sourceGeneration !== operation.sourceGeneration) {
    throw new Error(`Turn projection completion changed source generation: ${operation.itemId}.`);
  }
  assertIncreasingRevision(current, operation.itemRevision);
  items.set(operation.itemId, {
    ...current,
    itemRevision: operation.itemRevision,
    status: operation.status,
    updatedAt: operation.updatedAt,
  });
}

function appendTextItem(
  current: AgentTurnTimelineItem,
  item: AgentTurnTimelineItem,
): AgentTurnTimelineItem {
  if (current.kind === 'assistant_text' && item.kind === 'assistant_text') {
    assertSourceGeneration(current, item);
    return cloneValue({
      ...item,
      createdAt: current.createdAt,
      sequence: current.sequence,
      payload: {
        ...item.payload,
        content: current.payload.content + item.payload.content,
      },
    });
  }
  if (current.kind === 'thinking' && item.kind === 'thinking') {
    assertSourceGeneration(current, item);
    return cloneValue({
      ...item,
      createdAt: current.createdAt,
      sequence: current.sequence,
      payload: {
        ...item.payload,
        content: current.payload.content + item.payload.content,
      },
    });
  }
  throw new Error(`Turn projection append requires a text item: ${item.itemId}.`);
}

function assertStableItemIdentity(
  current: AgentTurnTimelineItem,
  next: AgentTurnTimelineItem,
): void {
  if (
    current.kind !== next.kind ||
    current.conversationId !== next.conversationId ||
    current.turnId !== next.turnId ||
    current.messageId !== next.messageId ||
    current.sequence !== next.sequence
  ) {
    throw new Error(`Turn projection operation changed item identity: ${next.itemId}.`);
  }
}

function assertSourceGeneration(
  current:
    | Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>
    | Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }>,
  next:
    | Extract<AgentTurnTimelineItem, { readonly kind: 'assistant_text' }>
    | Extract<AgentTurnTimelineItem, { readonly kind: 'thinking' }>,
): void {
  if (current.payload.sourceGeneration !== next.payload.sourceGeneration) {
    throw new Error(`Turn projection append changed source generation: ${next.itemId}.`);
  }
}

function assertPositiveRevision(itemId: string, revision: number): void {
  if (!Number.isInteger(revision) || revision <= 0) {
    throw new Error(`Turn projection item ${itemId} has invalid revision ${revision}.`);
  }
}

function assertIncreasingRevision(current: AgentTurnTimelineItem, nextRevision: number): void {
  assertPositiveRevision(current.itemId, nextRevision);
  if (nextRevision <= current.itemRevision) {
    throw new Error(
      `Turn projection item ${current.itemId} revision must increase from ${current.itemRevision}, received ${nextRevision}.`,
    );
  }
}

function assertSequenceAvailable(
  items: ReadonlyMap<string, AgentTurnTimelineItem>,
  item: AgentTurnTimelineItem,
): void {
  for (const existing of items.values()) {
    if (existing.sequence === item.sequence) {
      throw new Error(
        `Turn projection sequence ${item.sequence} is already owned by ${existing.itemId}.`,
      );
    }
  }
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
