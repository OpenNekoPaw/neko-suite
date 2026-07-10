import { describe, expect, it } from 'vitest';
import { readMessageSummaryContent, readMessageToolCallSummaries } from '../app-port';
import type { Message } from '../../../types/state';

describe('readMessageSummaryContent', () => {
  it('uses explicit message content when present', () => {
    expect(readMessageSummaryContent(createMessage({ content: 'final answer' }))).toBe(
      'final answer',
    );
  });

  it('falls back to assistant timeline text for automation summaries', () => {
    expect(
      readMessageSummaryContent(
        createMessage({
          content: '',
          timelineRows: [
            {
              id: 'row-1',
              sequence: 1,
              kind: 'assistant_text',
              status: 'complete',
              content: 'hello ',
              timestamp: 1,
            },
            {
              id: 'row-2',
              sequence: 2,
              kind: 'tool',
              status: 'success',
              toolCallId: 'call-1',
              timestamp: 2,
            },
            {
              id: 'row-3',
              sequence: 3,
              kind: 'assistant_text',
              status: 'complete',
              content: 'world',
              timestamp: 3,
            },
          ],
        }),
      ),
    ).toBe('hello world');
  });
});

describe('readMessageToolCallSummaries', () => {
  it('includes tool calls projected as timeline rows', () => {
    expect(
      readMessageToolCallSummaries(
        createMessage({
          timelineRows: [
            {
              id: 'tool-row-1',
              sequence: 1,
              kind: 'tool',
              status: 'success',
              toolCallId: 'call-read-document',
              toolName: 'ReadDocument',
              resultSummary: '402 pages',
              timestamp: 1,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        id: 'call-read-document',
        name: 'ReadDocument',
        status: 'success',
        result: '402 pages',
      },
    ]);
  });
});

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    toolCalls: [],
    todos: [],
    timestamp: 1,
    ...overrides,
  };
}
