import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTool, type IService, type StreamChunk } from '@neko/shared';
import { AgentSession } from '../agent-session';
import type { AgentEvent, AgentSessionConfig, ExecutionMode, IJournalWriter } from '../types';
import { ToolRegistry } from '../../tools/tool-registry';
import { createCoreTools } from '../../tools/core/core-tools';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function createTextService(text = 'done'): IService {
  return {
    chat: async () => ({
      id: 'response-1',
      model: 'test-model',
      message: { role: 'assistant', content: text },
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
    chatStream: () => streamText(text),
    embed: async () => ({ embeddings: [] }),
  };
}

async function* streamText(text: string): AsyncIterable<StreamChunk> {
  yield { type: 'content', content: text };
  yield {
    type: 'done',
    finishReason: 'stop',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
}

function createToolCallService(): IService {
  let call = 0;
  return {
    chat: async () => {
      throw new Error('chat() is not used');
    },
    chatStream: () => {
      call += 1;
      return call === 1 ? streamToolCall() : streamText('wrote file');
    },
    embed: async () => ({ embeddings: [] }),
  };
}

function createEmptyStreamService(): IService {
  return {
    chat: async () => ({
      id: 'empty-response',
      model: 'test-model',
      message: { role: 'assistant', content: '' },
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    chatStream: () => streamEmptyResponse(),
    embed: async () => ({ embeddings: [] }),
  };
}

async function* streamToolCall(): AsyncIterable<StreamChunk> {
  yield {
    type: 'tool_call',
    toolCall: {
      id: 'call-write',
      type: 'function',
      function: { name: 'WriteFile', arguments: '{"path":"out.txt","content":"hello"}' },
    },
  };
  yield {
    type: 'done',
    finishReason: 'tool_calls',
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
  };
}

async function* streamCurrentPlanReads(): AsyncIterable<StreamChunk> {
  for (const [id, filePath] of [
    ['call-plan', 'plan.md'],
    ['call-source', 'story.md'],
  ] as const) {
    yield {
      type: 'tool_call',
      toolCall: {
        id,
        type: 'function',
        function: { name: 'Read', arguments: JSON.stringify({ file_path: filePath }) },
      },
    };
  }
  yield {
    type: 'done',
    finishReason: 'tool_calls',
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
  };
}

async function* streamCurrentRenderCall(): AsyncIterable<StreamChunk> {
  yield {
    type: 'tool_call',
    toolCall: {
      id: 'call-render',
      type: 'function',
      function: {
        name: 'RenderShot',
        arguments: JSON.stringify({ shotId: 'shot-1', source: 'story.md' }),
      },
    },
  };
  yield {
    type: 'done',
    finishReason: 'tool_calls',
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
  };
}

async function* streamEmptyResponse(): AsyncIterable<StreamChunk> {
  yield {
    type: 'done',
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

function createConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    service: createTextService(),
    toolRegistry: new ToolRegistry(),
    systemPrompt: 'You are a boundary characterization agent.',
    conversationId: 'conv-boundary',
    maxIterations: 3,
    ...overrides,
  };
}

function readCompressorTokenThreshold(session: AgentSession): number {
  return (
    session as unknown as Record<
      string,
      { getConfig: () => { triggers: { tokenThreshold: number } } }
    >
  )['_compressor'].getConfig().triggers.tokenThreshold;
}

class CapturingJournalWriter implements IJournalWriter {
  readonly events: AgentEvent[] = [];
  readonly snapshots: Array<{
    historyLength: number;
    executionMode: ExecutionMode;
    versionLogSize: number;
  }> = [];
  readonly appendEvent = vi.fn(async (_seq: number, event: AgentEvent) => {
    this.events.push(event);
    return `event-${this.events.length}`;
  });
  readonly appendSnapshot = vi.fn(
    async (
      _seq: number,
      snapshot: {
        historyLength: number;
        executionMode: NonNullable<AgentSessionConfig['executionMode']>;
        versionLogSize: number;
      },
    ) => {
      this.snapshots.push(snapshot);
    },
  );
  readonly flush = vi.fn(async () => {});
  readonly dispose = vi.fn(async () => {});
}

describe('AgentSession boundary characterization', () => {
  it('surfaces an error instead of completing when the model returns no content or tool calls', async () => {
    const session = new AgentSession(
      createConfig({
        service: createEmptyStreamService(),
      }),
    );

    const events = await collect(session.execute('empty response'));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            message:
              'The selected chat model completed without returning text, tool calls, thinking, or an error. Please retry or choose another model.',
          }),
        }),
      ]),
    );
    expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
    session.dispose();
  });

  it('dispatches ordinary turns without legacy IDC run controls', async () => {
    const journalWriter = new CapturingJournalWriter();
    const session = new AgentSession(
      createConfig({
        journalWriter,
      }),
    );

    const events = await collect(session.execute('hello'));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text_delta', content: 'done' }),
        expect.objectContaining({ type: 'done' }),
      ]),
    );
    expect(journalWriter.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['user_message', 'text', 'done']),
    );
    expect(journalWriter.appendSnapshot).toHaveBeenCalledTimes(1);
    expect(session.getHistory().map((message) => message.role)).toEqual(
      expect.arrayContaining(['system', 'user', 'assistant']),
    );
    session.dispose();
    expect(journalWriter.dispose).toHaveBeenCalledTimes(1);
  });

  it('routes ask-mode tool confirmation through the ordinary approval engine', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async () => ({ success: true, data: { path: 'out.txt' } }));
    registry.register(
      createTool({
        name: 'WriteFile',
        description: 'Write a file',
        category: 'file',
        parameters: { type: 'object', properties: {}, required: [] },
        execute,
      }),
    );
    const onConfirmTool = vi.fn(async () => true);
    const session = new AgentSession(
      createConfig({
        service: createToolCallService(),
        toolRegistry: registry,
        executionMode: 'ask',
        onConfirmTool,
      }),
    );

    const events = await collect(session.execute('write it'));

    expect(onConfirmTool).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
    expect(session.getPendingConfirmations()).toEqual([]);
    session.dispose();
  });

  it('continues by re-reading current Markdown and resolving the current Tool implementation', async () => {
    const fixtureRoot = path.resolve(
      process.cwd(),
      '.test-workspaces',
      `agent-native-plan-continuation-${process.pid}`,
    );
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(path.join(fixtureRoot, 'neko', 'generated', 'video'), { recursive: true });
    await fs.writeFile(path.join(fixtureRoot, 'plan.md'), '# Approved plan\nOLD UNIT\n', 'utf-8');
    await fs.writeFile(path.join(fixtureRoot, 'story.md'), '# Story\nOLD SOURCE\n', 'utf-8');

    try {
      // Creator edits remain ordinary files. Continue must observe these current
      // contents instead of replaying content captured when approval occurred.
      await fs.writeFile(
        path.join(fixtureRoot, 'plan.md'),
        '# Approved plan\nCURRENT PLAN UNIT: render shot-1\n',
        'utf-8',
      );
      await fs.writeFile(
        path.join(fixtureRoot, 'story.md'),
        '# Story\nCURRENT SOURCE: Rin enters the station.\n',
        'utf-8',
      );

      const registry = new ToolRegistry();
      for (const tool of createCoreTools({ defaultCwd: fixtureRoot })) registry.register(tool);
      const staleExecute = vi.fn(async () => ({
        success: true,
        data: { implementation: 'stale' },
      }));
      registry.register(
        createTool({
          name: 'RenderShot',
          description: 'Render one approved shot',
          category: 'media',
          parameters: {
            type: 'object',
            properties: { shotId: { type: 'string' }, source: { type: 'string' } },
            required: ['shotId', 'source'],
          },
          execute: staleExecute,
        }),
      );
      const currentExecute = vi.fn(async () => {
        const outputPath = path.join(fixtureRoot, 'neko', 'generated', 'video', 'shot-1.mp4');
        await fs.writeFile(outputPath, 'rendered-current-tool', 'utf-8');
        return {
          success: true,
          data: { implementation: 'current', path: 'neko/generated/video/shot-1.mp4' },
        };
      });
      registry.register(
        createTool({
          name: 'RenderShot',
          description: 'Render one approved shot with current capability',
          category: 'media',
          parameters: {
            type: 'object',
            properties: { shotId: { type: 'string' }, source: { type: 'string' } },
            required: ['shotId', 'source'],
          },
          execute: currentExecute,
        }),
      );

      let serviceCall = 0;
      let messagesBeforeRender = '';
      const service: IService = {
        chat: async () => {
          throw new Error('chat() is not used');
        },
        chatStream: (messages) => {
          serviceCall += 1;
          if (serviceCall === 1) return streamCurrentPlanReads();
          if (serviceCall === 2) {
            messagesBeforeRender = JSON.stringify(messages);
            return streamCurrentRenderCall();
          }
          return streamText('Delivered neko/generated/video/shot-1.mp4');
        },
        embed: async () => ({ embeddings: [] }),
      };
      const journalWriter = new CapturingJournalWriter();
      const session = new AgentSession(
        createConfig({
          service,
          toolRegistry: registry,
          journalWriter,
          executionMode: 'auto',
          onConfirmTool: async () => true,
          maxIterations: 4,
        }),
      );

      const events = await collect(session.execute('Continue the approved current plan.'));

      expect(messagesBeforeRender).toContain('CURRENT PLAN UNIT: render shot-1');
      expect(messagesBeforeRender).toContain('CURRENT SOURCE: Rin enters the station.');
      expect(staleExecute).not.toHaveBeenCalled();
      expect(currentExecute).toHaveBeenCalledOnce();
      expect(
        await fs.readFile(path.join(fixtureRoot, 'neko/generated/video/shot-1.mp4'), 'utf-8'),
      ).toBe('rendered-current-tool');
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
      expect(journalWriter.events.some((event) => 'stage' in event)).toBe(false);
      session.dispose();
    } finally {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('preserves context compression through the public session API', async () => {
    const session = new AgentSession(createConfig());
    for (let i = 0; i < 12; i++) {
      session.addMessage({ role: 'user', content: `user message ${i}` });
      session.addMessage({ role: 'assistant', content: `assistant response ${i}` });
    }

    const beforeLength = session.getHistory().length;
    const result = await session.compressContext();

    expect(result.originalTokens).toBeGreaterThan(0);
    expect(result.compressedTokens).toBeGreaterThan(0);
    expect(session.getHistory().length).toBeLessThan(beforeLength);
    expect(session.getHistory()[0]?.role).toBe('system');
    session.dispose();
  });

  it('updates auto-compact threshold from context settings without reading output max tokens', () => {
    const session = new AgentSession(
      createConfig({
        maxTokens: 8192,
        contextSettings: { maxTokens: 120000 },
      }),
    );

    expect(readCompressorTokenThreshold(session)).toBe(120000);

    session.configure({ maxTokens: 256000, contextSettings: { maxTokens: 50000 } });

    expect(readCompressorTokenThreshold(session)).toBe(50000);
    expect((session as unknown as { _config: AgentSessionConfig })._config.maxTokens).toBe(256000);
    session.dispose();
  });

  it('manual context compression preserves the configured output cap', async () => {
    const session = new AgentSession(createConfig({ maxTokens: 8192 }));
    for (let i = 0; i < 12; i++) {
      session.addMessage({ role: 'user', content: `user message ${i}` });
      session.addMessage({ role: 'assistant', content: `assistant response ${i}` });
    }

    await session.compressContext();

    expect((session as unknown as { _config: AgentSessionConfig })._config.maxTokens).toBe(8192);
    session.dispose();
  });
});
