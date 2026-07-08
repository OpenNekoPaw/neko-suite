import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CLIConfig, CLIResult, RunOptions } from '../types';
import { createCliRunResultArtifact, writeCliRunResultArtifact } from '../run-result';

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe('CLI run result artifact', () => {
  it('redacts credentials and preserves structured run metadata', async () => {
    const config = makeConfig();
    const runOptions: RunOptions = {
      prompt: 'hello',
      interactive: false,
      stream: true,
      maxIterations: 3,
      timeout: 1000,
    };
    const result: CLIResult = {
      success: true,
      output: 'world',
      duration: 12,
      agentResult: {
        success: true,
        response: 'world',
        steps: [{ type: 'think', content: 'ok', timestamp: 1 }],
        iterations: 1,
        timing: { startTime: 1, endTime: 2, duration: 1 },
      },
    };

    const artifact = createCliRunResultArtifact({
      config,
      runOptions,
      result,
      command: ['neko', 'run', 'hello'],
    });

    expect(artifact).toMatchObject({
      schema: 'neko.cli-run-result.v1',
      command: ['neko', 'run', 'hello'],
      provider: 'gateway',
      model: 'gpt-4.1',
      success: true,
      exitCode: 0,
      stepCount: 1,
      config: {
        hasApiKey: true,
        apiKey: '<redacted>',
      },
    });
    expect(JSON.stringify(artifact)).not.toContain('sk-secret');

    const dir = await createTempRoot();
    const filePath = path.join(dir, 'nested', 'result.json');
    await writeCliRunResultArtifact(filePath, artifact);
    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toContain('"schema": "neko.cli-run-result.v1"');
    expect(written).not.toContain('sk-secret');
  });
});

function makeConfig(): CLIConfig {
  return {
    provider: 'gateway',
    providerType: 'openai',
    providerRequiresApiKey: true,
    model: 'gpt-4.1',
    chatModel: {
      providerId: 'gateway',
      modelId: 'gpt-4.1',
      capabilities: ['chat', 'vision'],
    },
    mediaModels: [],
    apiKey: 'sk-secret',
    maxTokens: 1024,
    temperature: 0.2,
    verbose: false,
    workDir: '/workspace',
    mcpServers: [],
    outputFormat: 'text',
    thinkingBudget: 0,
  };
}

async function createTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-run-result-'));
  tempRoots.push(root);
  return root;
}
