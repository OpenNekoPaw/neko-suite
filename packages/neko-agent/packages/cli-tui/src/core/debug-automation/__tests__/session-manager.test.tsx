import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TuiAutomationEmptyReadStream, TuiDebugAutomationSessionManager } from '../session-manager';
import type { TuiDebugAutomationAppPort, TuiDebugAutomationController } from '../types';
import { emitTerminalMarkdownPathEvent } from '../../../markdown/path-observer';

const mockState = vi.hoisted(
  (): {
    renderedAppProps?: {
      readonly automation?: TuiDebugAutomationController;
      readonly resumeConversationId?: string;
      readonly initialPrompt?: string;
    };
    submittedPrompts: string[];
    terminalSizes: Array<{ columns: number; rows: number }>;
  } => ({
    submittedPrompts: [],
    terminalSizes: [],
  }),
);

vi.mock('ink', () => ({
  render: (element: { readonly props?: typeof mockState.renderedAppProps }) => {
    mockState.renderedAppProps = element.props;
    emitTerminalMarkdownPathEvent({ type: 'session-created', key: 'assistant-before-bind' });
    element.props?.automation?.bind(createFakePort());
    return {
      unmount: vi.fn(),
      cleanup: vi.fn(),
      waitUntilExit: async () => undefined,
      clear: vi.fn(),
      rerender: vi.fn(),
    };
  },
}));

vi.mock('../../config', () => ({
  loadConfig: vi.fn((workDir: string) => ({
    provider: 'nekoapi-chat',
    providerType: 'openai-chat',
    providerRequiresApiKey: false,
    model: 'gpt-test',
    chatModel: { providerId: 'nekoapi-chat', modelId: 'gpt-test' },
    mediaModels: [],
    maxTokens: 8192,
    temperature: 0.7,
    verbose: false,
    workDir,
    mcpServers: [],
    outputFormat: 'text',
    thinkingBudget: 0,
  })),
  validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
}));

vi.mock('../../../components/App', () => ({
  App: (props: Record<string, unknown>) => React.createElement('mock-app', props),
}));

beforeEach(() => {
  mockState.renderedAppProps = undefined;
  mockState.submittedPrompts = [];
  mockState.terminalSizes = [];
});

describe('TuiDebugAutomationSessionManager', () => {
  it('provides an Ink-compatible automation stdin without reading terminal input', () => {
    const input = new TuiAutomationEmptyReadStream();

    expect(input.isTTY).toBe(true);
    expect(input.setRawMode(true)).toBe(input);
    expect(input.ref()).toBe(input);
    expect(input.unref()).toBe(input);
  });

  it('mounts the complete TUI App owner and submits through the bound app port', async () => {
    const manager = new TuiDebugAutomationSessionManager({
      defaultWorkDir: '/workspace',
      createSessionId: () => 'debug-session-test',
    });

    const created = await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '1',
      method: 'session.create',
      params: {},
    });

    expect(created).toMatchObject({
      sessionId: 'debug-session-test',
      conversationId: 'tui-2026-01-01T00-00-00-000Z-test',
    });
    expect(mockState.renderedAppProps?.automation).toBeDefined();

    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '2',
      method: 'message.submit',
      params: { sessionId: 'debug-session-test', prompt: 'hello' },
    });

    expect(mockState.submittedPrompts).toEqual(['hello']);

    await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '3',
      method: 'terminal.resize',
      params: { sessionId: 'debug-session-test', columns: 44, rows: 20 },
    });
    const facts = await manager.handle({
      schema: 'neko.tui-debug-automation.request.v1',
      id: '4',
      method: 'session.facts',
      params: { sessionId: 'debug-session-test' },
    });

    expect(mockState.terminalSizes).toEqual([{ columns: 44, rows: 20 }]);
    expect(facts).toMatchObject({
      markdown: {
        pathEvents: [{ type: 'session-created', key: 'assistant-before-bind' }],
        droppedPathEventCount: 0,
      },
    });
    await manager.disposeAll();
  });

  it('fails visibly for non-canonical resume conversation ids before mounting App', async () => {
    const manager = new TuiDebugAutomationSessionManager({
      defaultWorkDir: '/workspace',
    });

    await expect(
      manager.handle({
        schema: 'neko.tui-debug-automation.request.v1',
        id: '1',
        method: 'session.resume',
        params: { conversationId: 'cli-legacy-123' },
      }),
    ).rejects.toThrow('TUI resume conversation id must be canonical');
    expect(mockState.renderedAppProps).toBeUndefined();
  });
});

function createFakePort(): TuiDebugAutomationAppPort {
  return {
    ownerKind: 'tui-app-session-owner',
    isReady: () => true,
    getConversationId: () => 'tui-2026-01-01T00-00-00-000Z-test',
    async submitMessage(input) {
      mockState.submittedPrompts.push(input.prompt);
    },
    resizeTerminal(input) {
      mockState.terminalSizes.push(input);
    },
    async waitForIdle() {
      return {
        turnIdle: { idle: true, terminal: true, status: 'idle' },
        backgroundTasksIdle: { idle: true, terminal: true, status: 'idle' },
        mediaDeliveryIdle: { idle: true, terminal: true, status: 'idle' },
        taskResultObservationIdle: { idle: true, terminal: true, status: 'idle' },
        fullyIdle: true,
      };
    },
    async readFacts(input) {
      return {
        sessionId: input.sessionId,
        conversationId: 'tui-2026-01-01T00-00-00-000Z-test',
        ready: true,
        model: { providerId: 'nekoapi-chat', modelId: 'gpt-test' },
        idle: await this.waitForIdle({ timeoutMs: 1, pollIntervalMs: 1 }),
        turns: [],
        skillActivations: [],
        tasks: [],
        messageQueue: null,
        continuations: [],
        runtimeErrors: [],
        canvas: { messageSummaries: [], toolCallSummaries: [] },
        markdown: mockState.renderedAppProps?.automation?.readMarkdownFacts() ?? {
          pathEvents: [],
          droppedPathEventCount: 0,
        },
      };
    },
  };
}
