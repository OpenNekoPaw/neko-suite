import { afterEach, describe, expect, it } from 'vitest';
import {
  createTuiAutomationAppPort,
  readContinuationFacts,
  readMessageSummaryContent,
  readMessageToolCallSummaries,
} from '../app-port';
import type { Message } from '../../../types/state';
import { useAgentStore } from '../../../stores/agent-store';
import { useConversationStore } from '../../../stores/conversation-store';
import { useUIStore } from '../../../stores/ui-store';

afterEach(() => {
  useConversationStore.getState().clearMessages();
  useAgentStore.getState().setIdle();
});

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
  it('keeps structured arguments, results, and failures from timeline-only projection', () => {
    expect(
      readMessageToolCallSummaries(
        createMessage({
          timelineRows: [
            {
              id: 'tool-row-create-skill',
              sequence: 1,
              kind: 'tool',
              status: 'error',
              toolCallId: 'call-create-skill',
              toolName: 'CreateSkill',
              toolArguments: {
                target: 'project',
                skill: { name: 'portable-review' },
              },
              toolResult: { code: 'skill-already-exists' },
              toolError: 'Skill directory already exists',
              resultSummary: 'Skill directory already exists',
              timestamp: 1,
            },
          ],
        }),
      ),
    ).toEqual([
      {
        id: 'call-create-skill',
        name: 'CreateSkill',
        status: 'error',
        arguments: {
          target: 'project',
          skill: { name: 'portable-review' },
        },
        result: { code: 'skill-already-exists' },
        error: 'Skill directory already exists',
      },
    ]);
  });

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

describe('readContinuationFacts', () => {
  it('reports executed and queued continuations without user-message parsing', () => {
    useConversationStore.getState().addSystemMessage({
      content: 'Task result ready task-1. Continuing from the completed async result.',
      source: 'task-result-continuation',
      displayKind: 'task-continuation',
      metadata: { taskId: 'task-1', observationId: 'obs-1', status: 'running' },
    });

    expect(
      readContinuationFacts({
        conversationId: 'conv-1',
        pendingCount: 1,
        version: 1,
        items: [
          {
            id: 'queue-1',
            conversationId: 'conv-1',
            content: 'Continue from subagent result',
            createdAt: 10,
            source: 'subagent-result-continuation',
            displayKind: 'subagent-continuation',
            metadata: { subagentId: 'subagent-1', status: 'queued' },
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        source: 'task-result-continuation',
        displayKind: 'task-continuation',
        metadata: expect.objectContaining({ taskId: 'task-1', observationId: 'obs-1' }),
        status: 'running',
      }),
      expect.objectContaining({
        id: 'queue-1',
        source: 'subagent-result-continuation',
        displayKind: 'subagent-continuation',
        metadata: expect.objectContaining({ subagentId: 'subagent-1' }),
        status: 'queued',
      }),
    ]);
  });
});

describe('createTuiAutomationAppPort', () => {
  it('accepts submission without waiting for completion and exposes active cancellation', async () => {
    let resolveSubmit!: () => void;
    const submitPromise = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    let cancelled = false;
    const port = createTuiAutomationAppPort({
      readHandle: () => ({
        isReady: true,
        submit: () => submitPromise,
        cancel: () => {
          cancelled = true;
        },
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    useAgentStore.getState().setRunning();
    const accepted = port.submitMessage({ prompt: 'long response' });
    expect(port.cancelActiveMessage()).toBe(true);
    expect(cancelled).toBe(true);
    resolveSubmit();
    await accepted;
  });

  it('fails the machine fact read visibly without injecting human transcript prose', async () => {
    const port = createTuiAutomationAppPort({
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => {
          throw new Error('TASK_PROVIDER_DETAIL');
        },
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
      }),
      readMarkdownFacts: () => ({ pathEvents: [], droppedPathEventCount: 0 }),
    });

    await expect(
      port.readFacts({ sessionId: 'debug-session-1', includeHistory: false }),
    ).rejects.toThrow('TASK_PROVIDER_DETAIL');
    expect(useConversationStore.getState().messages).toEqual([]);
  });

  it('exposes bounded Markdown facts and applies generic terminal resize through the UI store', async () => {
    const markdown = {
      pathEvents: [{ type: 'session-created' as const, key: 'assistant-1' }],
      droppedPathEventCount: 2,
    };
    const port = createTuiAutomationAppPort({
      readHandle: () => ({
        isReady: true,
        submit: async () => undefined,
        cancel: () => undefined,
        listTasks: async () => [],
        getCurrentConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
        getHistory: () => [],
        getMessageQueueSnapshot: () => null,
      }),
      readMarkdownFacts: () => markdown,
    });

    port.resizeTerminal({ columns: 42, rows: 18 });
    const facts = await port.readFacts({ sessionId: 'debug-session-1', includeHistory: false });

    expect(useUIStore.getState().terminalSize).toEqual({ columns: 42, rows: 18 });
    expect(facts.markdown).toEqual(markdown);
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
