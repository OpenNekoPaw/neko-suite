import { describe, expect, it } from 'vitest';
import {
  buildConversationRecordSavePlan,
  projectConversationMessagesToAgentHistory,
} from '../conversation-record-projector';

describe('conversation-record-projector', () => {
  it('projects webview messages into agent history with tool context', () => {
    expect(
      projectConversationMessagesToAgentHistory([
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'I read the file.',
          timestamp: 1,
          toolCalls: [
            {
              id: 'tool-1',
              name: 'read_file',
              arguments: { path: '/tmp/a.ts' },
              result: { success: true, data: 'content' },
            },
            {
              id: 'tool-2',
              name: 'write_file',
              arguments: { path: '/tmp/b.ts' },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        role: 'assistant',
        content: 'I read the file.',
        toolCalls: [
          { id: 'tool-1', name: 'read_file', arguments: { path: '/tmp/a.ts' } },
          { id: 'tool-2', name: 'write_file', arguments: { path: '/tmp/b.ts' } },
        ],
        toolResults: [{ callId: 'tool-1', success: true, data: 'content' }],
      },
    ]);
  });

  it('builds a shared resume-layer save plan', () => {
    const plan = buildConversationRecordSavePlan({
      workDir: '/repo',
      conversation: {
        id: 'conv-1',
        title: 'Task',
        createdAt: 100,
        updatedAt: 200,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Read the file',
            timestamp: 1,
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Done.',
            timestamp: 2,
            toolCalls: [
              {
                id: 'tool-1',
                name: 'read_file',
                arguments: { path: 'a.ts' },
                result: { success: true, data: { ok: true } },
              },
            ],
          },
        ],
      },
    });

    expect(plan).toEqual({
      kind: 'save',
      record: {
        id: 'conv-1',
        version: 2,
        title: 'Task',
        workDir: '/repo',
        createdAt: 100,
        updatedAt: 200,
        source: 'extension',
        messages: [
          { role: 'user', content: 'Read the file' },
          { role: 'assistant', content: 'Done.' },
          {
            role: 'user',
            content: '[Tool Result for tool-1]: Success\n{\n  "ok": true\n}',
          },
        ],
      },
    });
  });

  it('skips records that cannot be persisted', () => {
    expect(
      buildConversationRecordSavePlan({
        workDir: null,
        conversation: {
          id: 'conv-1',
          title: 'Task',
          createdAt: 100,
          updatedAt: 200,
          messages: [],
        },
      }),
    ).toEqual({ kind: 'skip', reason: 'missing-work-dir' });

    expect(
      buildConversationRecordSavePlan({
        workDir: '/repo',
        conversation: undefined,
      }),
    ).toEqual({ kind: 'skip', reason: 'missing-conversation' });

    expect(
      buildConversationRecordSavePlan({
        workDir: '/repo',
        conversation: {
          id: 'conv-1',
          title: 'Task',
          createdAt: 100,
          updatedAt: 200,
          messages: [],
        },
      }),
    ).toEqual({ kind: 'skip', reason: 'empty-conversation' });
  });
});
