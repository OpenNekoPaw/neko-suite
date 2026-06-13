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
          contentBlocks: [
            {
              id: 'block-tool-1',
              type: 'tool_call',
              timestamp: 1,
              toolCall: {
                id: 'tool-1',
                name: 'read_file',
                arguments: { path: '/tmp/a.ts' },
                result: { success: true, data: 'content' },
              },
            },
            {
              id: 'block-tool-2',
              type: 'tool_call',
              timestamp: 2,
              toolCall: {
                id: 'tool-2',
                name: 'write_file',
                arguments: { path: '/tmp/b.ts' },
              },
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

  it('excludes persisted error messages from agent history', () => {
    expect(
      projectConversationMessagesToAgentHistory([
        {
          id: 'msg-1',
          role: 'user',
          content: 'Try again',
          timestamp: 1,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Provider timed out',
          timestamp: 2,
          isError: true,
        },
        {
          id: 'msg-3',
          role: 'assistant',
          content: 'Recovered.',
          timestamp: 3,
        },
      ]),
    ).toEqual([
      { role: 'user', content: 'Try again' },
      { role: 'assistant', content: 'Recovered.' },
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
            contentBlocks: [
              {
                id: 'block-tool-1',
                type: 'tool_call',
                timestamp: 2,
                toolCall: {
                  id: 'tool-1',
                  name: 'read_file',
                  arguments: { path: 'a.ts' },
                  result: { success: true, data: { ok: true } },
                },
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

  it('keeps displayed error messages out of the shared resume-layer save plan', () => {
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
            content: 'Run this',
            timestamp: 1,
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Provider timed out',
            timestamp: 2,
            isError: true,
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
        messages: [{ role: 'user', content: 'Run this' }],
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
