/**
 * AgentRunner unit tests
 *
 * AgentRunner delegates to AgentSession from @neko/agent.
 * Tests mock createAgentSession and toSharedService to isolate the wrapper logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Platform, Service } from '@neko/platform';
import type { PromptFragment } from '@neko/shared';
import { NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND } from '@neko-agent/types';
import {
  buildAgentRuntimeSessionFactoryConfig,
  createAgentSessionWithRuntime,
  resolveAgentRuntimePromptFragments,
  SubAgentRuntimeCoordinator,
  type AgentRuntimeSessionAssemblyInput,
  type AgentRuntimeSessionController,
  type AgentRuntimeSessionControllerTarget,
} from '@neko/agent/runtime';
import { TaskManager, ToolCategoryRegistry, ToolGroupRegistry, ToolRegistry } from '@neko/agent';
import { AgentRunner, type AgentEvent, type IAgentConfig } from './agentRunner';
import { EngineClient } from '@neko/neko-client/EngineClient';

// =============================================================================
// Module mocks
// =============================================================================

const { executeCommandMock, activateEngineExtensionMock } = vi.hoisted(() => ({
  executeCommandMock: vi.fn(),
  activateEngineExtensionMock: vi.fn(),
}));

// Mock vscode (already handled by __mocks__/vscode.ts, but ensure EventEmitter works)
vi.mock('vscode', () => {
  class EventEmitter<T> {
    private _listeners: Array<(e: T) => void> = [];
    get event() {
      return (listener: (e: T) => void) => {
        this._listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data: T) {
      for (const l of this._listeners) l(data);
    }
    dispose() {
      this._listeners = [];
    }
  }
  return {
    EventEmitter,
    Uri: { file: (p: string) => ({ fsPath: p }) },
    workspace: { workspaceFolders: undefined },
    extensions: {
      getExtension: vi.fn(() => ({
        isActive: false,
        activate: activateEngineExtensionMock,
      })),
    },
    commands: {
      executeCommand: executeCommandMock,
    },
  };
});

vi.mock('../base', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createServiceId: vi.fn((name: string) => name),
}));

// Mock @neko/platform — toSharedService
vi.mock('@neko/platform', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    toSharedService: vi.fn((s: unknown) => s),
  };
});

const capabilityRuntimeMock = {
  skillRegistry: undefined as unknown,
  skillService: undefined as unknown,
  toolGroupRegistry: undefined as ToolGroupRegistry | undefined,
  toolCategoryRegistry: undefined as ToolCategoryRegistry | undefined,
  providerCardRegistry: undefined as unknown,
  operationToolAdapterRegistry: undefined as unknown,
};
let capabilityPromptFragments: Array<{ id: string; content: string }> = [];
const syncToolCategoriesMock = vi.fn();

vi.mock('../bootstrap/capabilityBootstrap', () => ({
  getCapabilityDiscoveryService: vi.fn(() => ({
    getAllPromptFragments: vi.fn(() => capabilityPromptFragments),
    syncToolCategories: syncToolCategoriesMock,
  })),
  getCapabilityRuntimeBindings: vi.fn(() => capabilityRuntimeMock),
}));

// Track the latest mock session created
let latestMockSession: ReturnType<typeof createMockSession>;
let latestCreateSessionConfig: unknown;

// Mock @neko/agent/runtime — session/runtime assembly helpers.
vi.mock('@neko/agent/runtime', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createAgentSessionWithRuntime: vi.fn((config: unknown) => {
      latestCreateSessionConfig = config;
      latestMockSession = createMockSession();
      return latestMockSession;
    }),
  };
});

// Mock @neko/agent — prompt builder and other domain helpers.
vi.mock('@neko/agent', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    createSystemPromptBuilder: vi.fn(() => ({
      loadAgentsFile: vi.fn().mockResolvedValue(undefined),
      getAgentsContent: vi.fn().mockReturnValue(null),
      build: vi.fn().mockReturnValue('default prompt'),
      buildForMode: vi.fn().mockReturnValue('default prompt'),
      buildBaseOnly: vi.fn().mockReturnValue('default prompt'),
      buildAgentsOverlay: vi.fn().mockReturnValue(undefined),
    })),
    getDefaultPersonalPath: vi.fn().mockReturnValue('~/.neko'),
  };
});

// =============================================================================
// Mock Session Factory
// =============================================================================

function createMockSession(
  options: {
    events?: AgentEvent[];
  } = {},
) {
  const history: Array<{ role: string; content: string }> = [];
  const events = options.events ?? [{ type: 'text' as const, content: 'Mock response' }];

  return {
    execute: vi.fn().mockImplementation(async function* () {
      for (const event of events) {
        yield event;
      }
    }),
    cancel: vi.fn(),
    isRunning: vi.fn().mockReturnValue(false),
    getHistory: vi.fn(() => [...history]),
    clearHistory: vi.fn(() => {
      history.length = 0;
    }),
    addMessage: vi.fn((msg: { role: string; content: string }) => {
      history.push(msg);
    }),
    loadHistory: vi.fn(),
    getTokenCount: vi.fn().mockReturnValue(100),
    compressContext: vi
      .fn()
      .mockResolvedValue({ originalTokens: 100, compressedTokens: 50, ratio: 0.5 }),
    confirmTool: vi.fn(),
    getPendingConfirmations: vi.fn().mockReturnValue([]),
    configure: vi.fn(),
    getExecutionMode: vi.fn().mockReturnValue('auto'),
    setExecutionMode: vi.fn(),
    setPromptFragments: vi.fn(),
    dispose: vi.fn(),
  };
}

// =============================================================================
// Mock Platform Factory
// =============================================================================

function createMockPlatform(): Platform {
  return {
    createService: vi.fn().mockReturnValue({} as Service),
    tools: new ToolRegistry(),
    config: {} as any,
    providers: {} as any,
    groups: {} as any,
    createAgent: vi.fn(),
    dispose: vi.fn(),
  } as unknown as Platform;
}

function createMockRuntimeController(
  target: AgentRuntimeSessionControllerTarget,
): AgentRuntimeSessionController {
  let handle:
    | {
        session: ReturnType<typeof createMockSession>;
        toolGroupRegistry?: ToolGroupRegistry;
        operationToolAdapterRegistry?: unknown;
        promptFragments?: PromptFragment[];
        conversationId?: string;
        effectiveSystemPrompt: string;
      }
    | undefined;

  return {
    async configure(input: AgentRuntimeSessionAssemblyInput) {
      const factoryConfig = buildFactoryConfig(input, handle?.operationToolAdapterRegistry);
      syncToolCategories(factoryConfig);
      const promptFragments = resolveAgentRuntimePromptFragments(factoryConfig);
      const sessionConfig = buildMockSessionConfig(factoryConfig, promptFragments);
      const session = createAgentSessionWithRuntime(sessionConfig as never) as ReturnType<
        typeof createMockSession
      >;
      handle = {
        session,
        effectiveSystemPrompt: sessionConfig.systemPrompt,
        ...(factoryConfig.capabilityRuntime?.toolGroupRegistry
          ? {
              toolGroupRegistry: factoryConfig.capabilityRuntime
                .toolGroupRegistry as ToolGroupRegistry,
            }
          : {}),
        ...(factoryConfig.operationToolAdapterRegistry
          ? { operationToolAdapterRegistry: factoryConfig.operationToolAdapterRegistry }
          : {}),
        ...(promptFragments ? { promptFragments } : {}),
        ...(factoryConfig.conversationId ? { conversationId: factoryConfig.conversationId } : {}),
      };
      target.setSession(session);
      return handle as never;
    },
    refresh(input: AgentRuntimeSessionAssemblyInput) {
      if (!handle || !target.getSession()) return null;
      const factoryConfig = buildFactoryConfig(input, handle.operationToolAdapterRegistry);
      syncToolCategories(factoryConfig);
      const promptFragments = resolveAgentRuntimePromptFragments(factoryConfig);
      target.setPromptFragments(promptFragments);
      handle.promptFragments = promptFragments;
      return {
        sessionConfig: {
          systemPrompt: factoryConfig.systemPrompt,
          modelId: factoryConfig.modelId,
          temperature: factoryConfig.temperature,
          maxTokens: factoryConfig.maxTokens,
          thinkingBudget: factoryConfig.thinkingBudget,
          maxIterations: factoryConfig.maxIterations,
          executionMode: factoryConfig.executionMode ?? 'auto',
        },
        ...(promptFragments ? { promptFragments } : {}),
      };
    },
    getHandle() {
      return handle as never;
    },
    getToolSkills() {
      return handle?.toolGroupRegistry?.listEnabled() ?? [];
    },
    dispose() {
      handle = undefined;
    },
  };
}

function buildFactoryConfig(
  input: AgentRuntimeSessionAssemblyInput,
  previousOperationToolAdapterRegistry?: unknown,
) {
  return buildAgentRuntimeSessionFactoryConfig({
    ...input,
    ...(previousOperationToolAdapterRegistry
      ? { previousOperationToolAdapterRegistry: previousOperationToolAdapterRegistry as never }
      : {}),
  });
}

function syncToolCategories(
  config: ReturnType<typeof buildAgentRuntimeSessionFactoryConfig>,
): void {
  const registry = config.toolCategoryRegistry ?? config.capabilityRuntime?.toolCategoryRegistry;
  if (registry) {
    config.syncToolCategories?.(registry);
  }
}

function buildMockSessionConfig(
  config: ReturnType<typeof buildAgentRuntimeSessionFactoryConfig>,
  promptFragments: readonly PromptFragment[] | undefined,
) {
  const capabilityRuntime = config.capabilityRuntime;
  return {
    service: config.service,
    toolRegistry: config.toolRegistry,
    systemPrompt: config.systemPrompt ?? 'default prompt',
    executionMode: config.executionMode ?? 'auto',
    maxIterations: config.maxIterations,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    thinkingBudget: config.thinkingBudget,
    modelId: config.modelId,
    ...(config.conversationId ? { conversationId: config.conversationId } : {}),
    ...(config.perceptionClients ? { perceptionClients: config.perceptionClients } : {}),
    ...(config.onConfirmTool ? { onConfirmTool: config.onConfirmTool } : {}),
    runtime: {
      workflowRuntime: {
        ...(capabilityRuntime?.skillRegistry || capabilityRuntime?.skillService
          ? {
              stageTracking: {
                ...(capabilityRuntime.skillRegistry
                  ? { skillRegistry: capabilityRuntime.skillRegistry }
                  : {}),
                ...(capabilityRuntime.skillService
                  ? { skillService: capabilityRuntime.skillService }
                  : {}),
              },
            }
          : {}),
        ...(config.taskManager
          ? { idcTaskProjection: { syncTask: vi.fn(), clearRun: vi.fn() } }
          : {}),
      },
      capabilityRuntime: {
        ...(capabilityRuntime?.skillService
          ? { skillService: capabilityRuntime.skillService }
          : {}),
        ...(capabilityRuntime?.skillRegistry
          ? { skillRegistry: capabilityRuntime.skillRegistry }
          : {}),
        ...(capabilityRuntime?.toolGroupRegistry
          ? { toolGroupRegistry: capabilityRuntime.toolGroupRegistry }
          : {}),
        ...(promptFragments ? { promptFragments } : {}),
        ...((config.toolCategoryRegistry ?? capabilityRuntime?.toolCategoryRegistry)
          ? {
              toolCategoryRegistry:
                config.toolCategoryRegistry ?? capabilityRuntime?.toolCategoryRegistry,
            }
          : {}),
        ...(capabilityRuntime?.providerCardRegistry
          ? { providerCardRegistry: capabilityRuntime.providerCardRegistry }
          : {}),
        ...(config.operationToolAdapterRegistry
          ? { operationToolAdapterRegistry: config.operationToolAdapterRegistry }
          : {}),
      },
    },
  };
}

// =============================================================================
// Helpers
// =============================================================================

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

/** Get the underlying AsyncIterator so we can call .next() */
function toIterator(iterable: AsyncIterable<AgentEvent>) {
  return iterable[Symbol.asyncIterator]();
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentRunner', () => {
  let runner: AgentRunner;
  let mockPlatform: Platform;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new AgentRunner({
      createRuntimeController: createMockRuntimeController,
      subAgentRuntime: new SubAgentRuntimeCoordinator(),
    });
    mockPlatform = createMockPlatform();
    capabilityRuntimeMock.skillRegistry = undefined;
    capabilityRuntimeMock.skillService = undefined;
    capabilityRuntimeMock.toolGroupRegistry = undefined;
    capabilityRuntimeMock.toolCategoryRegistry = undefined;
    capabilityRuntimeMock.providerCardRegistry = undefined;
    capabilityRuntimeMock.operationToolAdapterRegistry = undefined;
    capabilityPromptFragments = [];
    syncToolCategoriesMock.mockReset();
    executeCommandMock.mockReset();
    activateEngineExtensionMock.mockReset();
    vi.restoreAllMocks();
    latestCreateSessionConfig = undefined;
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe('配置', () => {
    it('应该能够配置 Agent', async () => {
      const config: IAgentConfig = {
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        maxIterations: 5,
        temperature: 0.7,
      };

      await runner.configure(config);

      const storedConfig = runner.getConfig();
      expect(storedConfig).toBe(config);
      expect(storedConfig?.systemPrompt).toBe('Test prompt');
      expect(storedConfig?.maxIterations).toBe(5);
    });

    it('未配置时 getConfig 应该返回 undefined', () => {
      expect(runner.getConfig()).toBeUndefined();
    });

    it('应该把 shared capability runtime 投影进 session bootstrap', async () => {
      const toolGroupRegistry = new ToolGroupRegistry();
      toolGroupRegistry.register({
        name: 'shared-tools',
        description: 'Shared tool group',
        tools: ['Read'],
        enabled: true,
      });
      const skillRegistry = { kind: 'skill-registry' };
      const skillService = { kind: 'skill-service' };
      const toolCategoryRegistry = new ToolCategoryRegistry();
      const providerCardRegistry = { list: vi.fn(() => []) };
      capabilityRuntimeMock.skillRegistry = skillRegistry;
      capabilityRuntimeMock.skillService = skillService;
      capabilityRuntimeMock.toolGroupRegistry = toolGroupRegistry;
      capabilityRuntimeMock.toolCategoryRegistry = toolCategoryRegistry;
      capabilityRuntimeMock.providerCardRegistry = providerCardRegistry;

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
      });

      expect(latestCreateSessionConfig).toEqual(
        expect.objectContaining({
          runtime: expect.objectContaining({
            capabilityRuntime: expect.objectContaining({
              toolGroupRegistry,
              toolCategoryRegistry,
              providerCardRegistry,
              skillService,
              skillRegistry,
            }),
            workflowRuntime: expect.objectContaining({
              stageTracking: expect.objectContaining({
                skillRegistry,
                skillService,
              }),
            }),
          }),
        }),
      );
      expect(runner.getToolSkills()).toEqual([
        expect.objectContaining({
          name: 'shared-tools',
          tools: ['Read'],
        }),
      ]);
    });

    it('应该通过 @neko/neko-client EngineClient 连接 neko-engine perception facade', async () => {
      const engineClient = new EngineClient(7788);

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        engineClient,
      });

      expect(latestCreateSessionConfig).toEqual(
        expect.objectContaining({
          perceptionClients: {
            transcribe: engineClient,
            similarity: engineClient,
            classify: engineClient,
            detectShots: engineClient,
          },
        }),
      );
    });

    it('未显式传入 EngineClient 时仍注入懒连接 neko-engine 的 perception clients', async () => {
      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
      });

      const sessionConfig = latestCreateSessionConfig as {
        perceptionClients?: {
          transcribe?: { perception: { transcribe: unknown } };
          similarity?: { perception: { similarity: unknown } };
          classify?: { perception: { classify: unknown } };
        };
      };
      expect(sessionConfig.perceptionClients?.transcribe?.perception.transcribe).toEqual(
        expect.any(Function),
      );
      expect(sessionConfig.perceptionClients?.similarity?.perception.similarity).toEqual(
        expect.any(Function),
      );
      expect(sessionConfig.perceptionClients?.classify?.perception.classify).toEqual(
        expect.any(Function),
      );
      expect(sessionConfig.perceptionClients?.detectShots?.perception.detectShots).toEqual(
        expect.any(Function),
      );
    });

    it('懒连接 perception client 调用 @neko/neko-client EngineClient dispatch 到 neko-engine', async () => {
      executeCommandMock.mockResolvedValue({ port: 7788 });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'req-1',
          status: 'ok',
          data: {
            text: 'hello',
            segments: [],
            language: 'en',
            durationSecs: 1,
          },
        }),
      } as Response);

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
      });

      const sessionConfig = latestCreateSessionConfig as {
        perceptionClients?: {
          transcribe?: {
            perception: {
              transcribe(request: { model: string; audio: string }): Promise<unknown>;
            };
          };
        };
      };

      await expect(
        sessionConfig.perceptionClients?.transcribe?.perception.transcribe({
          model: 'whisper-small',
          audio: '/tmp/audio.wav',
        }),
      ).resolves.toEqual({
        text: 'hello',
        segments: [],
        language: 'en',
        durationSecs: 1,
      });
      expect(activateEngineExtensionMock).toHaveBeenCalled();
      expect(executeCommandMock).toHaveBeenCalledWith(NEKO_ENGINE_ENSURE_FRAME_SERVER_COMMAND);

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls.at(-1);
      expect(fetchCall?.[0]).toBe('http://127.0.0.1:7788/v1/dispatch');
      expect(JSON.parse(String((fetchCall?.[1] as RequestInit).body))).toEqual(
        expect.objectContaining({
          group: 'models',
          action: 'transcribe',
          options: { model: 'whisper-small', audio: '/tmp/audio.wav' },
        }),
      );
    });

    it('应该默认装配 OperationToolAdapterRegistry 到 session runtime', async () => {
      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
      });

      expect(latestCreateSessionConfig).toEqual(
        expect.objectContaining({
          runtime: expect.objectContaining({
            capabilityRuntime: expect.objectContaining({
              operationToolAdapterRegistry: expect.objectContaining({
                list: expect.any(Function),
                findPlanner: expect.any(Function),
              }),
            }),
          }),
        }),
      );
    });

    it('应该把宿主 TaskManager 投影成 IDC task projection', async () => {
      const taskManager = new TaskManager();

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        taskManager,
      });

      expect(latestCreateSessionConfig).toEqual(
        expect.objectContaining({
          runtime: expect.objectContaining({
            workflowRuntime: expect.objectContaining({
              idcTaskProjection: expect.objectContaining({
                syncTask: expect.any(Function),
                clearRun: expect.any(Function),
              }),
            }),
          }),
        }),
      );
    });

    it('应该把 capability prompt fragments 热更新到已存在 session', async () => {
      capabilityPromptFragments = [{ id: 'neko.cut:timeline', content: 'Timeline context' }];
      capabilityRuntimeMock.toolCategoryRegistry = new ToolCategoryRegistry();

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
      });

      capabilityPromptFragments = [{ id: 'neko.canvas:shots', content: 'Shot context' }];
      runner.refreshCapabilityRuntime();

      expect(latestMockSession.setPromptFragments).toHaveBeenCalledWith([
        { id: 'neko.canvas:shots', content: 'Shot context' },
      ]);
      expect(syncToolCategoriesMock).toHaveBeenCalledWith(
        capabilityRuntimeMock.toolCategoryRegistry,
      );
    });

    it('应该把 ProviderCard 汇总成 AGENT provider expression prompt fragment', async () => {
      capabilityPromptFragments = [{ id: 'neko.cut:timeline', content: 'Timeline context' }];
      capabilityRuntimeMock.providerCardRegistry = {
        list: vi.fn(() => [
          {
            providerId: 'flux',
            displayName: 'Flux.1',
            version: '1.0.0',
            capabilities: ['image.generate'],
            sourceLayer: 'builtin',
            syntaxProfile: {
              supportsNegativePrompt: false,
              notes: [],
            },
            conceptCoverage: {
              entries: [
                {
                  concept: 'cluttercore',
                  status: 'unknown',
                  expansion: 'maximalist collection, wall of objects',
                },
              ],
            },
            trainingProfile: {
              styleAffinities: { photorealistic: 3 },
              antiBiasStrategies: ['avoid over-polished stock photo look'],
            },
          },
        ]),
      };

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
      });

      expect(latestCreateSessionConfig).toEqual(
        expect.objectContaining({
          runtime: expect.objectContaining({
            capabilityRuntime: expect.objectContaining({
              promptFragments: expect.arrayContaining([
                { id: 'neko.cut:timeline', content: 'Timeline context' },
                expect.objectContaining({
                  id: 'provider:expression-context',
                  content: expect.stringContaining('Flux.1 (flux)'),
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('应该在已选择媒体 provider/model 时注入 selected ProviderCard fragment', async () => {
      capabilityRuntimeMock.providerCardRegistry = {
        list: vi.fn(() => [
          {
            providerId: 'flux',
            displayName: 'Flux.1',
            version: '1.0.0',
            capabilities: ['image.generate'],
            sourceLayer: 'builtin',
            syntaxProfile: { supportsNegativePrompt: false, notes: [] },
            conceptCoverage: { entries: [] },
            trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
          },
          {
            providerId: 'flux',
            modelId: 'flux-pro-1.1',
            displayName: 'Flux Pro 1.1',
            version: '1.1.0',
            capabilities: ['image.generate'],
            sourceLayer: 'builtin',
            syntaxProfile: { supportsNegativePrompt: false, notes: [] },
            conceptCoverage: { entries: [] },
            trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
          },
        ]),
      };

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        providerExpressionTargets: [
          { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro-1.1' },
        ],
      });

      expect(latestCreateSessionConfig).toEqual(
        expect.objectContaining({
          runtime: expect.objectContaining({
            capabilityRuntime: expect.objectContaining({
              promptFragments: expect.arrayContaining([
                expect.objectContaining({
                  id: 'provider:expression-context:image.generate',
                  content: expect.stringContaining('Flux Pro 1.1 (flux/flux-pro-1.1)'),
                }),
              ]),
            }),
          }),
        }),
      );
      const config = latestCreateSessionConfig as {
        runtime?: { capabilityRuntime?: { promptFragments?: Array<{ content: string }> } };
      };
      expect(config.runtime?.capabilityRuntime?.promptFragments?.[0]?.content).not.toContain(
        'Flux.1 (flux)',
      );
    });

    it('应该为多个已选择媒体目标注入独立 ProviderCard fragments', async () => {
      capabilityRuntimeMock.providerCardRegistry = {
        list: vi.fn(() => [
          {
            providerId: 'flux',
            modelId: 'flux-pro-1.1',
            displayName: 'Flux Pro 1.1',
            version: '1.1.0',
            capabilities: ['image.generate'],
            sourceLayer: 'builtin',
            syntaxProfile: { supportsNegativePrompt: false, notes: [] },
            conceptCoverage: { entries: [] },
            trainingProfile: { styleAffinities: { photorealistic: 3 }, antiBiasStrategies: [] },
          },
          {
            providerId: 'runway',
            modelId: 'gen-4',
            displayName: 'Runway Gen-4',
            version: '4.0.0',
            capabilities: ['video.generate'],
            sourceLayer: 'builtin',
            syntaxProfile: { supportsNegativePrompt: true, notes: [] },
            conceptCoverage: { entries: [] },
            trainingProfile: { styleAffinities: { cinematic: 3 }, antiBiasStrategies: [] },
          },
        ]),
      };

      await runner.configure({
        platform: mockPlatform,
        systemPrompt: 'Test prompt',
        providerExpressionTargets: [
          { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro-1.1' },
          { capability: 'video.generate', providerId: 'runway', modelId: 'gen-4' },
        ],
      });

      const config = latestCreateSessionConfig as {
        runtime?: {
          capabilityRuntime?: { promptFragments?: Array<{ id: string; content: string }> };
        };
      };
      const fragments = config.runtime?.capabilityRuntime?.promptFragments ?? [];

      expect(fragments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'provider:expression-context:image.generate',
            content: expect.stringContaining('Flux Pro 1.1 (flux/flux-pro-1.1)'),
          }),
          expect.objectContaining({
            id: 'provider:expression-context:video.generate',
            content: expect.stringContaining('Runway Gen-4 (runway/gen-4)'),
          }),
        ]),
      );
      expect(
        fragments.filter((fragment) => fragment.id.startsWith('provider:expression-context:')),
      ).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Execution state
  // ---------------------------------------------------------------------------

  describe('多模态上下文', () => {
    it('应该把 multimodal context packet 透传到 session metadata', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      await collectEvents(
        runner.execute('inspect selection', {
          multimodalContextPacket: {
            id: 'ctx-canvas-test',
            selection: [],
            artifactRefs: [],
            projectRefs: [],
            perceptionInputs: [],
            uiContext: { activePanel: 'canvas', selectionIds: [] },
            createdAt: 1_771_718_405_000,
          },
        }),
      );

      expect(latestMockSession.execute).toHaveBeenCalledWith(
        'inspect selection',
        expect.objectContaining({
          metadata: expect.objectContaining({
            multimodalContextPacket: expect.objectContaining({ id: 'ctx-canvas-test' }),
          }),
        }),
      );
    });
  });

  describe('执行状态', () => {
    it('应该能够检查是否正在运行', () => {
      expect(runner.isRunning()).toBe(false);
    });

    it('应该在执行时触发 onDidStart 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const listener = vi.fn();
      runner.onDidStart(listener);

      const iterable = runner.execute('test', {});
      await toIterator(iterable).next();

      expect(listener).toHaveBeenCalled();
    });

    it('应该在完成后触发 onDidStop 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const listener = vi.fn();
      runner.onDidStop(listener);

      await collectEvents(runner.execute('test', {}));

      expect(listener).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('错误处理', () => {
    it('未配置时执行应该返回错误', async () => {
      const events = await collectEvents(runner.execute('test', {}));

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('error');
      expect(events[0]!.error?.message).toBe('Agent not configured');
    });

    it('重复执行应该将消息加入队列', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      // Start first execution
      const iterable1 = runner.execute('test1', {});
      await toIterator(iterable1).next(); // start

      // Attempt second execution while first is running
      const events = await collectEvents(runner.execute('test2', {}));

      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('messageQueued');
      expect(events[0]!.content).toContain('1 pending');

      // Cleanup first execution
      for await (const _ of iterable1) {
        /* consume */
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Conversation history (requires session via configure)
  // ---------------------------------------------------------------------------

  describe('对话历史', () => {
    it('未配置时 getHistory 返回空数组', () => {
      expect(runner.getHistory()).toEqual([]);
    });

    it('配置后应该能够添加和获取消息', async () => {
      await runner.configure({ platform: mockPlatform });

      runner.addMessage({ role: 'user', content: 'msg1' });
      runner.addMessage({ role: 'assistant', content: 'msg2' });

      const history = runner.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.content).toBe('msg1');
      expect(history[1]!.content).toBe('msg2');
    });

    it('配置后应该能够清除历史', async () => {
      await runner.configure({ platform: mockPlatform });

      runner.addMessage({ role: 'user', content: 'test' });
      expect(runner.getHistory()).toHaveLength(1);

      runner.clearHistory();
      expect(runner.getHistory()).toHaveLength(0);
    });

    it('getHistory 应该返回副本', async () => {
      await runner.configure({ platform: mockPlatform });

      runner.addMessage({ role: 'user', content: 'test' });

      const history1 = runner.getHistory();
      const history2 = runner.getHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  describe('流式响应', () => {
    it('应该产生 session 事件并附加 done 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const events = await collectEvents(runner.execute('hello', {}));

      // Session yields 'text', then AgentRunner appends 'done'
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      expect(textEvents.some((e) => e.content === 'Mock response')).toBe(true);
    });

    it('应该在结束时产生 done 事件', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 1 });

      const events = await collectEvents(runner.execute('test', {}));

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Tool calls (via mock session events)
  // ---------------------------------------------------------------------------

  describe('工具调用', () => {
    it('应该透传 session 的工具调用事件', async () => {
      const { createAgentSessionWithRuntime } = await import('@neko/agent/runtime');
      vi.mocked(createAgentSessionWithRuntime).mockReturnValueOnce(
        createMockSession({
          events: [
            {
              type: 'tool_call',
              toolCall: { id: 'call-1', name: 'test_tool', arguments: {} },
            },
            {
              type: 'tool_result',
              toolResult: { toolCallId: 'call-1', success: true, data: { result: 'ok' } },
            },
            { type: 'text', content: 'Done' },
          ],
        }) as any,
      );

      await runner.configure({ platform: mockPlatform, maxIterations: 3 });

      const events = await collectEvents(runner.execute('call tool', {}));

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      const toolResultEvents = events.filter((e) => e.type === 'tool_result');

      expect(toolCallEvents).toHaveLength(1);
      expect(toolCallEvents[0]!.toolCall?.name).toBe('test_tool');
      expect(toolResultEvents).toHaveLength(1);
      expect(toolResultEvents[0]!.toolResult?.success).toBe(true);
    });

    it('应该透传工具执行失败事件', async () => {
      const { createAgentSessionWithRuntime } = await import('@neko/agent/runtime');
      vi.mocked(createAgentSessionWithRuntime).mockReturnValueOnce(
        createMockSession({
          events: [
            {
              type: 'tool_call',
              toolCall: { id: 'call-1', name: 'test_tool', arguments: {} },
            },
            {
              type: 'tool_result',
              toolResult: {
                toolCallId: 'call-1',
                success: false,
                data: null,
                error: 'Tool execution failed',
              },
            },
          ],
        }) as any,
      );

      await runner.configure({ platform: mockPlatform, maxIterations: 3 });

      const events = await collectEvents(runner.execute('call tool', {}));

      const failedResult = events.find((e) => e.type === 'tool_result' && !e.toolResult?.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.toolResult?.error).toContain('Tool execution failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  describe('取消执行', () => {
    it('应该能够取消执行', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('long task', {});
      await toIterator(iterable).next();

      runner.cancel();

      // Consume remaining events
      for await (const _ of iterable) {
        /* drain */
      }

      expect(runner.isRunning()).toBe(false);
      expect(latestMockSession.cancel).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Pending messages
  // ---------------------------------------------------------------------------

  describe('消息队列', () => {
    it('appendMessage 在未运行时返回 false', () => {
      expect(runner.appendMessage('test')).toBe(false);
    });

    it('appendMessage 在运行时返回 true', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('task', {});
      await toIterator(iterable).next(); // start running

      expect(runner.appendMessage('queued')).toBe(true);
      expect(runner.getPendingMessagesCount()).toBe(1);

      runner.cancel();
      for await (const _ of iterable) {
        /* drain */
      }
    });

    it('clearPendingMessages 应该清空队列', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('task', {});
      await toIterator(iterable).next();

      runner.appendMessage('msg1');
      runner.appendMessage('msg2');
      expect(runner.getPendingMessagesCount()).toBe(2);

      runner.clearPendingMessages();
      expect(runner.getPendingMessagesCount()).toBe(0);

      runner.cancel();
      for await (const _ of iterable) {
        /* drain */
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Context management
  // ---------------------------------------------------------------------------

  describe('上下文管理', () => {
    it('未配置时 getContextTokenCount 返回 0', () => {
      expect(runner.getContextTokenCount()).toBe(0);
    });

    it('配置后 getContextTokenCount 委托给 session', async () => {
      await runner.configure({ platform: mockPlatform });
      expect(runner.getContextTokenCount()).toBe(100);
    });

    it('compressContext 委托给 session', async () => {
      await runner.configure({ platform: mockPlatform });
      const result = await runner.compressContext();
      expect(result.originalTokens).toBe(100);
      expect(result.compressedTokens).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('生命周期', () => {
    it('dispose 应该取消执行并释放 session', async () => {
      await runner.configure({ platform: mockPlatform, maxIterations: 10 });

      const iterable = runner.execute('task', {});
      await toIterator(iterable).next();

      runner.dispose();

      expect(runner.isRunning()).toBe(false);
      expect(latestMockSession.dispose).toHaveBeenCalled();
    });
  });
});
