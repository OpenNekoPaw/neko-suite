import React from 'react';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CLIConfig } from '../core/types';

interface CapturedAppProps {
  readonly config: CLIConfig;
  readonly initialPrompt?: string;
}

let tempRoot: string | undefined;
const mockState = vi.hoisted(
  (): {
    capturedAppProps?: CapturedAppProps;
    config?: CLIConfig;
    runAgent?: Mock;
  } => ({}),
);

vi.mock('ink', () => ({
  render: (element: { readonly props?: CapturedAppProps }) => {
    mockState.capturedAppProps = element.props;
    return { waitUntilExit: async () => undefined };
  },
}));

vi.mock('../components/App', () => ({
  App: (props: CapturedAppProps) => React.createElement('mock-app', props),
}));

vi.mock('../core/config', () => ({
  loadConfig: vi.fn(() => {
    if (!mockState.config) {
      throw new Error('Mock CLI config was not initialized');
    }
    return mockState.config;
  }),
  validateConfig: vi.fn(() => ({ valid: true, errors: [] })),
  listProviders: vi.fn(() => []),
  getProviderModels: vi.fn(() => []),
}));

vi.mock('../core/runner', () => ({
  runAgent: (...args: readonly unknown[]) => {
    if (!mockState.runAgent) {
      throw new Error('Mock runAgent was not initialized');
    }
    return mockState.runAgent(...args);
  },
  runInteractive: vi.fn(),
}));

vi.mock('../utils/terminal', () => ({
  detectCapabilities: () => ({ supportsColor: true }),
}));

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockState.capturedAppProps = undefined;
  mockState.config = undefined;
  mockState.runAgent = undefined;
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe('createCliProgram actions', () => {
  it('passes top-level prompt arguments to the interactive App when -C selects workDir', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    mockState.config = config;

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram();
    program.exitOverride();

    await program.parseAsync(['node', 'neko', '-C', tempRoot, '你好']);

    expect(mockState.capturedAppProps?.config.workDir).toBe(tempRoot);
    expect(mockState.capturedAppProps?.initialPrompt).toBe('你好');
  });

  it('writes structured run result JSON to --result-file without requiring stdout parsing', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    const resultFile = path.join(tempRoot, 'reports', 'run-result.json');
    mockState.config = config;
    mockState.runAgent = vi.fn(async () => ({
      success: true,
      output: 'hello',
      duration: 42,
      agentResult: {
        success: true,
        response: 'hello',
        steps: [],
        iterations: 1,
        timing: { startTime: 1, endTime: 2, duration: 1 },
      },
    }));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram();
    program.exitOverride();

    await program.parseAsync([
      'node',
      'neko',
      'run',
      '--cd',
      tempRoot,
      '--result-file',
      resultFile,
      'hello',
    ]);

    const artifact = JSON.parse(await fs.readFile(resultFile, 'utf8')) as {
      readonly schema?: string;
      readonly success?: boolean;
      readonly output?: string;
      readonly config?: { readonly apiKey?: string };
    };
    expect(artifact).toMatchObject({
      schema: 'neko.cli-run-result.v1',
      success: true,
      output: 'hello',
      config: { apiKey: '<unset>' },
    });
    expect(mockState.runAgent).toHaveBeenCalledOnce();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
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
