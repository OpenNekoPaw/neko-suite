import { describe, expect, it } from 'vitest';
import {
  AGENT_TURN_TIMELINE_SCHEMA_VERSION,
  validateAgentTurnTimelineMessage,
  validateAgentTurnTimelineSnapshotRequest,
  type AgentTurnTimelineAssistantTextItem,
  type AgentTurnTimelineMessage,
  type AgentTurnTimelineThinkingItem,
  type AgentTurnTimelineValidationState,
} from '../agent-turn-timeline';

const identity = {
  connectionEpoch: 'epoch-1',
  conversationId: 'conv-1',
  turnId: 'turn-1',
  messageId: 'msg-1',
} as const;

function batch(input: {
  deliveryRevision: number;
  operations: AgentTurnTimelineMessage['operations'];
  batchKind?: AgentTurnTimelineMessage['batchKind'];
  completion?: AgentTurnTimelineMessage['completion'];
}): AgentTurnTimelineMessage {
  return {
    type: 'agentTurnTimeline',
    schemaVersion: AGENT_TURN_TIMELINE_SCHEMA_VERSION,
    ...identity,
    batchKind: input.batchKind ?? 'delta',
    deliveryRevision: input.deliveryRevision,
    operations: input.operations,
    ...(input.completion ? { completion: input.completion } : {}),
  };
}

function textItem(input: {
  itemRevision: number;
  content: string;
  sourceGeneration?: number;
  status?: AgentTurnTimelineAssistantTextItem['status'];
}): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: identity.conversationId,
    turnId: identity.turnId,
    messageId: identity.messageId,
    itemId: 'text-1',
    sequence: 1,
    itemRevision: input.itemRevision,
    kind: 'assistant_text',
    status: input.status ?? 'streaming',
    payload: {
      content: input.content,
      format: 'markdown',
      sourceGeneration: input.sourceGeneration ?? 1,
    },
    createdAt: 1,
    updatedAt: input.itemRevision,
  };
}

function thinkingItem(itemRevision: number): AgentTurnTimelineThinkingItem {
  return {
    conversationId: identity.conversationId,
    turnId: identity.turnId,
    messageId: identity.messageId,
    itemId: 'thinking-1',
    sequence: 0,
    itemRevision,
    kind: 'thinking',
    status: 'streaming',
    payload: { content: 'analysis', sourceGeneration: 1 },
    createdAt: 1,
    updatedAt: itemRevision,
  };
}

function apply(
  message: AgentTurnTimelineMessage,
  state?: AgentTurnTimelineValidationState,
): AgentTurnTimelineValidationState {
  const result = validateAgentTurnTimelineMessage(message, state);
  expect(result.diagnostics).toEqual([]);
  expect(result.nextState).toBeDefined();
  return result.nextState!;
}

describe('Agent Timeline V2 contract', () => {
  it('accepts ordered thinking, text, tool, task, and media operations', () => {
    let state = apply(
      batch({
        deliveryRevision: 1,
        operations: [{ operation: 'append', item: thinkingItem(1) }],
      }),
    );
    state = apply(
      batch({
        deliveryRevision: 2,
        operations: [
          {
            operation: 'complete',
            itemId: 'thinking-1',
            itemRevision: 2,
            kind: 'thinking',
            sourceGeneration: 1,
            status: 'complete',
            updatedAt: 2,
          },
          { operation: 'append', item: textItem({ itemRevision: 1, content: 'A' }) },
          {
            operation: 'upsert',
            item: {
              ...identity,
              itemId: 'tool-1',
              sequence: 2,
              itemRevision: 1,
              kind: 'tool_call',
              status: 'pending',
              payload: {
                toolCall: { id: 'call-1', name: 'read', arguments: { path: 'a.md' } },
              },
              createdAt: 2,
              updatedAt: 2,
            },
          },
          {
            operation: 'upsert',
            item: {
              ...identity,
              itemId: 'task-1',
              sequence: 3,
              itemRevision: 1,
              kind: 'task',
              status: 'pending',
              parentAnchor: 'tool_call',
              parentToolCallId: 'call-1',
              payload: { workItem: { id: 'task-1' } },
              createdAt: 2,
              updatedAt: 2,
            },
          },
          {
            operation: 'upsert',
            item: {
              ...identity,
              itemId: 'media-1',
              sequence: 4,
              itemRevision: 1,
              kind: 'media',
              status: 'pending',
              parentAnchor: 'turn',
              payload: { workItem: { id: 'media-1' } },
              createdAt: 2,
              updatedAt: 2,
            },
          },
        ] as AgentTurnTimelineMessage['operations'],
      }),
      state,
    );

    expect(state.deliveryRevision).toBe(2);
    expect(state.items.size).toBe(5);
  });

  it('accepts semantic error codes without prose and rejects empty error payloads', () => {
    const codeOnly = batch({
      deliveryRevision: 1,
      operations: [
        {
          operation: 'upsert',
          item: {
            ...identity,
            itemId: 'error-1',
            sequence: 1,
            itemRevision: 1,
            kind: 'error',
            status: 'failed',
            payload: { code: 'agent-error-without-detail' },
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
    });
    expect(validateAgentTurnTimelineMessage(codeOnly).diagnostics).toEqual([]);

    const emptyPayload = structuredClone(codeOnly) as unknown as {
      operations: Array<{ item: { payload: Record<string, unknown> } }>;
    };
    emptyPayload.operations[0]!.item.payload = {};
    expect(
      validateAgentTurnTimelineMessage(emptyPayload as unknown as AgentTurnTimelineMessage)
        .diagnostics,
    ).toEqual([expect.objectContaining({ code: 'invalid-item', itemId: 'error-1' })]);
  });

  it.each([
    [1, 'duplicate-delivery-revision'],
    [0, 'invalid-delivery-revision'],
    [3, 'delivery-revision-gap'],
  ] as const)('rejects delivery revision %s with %s', (revision, code) => {
    const state = apply(
      batch({
        deliveryRevision: 1,
        operations: [{ operation: 'append', item: textItem({ itemRevision: 1, content: 'a' }) }],
      }),
    );
    const result = validateAgentTurnTimelineMessage(
      batch({ deliveryRevision: revision, operations: [] }),
      state,
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code }));
  });

  it('accepts a coalesced first mutation with an item revision greater than one', () => {
    const state = apply(
      batch({
        deliveryRevision: 1,
        operations: [
          { operation: 'append', item: textItem({ itemRevision: 2_000, content: 'coalesced' }) },
        ],
      }),
    );

    expect(state.items.get('text-1')?.itemRevision).toBe(2_000);
  });

  it('distinguishes append from replacement generations', () => {
    let state = apply(
      batch({
        deliveryRevision: 1,
        operations: [{ operation: 'append', item: textItem({ itemRevision: 1, content: 'abc' }) }],
      }),
    );
    state = apply(
      batch({
        deliveryRevision: 2,
        operations: [
          {
            operation: 'replace',
            item: textItem({ itemRevision: 2, content: 'new', sourceGeneration: 2 }),
          },
        ],
      }),
      state,
    );
    const invalidAppend = validateAgentTurnTimelineMessage(
      batch({
        deliveryRevision: 3,
        operations: [
          {
            operation: 'append',
            item: textItem({ itemRevision: 3, content: 'x', sourceGeneration: 1 }),
          },
        ],
      }),
      state,
    );

    expect(state.items.get('text-1')?.sourceGeneration).toBe(2);
    expect(invalidAppend.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-source-generation' }),
    );
  });

  it('accepts coalesced item revision jumps and completion while rejecting duplicate or stale mutations', () => {
    let state = apply(
      batch({
        deliveryRevision: 1,
        operations: [{ operation: 'append', item: textItem({ itemRevision: 1, content: 'a' }) }],
      }),
    );
    state = apply(
      batch({
        deliveryRevision: 2,
        operations: [
          { operation: 'append', item: textItem({ itemRevision: 2_000, content: 'b' }) },
        ],
      }),
      state,
    );
    state = apply(
      batch({
        deliveryRevision: 3,
        operations: [
          { operation: 'append', item: textItem({ itemRevision: 4_000, content: 'c' }) },
        ],
      }),
      state,
    );

    for (const [itemRevision, code] of [
      [4_000, 'duplicate-item-revision'],
      [3_999, 'stale-item-revision'],
    ] as const) {
      const invalid = validateAgentTurnTimelineMessage(
        batch({
          deliveryRevision: 4,
          operations: [
            { operation: 'append', item: textItem({ itemRevision, content: 'invalid' }) },
          ],
        }),
        state,
      );
      expect(invalid.diagnostics).toContainEqual(expect.objectContaining({ code }));
    }

    state = apply(
      batch({
        deliveryRevision: 4,
        operations: [
          {
            operation: 'complete',
            itemId: 'text-1',
            itemRevision: 4_001,
            kind: 'assistant_text',
            sourceGeneration: 1,
            status: 'complete',
            updatedAt: 4_001,
          },
        ],
      }),
      state,
    );
    const late = validateAgentTurnTimelineMessage(
      batch({
        deliveryRevision: 5,
        operations: [
          { operation: 'append', item: textItem({ itemRevision: 5_000, content: 'late' }) },
        ],
      }),
      state,
    );
    expect(late.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'completed-item-mutation' }),
    );
  });

  it('accepts authoritative snapshots and rejects non-snapshot operations in them', () => {
    const snapshot = validateAgentTurnTimelineMessage(
      batch({
        batchKind: 'snapshot',
        deliveryRevision: 12,
        operations: [
          { operation: 'snapshot', item: textItem({ itemRevision: 9, content: 'authoritative' }) },
        ],
      }),
    );
    expect(snapshot.ok).toBe(true);
    expect(snapshot.nextState?.deliveryRevision).toBe(12);

    const invalid = validateAgentTurnTimelineMessage(
      batch({
        batchKind: 'snapshot',
        deliveryRevision: 12,
        operations: [{ operation: 'append', item: textItem({ itemRevision: 9, content: 'bad' }) }],
      }),
    );
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-operation' }),
    );
  });

  it('rejects unknown schema versions and V1 events shapes', () => {
    for (const raw of [
      { ...batch({ deliveryRevision: 1, operations: [] }), schemaVersion: 99 },
      { type: 'agentTurnTimeline', ...identity, events: [] },
    ]) {
      const result = validateAgentTurnTimelineMessage(raw);
      expect(result.ok).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'unsupported-schema-version' }),
      );
    }
  });

  it('validates explicit snapshot requests', () => {
    expect(
      validateAgentTurnTimelineSnapshotRequest({
        type: 'requestAgentTurnTimelineSnapshot',
        schemaVersion: 2,
        ...identity,
        reason: 'revision-gap',
        lastAppliedDeliveryRevision: 10,
      }).ok,
    ).toBe(true);
    expect(
      validateAgentTurnTimelineSnapshotRequest({
        type: 'requestAgentTurnTimelineSnapshot',
        schemaVersion: 1,
        ...identity,
        reason: 'reload',
      }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'unsupported-schema-version' }));
  });
});
