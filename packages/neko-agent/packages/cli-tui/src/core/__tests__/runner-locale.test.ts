import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IService, ServiceOptions, StreamChunk } from '@neko/shared';
import { createTool, type AgentCapabilityProvider } from '@neko/shared';
import { runAgent } from '../runner';
import { DEFAULT_CLI_CONFIG } from '../types';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('runAgent locale projection', () => {
  it('passes the detected Chinese locale into the non-interactive model call', async () => {
    const previousLocale = process.env.NEKO_LOCALE;
    process.env.NEKO_LOCALE = 'zh-CN';
    let observedLocale: unknown;

    try {
      const workDir = await createTempRoot();
      const result = await runAgent({
        config: {
          ...DEFAULT_CLI_CONFIG,
          provider: 'mock',
          providerType: 'mock',
          providerRequiresApiKey: false,
          model: 'mock-agent-harness-model',
          workDir,
        },
        runOptions: {
          prompt: '生成一只猫的图片',
          interactive: false,
          stream: true,
          maxIterations: 1,
        },
        service: createScriptedService({
          content: '好的',
          onStreamOptions: (options) => {
            observedLocale = options?.locale;
          },
        }),
      });

      expect(result.success).toBe(true);
      expect(observedLocale).toBe('zh');
    } finally {
      if (previousLocale === undefined) {
        delete process.env.NEKO_LOCALE;
      } else {
        process.env.NEKO_LOCALE = previousLocale;
      }
    }
  });

  it('registers builtin ai-generate skill for non-interactive skill invocation', async () => {
    const previousLocale = process.env.NEKO_LOCALE;
    process.env.NEKO_LOCALE = 'zh-CN';

    try {
      const workDir = await createTempRoot();
      const result = await runAgent({
        config: {
          ...DEFAULT_CLI_CONFIG,
          provider: 'mock',
          providerType: 'mock',
          providerRequiresApiKey: false,
          model: 'mock-agent-harness-model',
          workDir,
        },
        runOptions: {
          prompt: '$ai-generate 生成一张猫图，只确认能力已激活',
          interactive: false,
          stream: true,
          maxIterations: 1,
        },
        service: createScriptedService({
          content: 'ai-generate ready',
        }),
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    } finally {
      if (previousLocale === undefined) {
        delete process.env.NEKO_LOCALE;
      } else {
        process.env.NEKO_LOCALE = previousLocale;
      }
    }
  });

  it('projects default image media model into run-mode GenerateImage tools', async () => {
    const workDir = await createTempRoot();
    let observedTools: readonly string[] = [];

    const result = await runAgent({
      config: {
        ...DEFAULT_CLI_CONFIG,
        provider: 'mock-chat',
        providerType: 'mock',
        providerRequiresApiKey: false,
        model: 'mock-agent-harness-model',
        chatModel: {
          providerId: 'mock-chat',
          modelId: 'mock-agent-harness-model',
        },
        defaultMediaModels: {
          image: 'mock-image:gpt-image-test',
        },
        workDir,
      },
      runOptions: {
        prompt: '生成一张猫图',
        interactive: false,
        stream: true,
        maxIterations: 1,
      },
      service: createScriptedService({
        content: 'ready',
        onStreamOptions: (options) => {
          observedTools = options?.tools?.map((tool) => tool.function.name) ?? [];
        },
      }),
      capabilityProviders: [createImageGenerationCapabilityProvider()],
    });

    expect(result.success).toBe(true);
    expect(observedTools).toContain('GenerateImage');
  });
});

function createScriptedService(input: {
  readonly content: string;
  readonly onStreamOptions?: (options: ServiceOptions | undefined) => void;
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
    chatStream(_messages, options) {
      input.onStreamOptions?.(options);
      return scriptedStream(input.content);
    },
    async embed(texts) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

async function* scriptedStream(content: string): AsyncIterable<StreamChunk> {
  yield { type: 'content', content };
  yield { type: 'done', finishReason: 'stop' };
}

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-locale-'));
  tempRoots.push(root);
  return root;
}

function createImageGenerationCapabilityProvider(): AgentCapabilityProvider {
  return {
    id: 'test.media-generation',
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }],
    getTools: () => [
      createTool({
        name: 'GenerateImage',
        description: 'Test image generation tool',
        category: 'generation',
        parameters: {
          prompt: {
            type: 'string',
            required: true,
            description: 'Prompt',
          },
        },
        execute: async () => ({ success: true, data: { taskId: 'test-task' } }),
      }),
    ],
  };
}
