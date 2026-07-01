import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentEvent } from '@neko/agent';
import { ToolRegistry } from '@neko/agent';
import type { IService, StreamChunk } from '@neko/shared';
import { createPlatformHarness, resolveAgentRealApiProfile } from '@neko-agent/test-utils/real-api';
import { createEventAdapter } from '../adapters/event-adapter';
import { runAgent } from '../core/runner';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { useAgentStore } from '../stores/agent-store';
import { useConversationStore } from '../stores/conversation-store';
import { useUIStore } from '../stores/ui-store';

const SAFE_ECHO_TOOL_NAME = 'NekoHarnessEcho';
const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('TUI real harness projection contract', () => {
  it('fails visibly before a real TUI run when profile config is missing', () => {
    expect(() =>
      resolveAgentRealApiProfile({
        env: { NEKO_AGENT_REAL_API: '1' },
        requireConfig: true,
      }),
    ).toThrow('requires NEKO_AGENT_TEST_CONFIG');
  });

  it('submits through the TUI runner with the selected real provider service', async () => {
    const profile = resolveAgentRealApiProfile({ requireConfig: true });
    if (profile.profile === 'mock') {
      throw new Error('TUI real API harness requires a non-mock profile');
    }

    const workDir = profile.workDir ?? (await createTempRoot());
    const platformHarness = createPlatformHarness({
      profile,
      toolRegistry: new ToolRegistry(),
      workspacePath: workDir,
    });

    try {
      const providerId = platformHarness.providerId;
      const modelId = platformHarness.modelId;
      if (!providerId || !modelId) {
        throw new Error('TUI real API harness requires selected provider/model identity');
      }
      const provider = platformHarness.platform?.config.getProvider(providerId);
      if (!provider) {
        throw new Error(`Selected provider is unavailable in TUI real profile: ${providerId}`);
      }

      const outputs: string[] = [];
      const result = await runAgent({
        config: {
          ...DEFAULT_CLI_CONFIG,
          provider: providerId,
          providerType: provider.type,
          providerRequiresApiKey: provider.requiresApiKey !== false,
          model: modelId,
          chatModel: { providerId, modelId },
          maxTokens: 96,
          workDir,
        },
        runOptions: {
          prompt: 'Neko TUI real API smoke: answer in one short sentence.',
          interactive: false,
          stream: true,
          maxIterations: 1,
          timeout: profile.timeoutMs,
        },
        service: platformHarness.service,
        onOutput: (text) => outputs.push(text),
      });

      expect(result.success).toBe(true);
      expect(result.agentResult?.success).toBe(true);
      expect(result.output?.trim().length).toBeGreaterThan(0);
      expect(outputs.join('').trim().length).toBeGreaterThan(0);
    } finally {
      platformHarness.dispose();
    }
  }, 180_000);

  it('projects streamed text, tool events, confirmations, and errors to TUI stores', () => {
    resetTuiStores();
    const adapter = createEventAdapter({
      agentStore: useAgentStore.getState(),
      conversationStore: useConversationStore.getState(),
      uiStore: useUIStore.getState(),
    });

    for (const event of [
      { type: 'text_delta', content: 'hello ' },
      {
        type: 'tool_call',
        toolCall: {
          id: 'call-1',
          name: SAFE_ECHO_TOOL_NAME,
          arguments: { message: 'ok' },
        },
      },
      {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'call-1',
          success: true,
          data: { message: 'ok' },
        },
      },
      {
        type: 'tool_confirmation',
        toolConfirmation: {
          toolCall: {
            id: 'call-2',
            index: 0,
            name: 'NekoHarnessWriteFile',
            arguments: { relativePath: 'out.txt' },
          },
          action: 'write file',
          description: 'write file',
          details: {},
          confirmationToken: 'confirm-1',
        },
      },
      { type: 'text_delta', content: 'world' },
      { type: 'done' },
      { type: 'error', error: new Error('provider failed') },
    ] satisfies AgentEvent[]) {
      adapter.handleEvent(event);
    }

    const conversation = useConversationStore.getState();
    expect(conversation.messages.some((message) => message.content === 'hello world')).toBe(true);
    expect(
      conversation.messages.some((message) => message.content.includes('provider failed')),
    ).toBe(true);
    const assistant = conversation.messages.find((message) =>
      message.timelineRows?.some((row) => row.toolCallId === 'call-1'),
    );
    expect(assistant?.toolCalls).toEqual([]);
    expect(assistant?.timelineRows?.find((row) => row.toolCallId === 'call-1')).toMatchObject({
      kind: 'tool',
      toolCallId: 'call-1',
      toolName: SAFE_ECHO_TOOL_NAME,
      status: 'success',
    });
    expect(
      assistant?.timelineRows?.find(
        (row) => row.diagnosticCode === 'unknown-tool-confirmation-anchor',
      ),
    ).toMatchObject({
      kind: 'diagnostic',
      status: 'error',
      diagnosticCode: 'unknown-tool-confirmation-anchor',
      parent: { kind: 'tool', id: 'call-2' },
    });
    expect(useUIStore.getState().pendingApproval).toMatchObject({
      toolCallId: 'call-2',
      toolName: 'NekoHarnessWriteFile',
    });
    expect(useAgentStore.getState().status).toBe('error');
  });

  it('does not report timeout interruption as a successful TUI run', async () => {
    const outputs: string[] = [];
    const result = await runAgent({
      config: {
        ...DEFAULT_CLI_CONFIG,
        provider: 'mock',
        providerType: 'mock',
        providerRequiresApiKey: false,
        model: 'mock-agent-harness-model',
        workDir: process.cwd(),
      },
      runOptions: {
        prompt: 'stream too slowly',
        interactive: false,
        stream: true,
        maxIterations: 1,
        timeout: 1,
      },
      service: createScriptedService({
        content: 'late',
        streamDelayMs: 10,
      }),
      onOutput: (text) => outputs.push(text),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(result.agentResult?.success).toBe(false);
    expect(outputs.join('')).toContain('[Timeout] Execution aborted');
  });
});

function createScriptedService(input: {
  readonly content: string;
  readonly streamDelayMs?: number;
}): IService {
  return {
    async chat() {
      return {
        id: 'mock-tui-response',
        model: 'mock-agent-harness-model',
        message: { role: 'assistant', content: input.content },
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    },
    chatStream() {
      return scriptedStream(input.content, input.streamDelayMs ?? 0);
    },
    async embed(texts) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

async function* scriptedStream(content: string, delayMs: number): AsyncIterable<StreamChunk> {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  yield { type: 'content', content };
  yield { type: 'done', finishReason: 'stop' };
}

function resetTuiStores(): void {
  useAgentStore.getState().reset();
  useConversationStore.getState().clearMessages();
  useUIStore.setState({
    pendingApproval: null,
    pendingSelection: null,
    pendingPlanReview: false,
    scrollOffset: 0,
    inputFocused: true,
    slashMenuOpen: false,
  });
}

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-real-api-tui-'));
  tempRoots.push(root);
  return root;
}
