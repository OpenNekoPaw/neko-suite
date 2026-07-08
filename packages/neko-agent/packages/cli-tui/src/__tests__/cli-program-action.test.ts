import React from 'react';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  createAgentPoisonPaths,
  type AgentPoisonPaths,
} from '../../../../test-utils/src/poison-paths';
import { createTuiConversationId } from '../core/tui-conversation-id';
import type { CLIConfig } from '../core/types';

interface CapturedAppProps {
  readonly config: CLIConfig;
  readonly initialPrompt?: string;
  readonly resumeConversationId?: string;
}

let tempRoot: string | undefined;
const mockState = vi.hoisted(
  (): {
    capturedAppProps?: CapturedAppProps;
    config?: CLIConfig;
    runAgent?: Mock;
    poisonPaths?: AgentPoisonPaths;
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
  mockState.poisonPaths = undefined;
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
    expect(mockState.capturedAppProps?.resumeConversationId).toBeUndefined();
  });

  it('rejects old cli conversation ids instead of routing them into TUI resume', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    const poison = createAgentPoisonPaths();
    mockState.config = config;
    mockState.poisonPaths = poison;

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram();
    program.exitOverride();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let errorOutput = '';

    try {
      await expect(
        program.parseAsync([
          'node',
          'neko',
          '-C',
          tempRoot,
          '--resume',
          'cli-legacy-123',
          '继续刚才的任务',
        ]),
      ).rejects.toThrow('process.exit unexpectedly called with "1"');
    } finally {
      errorOutput = errorSpy.mock.calls.flat().join('\n');
      errorSpy.mockRestore();
    }

    expect(errorOutput).toContain('TUI resume conversation id must be canonical');
    expect(mockState.capturedAppProps).toBeUndefined();
    poison.readlineInteractiveResume.assertNotHit();
  });

  it('routes the resume command through the Ink TUI App with an optional prompt', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    const poison = createAgentPoisonPaths();
    const conversationId = createTuiConversationId(tempRoot, {
      now: 1_714_040_000_123,
      random: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
    });
    mockState.config = config;
    mockState.poisonPaths = poison;

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram();
    program.exitOverride();

    await program.parseAsync([
      'node',
      'neko',
      'resume',
      '--cd',
      tempRoot,
      conversationId,
      '继续生成分镜',
    ]);

    expect(mockState.capturedAppProps?.config.workDir).toBe(tempRoot);
    expect(mockState.capturedAppProps?.resumeConversationId).toBe(conversationId);
    expect(mockState.capturedAppProps?.initialPrompt).toBe('继续生成分镜');
    poison.readlineInteractiveResume.assertNotHit();
  });

  it('writes structured run result JSON to --result-file without requiring stdout parsing', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    const config = createConfig(tempRoot);
    const resultFile = path.join(tempRoot, 'reports', 'run-result.json');
    const poison = createAgentPoisonPaths();
    mockState.config = config;
    mockState.poisonPaths = poison;
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
    expect(mockState.capturedAppProps).toBeUndefined();
    poison.readlineInteractiveResume.assertNotHit();
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
