import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityProvider, IService } from '@neko/shared';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { useAgentSession } from '../useAgentSession';

const runtimeMocks = vi.hoisted(() => ({
  latestFactoryConfig: undefined as Record<string, unknown> | undefined,
  createAgentRuntimeSession: vi.fn(),
}));

vi.mock('@neko/agent/runtime', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent/runtime')>('@neko/agent/runtime');
  return {
    ...actual,
    createAgentRuntimeSession: runtimeMocks.createAgentRuntimeSession,
  };
});

let tempRoot: string;

beforeEach(async () => {
  runtimeMocks.latestFactoryConfig = undefined;
  runtimeMocks.createAgentRuntimeSession.mockImplementation(async (config: Record<string, unknown>) => {
    runtimeMocks.latestFactoryConfig = config;
    return {
      session: createMockAgentSession(),
      promptBuilder: createMockPromptBuilder(),
      effectiveSystemPrompt: String(config.systemPrompt ?? ''),
    };
  });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-runtime-assembly-'));
});

afterEach(async () => {
  cleanup();
  await fs.rm(tempRoot, { recursive: true, force: true });
  runtimeMocks.createAgentRuntimeSession.mockReset();
});

describe('useAgentSession runtime assembly', () => {
  it('routes TUI context, memory, read roots, and capability fragments through the shared factory', async () => {
    const readyStates: boolean[] = [];

    render(
      React.createElement(RuntimeAssemblyProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
          contextSettings: { maxTokens: 12345 },
        },
        capabilityProviders: [createPromptFragmentProvider()],
        onReady: (ready: boolean) => {
          readyStates.push(ready);
        },
      }),
    );

    await waitFor(() => readyStates.includes(true));

    expect(runtimeMocks.latestFactoryConfig).toEqual(
      expect.objectContaining({
        workspaceRoot: tempRoot,
        authorizedReadRoots: expect.arrayContaining([tempRoot]),
        contextSettings: { maxTokens: 12345 },
        projectMemoryFilePath: path.join(tempRoot, '.neko', 'memory.md'),
        capabilityPromptFragments: [
          { id: 'probe:prompt-fragment', content: 'Use the probe capability.' },
        ],
      }),
    );
  });
});

function RuntimeAssemblyProbe(props: {
  readonly config: CLIConfig;
  readonly capabilityProviders: readonly AgentCapabilityProvider[];
  readonly onReady: (ready: boolean) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    service: createNoopService(),
    capabilityProviders: props.capabilityProviders,
  });

  useEffect(() => {
    props.onReady(session.isReady);
  }, [props, session.isReady]);

  return React.createElement(Text, null, 'runtime-assembly-probe');
}

function createPromptFragmentProvider(): AgentCapabilityProvider {
  return {
    id: 'probe-runtime',
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }],
    requirements: { contentAccess: false },
    getTools: () => [],
    getPromptFragments: () => [
      { id: 'probe:prompt-fragment', content: 'Use the probe capability.' },
    ],
  };
}

function createNoopService(): IService {
  return {
    async chat() {
      return { content: '' };
    },
    async *chatStream() {
      yield { type: 'done' as const };
    },
    async embed(texts: string[]) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

function createMockAgentSession(): Record<string, unknown> {
  return {
    dispose: vi.fn(),
    loadHistory: vi.fn(),
    getTokenCount: vi.fn(() => 0),
    getHistory: vi.fn(() => []),
    configure: vi.fn(),
    clearHistory: vi.fn(),
    cancel: vi.fn(),
    confirmTool: vi.fn(),
    isRunning: vi.fn(() => false),
    execute: vi.fn(async function* () {}),
    getExecutionMode: vi.fn(() => 'auto'),
    setExecutionMode: vi.fn(),
    compressContext: vi.fn(),
    setSkillProvider: vi.fn(),
    clearActiveSkill: vi.fn(),
    applySkillInjection: vi.fn(),
  };
}

function createMockPromptBuilder(): Record<string, unknown> {
  return {
    getAgentsContent: vi.fn(() => null),
    getAgentsSource: vi.fn(() => null),
    buildAgentsOverlay: vi.fn(() => null),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for runtime assembly.');
}
