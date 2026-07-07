import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IService, ServiceOptions, StreamChunk } from '@neko/shared';
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
