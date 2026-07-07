import React from 'react';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CLIConfig } from '../core/types';

interface CapturedAppProps {
  readonly config: CLIConfig;
  readonly initialPrompt?: string;
}

let tempRoot: string | undefined;
let capturedAppProps: CapturedAppProps | undefined;

afterEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  capturedAppProps = undefined;
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe('createCliProgram actions', () => {
  it('passes top-level prompt arguments to the interactive App when -C selects workDir', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);

    vi.doMock('ink', () => ({
      render: (element: React.ReactElement<CapturedAppProps>) => {
        capturedAppProps = element.props;
        return { waitUntilExit: async () => undefined };
      },
    }));
    vi.doMock('../components/App', () => ({
      App: (props: CapturedAppProps) => React.createElement('mock-app', props),
    }));
    vi.doMock('../core/config', () => ({
      loadConfig: vi.fn(() => config),
      validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
      listProviders: vi.fn(() => []),
      getProviderModels: vi.fn(() => []),
    }));
    vi.doMock('../utils/terminal', () => ({
      detectCapabilities: () => ({ supportsColor: true }),
    }));

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram();
    program.exitOverride();

    await program.parseAsync(['node', 'neko', '-C', tempRoot, '你好']);

    expect(capturedAppProps?.config.workDir).toBe(tempRoot);
    expect(capturedAppProps?.initialPrompt).toBe('你好');
  });
});

function createConfig(workDir: string): CLIConfig {
  return {
    provider: 'nekoapi-chat',
    providerType: 'openai-chat',
    providerRequiresApiKey: false,
    model: 'gpt-5.5',
    chatModel: {
      providerId: 'nekoapi-chat',
      modelId: 'gpt-5.5',
    },
    mediaModels: [],
    maxTokens: 8192,
    temperature: 0.7,
    verbose: false,
    workDir,
    mcpServers: [],
    outputFormat: 'text',
    thinkingBudget: 0,
  };
}
