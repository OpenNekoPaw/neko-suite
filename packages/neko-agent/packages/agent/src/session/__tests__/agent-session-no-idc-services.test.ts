import { describe, expect, it, vi } from 'vitest';
import type { AgentAutohealChainFactory, IService } from '@neko/shared';
import { ToolRegistry } from '../../tools';
import { AGENT_RUNTIME_CHANNELS } from '../../events';
import { AgentSession } from '../agent-session';
import type { AgentSessionConfig } from '../types';

describe('AgentSession general services without IDC', () => {
  it('initializes EventBus, Approval and autoheal without stageTracking', () => {
    const autohealFactorySpy = vi.fn((_config?: Parameters<AgentAutohealChainFactory>[0]) => ({
      run: vi.fn(async () => ({ resolution: 'pass', level: 1 })),
    }));
    const autohealFactory: AgentAutohealChainFactory = autohealFactorySpy;

    const session = new AgentSession(createConfig({ autohealChainFactory: autohealFactory }));

    expect(session.getEventBus()).not.toBeNull();
    expect(session.getApprovalEngine()).not.toBeNull();
    expect(autohealFactorySpy).toHaveBeenCalledOnce();
    expect(autohealFactorySpy.mock.calls[0]?.[0]?.eventBus).toBeDefined();
  });

  it('keeps allow and deny decisions active without stage state', async () => {
    const session = new AgentSession(createConfig());
    const approval = session.getApprovalEngine();
    expect(approval).not.toBeNull();

    const allowed = await approval!.evaluate({
      channel: 'permission',
      paradigm: 'imperative',
      subject: {
        label: 'render preview',
        kind: 'tool:RenderPreview',
        destructive: false,
        idempotent: true,
      },
      id: 'safe',
      at: 1,
    });
    const denied = await approval!.evaluate({
      channel: 'permission',
      paradigm: 'imperative',
      subject: {
        label: 'delete project',
        kind: 'tool:DeleteProject',
        destructive: true,
        idempotent: false,
      },
      id: 'unsafe',
      at: 2,
    });

    expect(allowed.resolution).toBe('auto-accept');
    expect(denied.resolution).toBe('auto-reject');
  });

  it('loads preferences and persists conversation-owned approval logs without run identity', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const session = new AgentSession(
      createConfig({
        conversationId: 'conversation-no-idc',
        workspace: {
          root: '/workspace',
          fsOps: {
            async mkdir() {},
            async appendFile(path, data) {
              writes.push({ path, data });
            },
            async readFile(path) {
              if (path === '/workspace/.neko/preferences.md') {
                return [
                  '---',
                  'kind: user-preferences',
                  'scope: project',
                  'version: 1',
                  '---',
                  '',
                  '## Always approve',
                  '- tool:GenerateImage',
                  '',
                ].join('\n');
              }
              const error = new Error('ENOENT') as NodeJS.ErrnoException;
              error.code = 'ENOENT';
              throw error;
            },
          },
        },
      }),
    );

    await session.whenPreferencesReady();
    const decision = await session.getApprovalEngine()!.evaluate({
      channel: 'permission',
      paradigm: 'imperative',
      subject: {
        label: 'generate',
        kind: 'tool:GenerateImage',
        destructive: false,
        idempotent: true,
      },
      id: 'preference',
      at: 3,
    });
    await session.flushWorkspaceSink();

    expect(decision.reason).toBe('preferences-always-approve');
    const audit = writes.find((write) => write.path.endsWith('/audits.jsonl'));
    expect(audit).toBeDefined();
    const row = JSON.parse(audit!.data.trim()) as {
      readonly event: {
        readonly channel: string;
        readonly conversationId: string;
        readonly runId?: string;
      };
    };
    expect(row.event).toEqual(
      expect.objectContaining({
        channel: AGENT_RUNTIME_CHANNELS.APPROVAL_DECIDED,
        conversationId: 'conversation-no-idc',
      }),
    );
    expect(row.event.runId).toBeUndefined();
  });

  it('provides validation factories ordinary session ports without a stage tracker', () => {
    const validationCoordinatorFactory = vi.fn(() => ({
      getBeforeThinkHooks: () => [],
      observe: vi.fn(),
      evaluatePending: vi.fn(() => null),
      getSignalHistory: () => [],
      getDecisionHistory: () => [],
      getActionHistory: () => [],
      extractMemory: vi.fn(async () => ({
        kind: 'skipped' as const,
        timestamp: 1,
        sourceEventIds: [],
        reason: 'disabled' as const,
      })),
      dispose: vi.fn(),
    }));

    new AgentSession(createConfig({ validationCoordinatorFactory }));

    expect(validationCoordinatorFactory).toHaveBeenCalledOnce();
    expect(validationCoordinatorFactory.mock.calls[0]?.[0]).not.toHaveProperty('stageTracker');
  });
});

function createConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    service: createService(),
    toolRegistry: new ToolRegistry(),
    systemPrompt: 'Test Agent',
    ...overrides,
  };
}

function createService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  };
}
