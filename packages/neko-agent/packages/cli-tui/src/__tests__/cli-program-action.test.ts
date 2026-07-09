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
    poisonPaths?: AgentPoisonPaths;
    debugManagerOptions?: unknown;
    runDebugServer?: Mock;
    disposeDebugManager?: Mock;
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

vi.mock('../utils/terminal', () => ({
  detectCapabilities: () => ({ supportsColor: true }),
}));

vi.mock('../core/debug-automation/session-manager', () => ({
  TuiDebugAutomationSessionManager: class {
    constructor(options: unknown) {
      mockState.debugManagerOptions = options;
      mockState.disposeDebugManager = vi.fn(async () => undefined);
    }

    async disposeAll(): Promise<void> {
      await mockState.disposeDebugManager?.();
    }
  },
}));

vi.mock('../core/debug-automation/stdio', () => ({
  runTuiDebugAutomationJsonLineServer: (...args: readonly unknown[]) => {
    if (!mockState.runDebugServer) {
      throw new Error('Mock debug automation server was not initialized');
    }
    return mockState.runDebugServer(...args);
  },
}));

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mockState.capturedAppProps = undefined;
  mockState.config = undefined;
  mockState.poisonPaths = undefined;
  mockState.debugManagerOptions = undefined;
  mockState.runDebugServer = undefined;
  mockState.disposeDebugManager = undefined;
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

  it('routes debug automation through the local developer automation stdio server', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cli-action-'));
    mockState.config = createConfig(tempRoot);
    mockState.runDebugServer = vi.fn(async () => undefined);

    const { createCliProgram } = await import('../cli');
    const program = createCliProgram();
    program.exitOverride();

    await program.parseAsync(['node', 'neko', 'debug', 'automation', '--stdio', '-C', tempRoot]);

    expect(mockState.capturedAppProps).toBeUndefined();
    expect(mockState.debugManagerOptions).toMatchObject({ defaultWorkDir: tempRoot });
    expect(mockState.runDebugServer).toHaveBeenCalledOnce();
    expect(mockState.disposeDebugManager).toHaveBeenCalledOnce();
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
