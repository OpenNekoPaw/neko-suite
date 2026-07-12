import { describe, expect, it } from 'vitest';
import type { AgentTurnTimelineAssistantTextItem } from '../agent-turn-timeline';
import {
  applyAgentTurnProjectionOperations,
  cloneAgentTurnProjectionItem,
} from '../conversation-projection';

function textItem(content: string, revision: number): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: 'conversation-a',
    turnId: 'turn-a',
    messageId: 'message-a',
    itemId: 'text-a',
    sequence: 1,
    itemRevision: revision,
    kind: 'assistant_text',
    status: 'streaming',
    createdAt: 1,
    updatedAt: revision,
    payload: {
      content,
      sourceGeneration: 1,
    },
  };
}

describe('conversation projection contract', () => {
  it('applies append operations with the same canonical semantics for producers and replicas', () => {
    const items = new Map();

    applyAgentTurnProjectionOperations(items, [
      { operation: 'append', item: textItem('first', 1) },
      { operation: 'append', item: textItem('-second', 2) },
    ]);

    expect(items.get('text-a')).toMatchObject({
      itemRevision: 2,
      payload: { content: 'first-second' },
    });
  });

  it('fails visibly when a patch reuses a stale item revision', () => {
    const items = new Map([['text-a', textItem('first', 2)]]);

    expect(() =>
      applyAgentTurnProjectionOperations(items, [
        { operation: 'append', item: textItem('-stale', 2) },
      ]),
    ).toThrow(/revision must increase/);
  });

  it('returns detached item clones for immutable projection snapshots', () => {
    const item = textItem('source', 1);
    const clone = cloneAgentTurnProjectionItem(item);

    expect(clone).toEqual(item);
    expect(clone).not.toBe(item);
    expect(clone.payload).not.toBe(item.payload);
  });
});
