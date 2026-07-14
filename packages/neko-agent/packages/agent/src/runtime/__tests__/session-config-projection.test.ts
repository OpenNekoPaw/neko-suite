import { describe, expect, it, vi } from 'vitest';
import type {
  AgentAutohealChainFactory,
  AutohealOutcome,
  IOperationToolAdapterRegistry,
  PromptFragment,
} from '@neko/shared';
import { buildAgentSessionConfigWithRuntime, type AgentRuntimeConfig } from '../index';

describe('buildAgentSessionConfigWithRuntime', () => {
  it('projects unified runtime contracts into AgentSessionConfig defaults', () => {
    const journalWriter = {
      appendEvent: vi.fn(),
      appendSnapshot: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    };
    const artifactService = { kind: 'artifact-service' } as never;
    const artifactWatcherFactory = vi.fn(() => ({ start: vi.fn(), dispose: vi.fn() }));
    const createJournalWriter = vi.fn(() => journalWriter);
    const promptFragments: readonly PromptFragment[] = [
      { id: 'canvas:guide', content: 'Canvas guidance' },
    ];
    const skillRegistry = { kind: 'skill-registry' } as never;
    const skillService = { kind: 'skill-service' } as never;
    const skillLifecycleRuntime = { kind: 'skill-lifecycle-runtime' } as never;
    const toolGroupRegistry = { kind: 'tool-group-registry' } as never;
    const toolCategoryRegistry = { kind: 'tool-category-registry' } as never;
    const providerCardRegistry = { kind: 'provider-card-registry' } as never;
    const projectMemoryManager = { kind: 'project-memory' } as never;
    const validationCoordinator = { kind: 'validation-coordinator' } as never;
    const validationCoordinatorFactory = vi.fn(() => validationCoordinator);
    const creativeProcessRecoveryPolicy = { kind: 'creative-process-recovery-policy' } as never;
    const autohealChainFactory: AgentAutohealChainFactory = vi.fn(() => ({
      run: vi.fn(async (): Promise<AutohealOutcome> => ({ resolution: 'pass', level: 1 })),
    }));
    const operationToolAdapterRegistry = {
      list: vi.fn(() => []),
    } as unknown as IOperationToolAdapterRegistry;
    const contentAccessRuntime = { resolve: vi.fn() } as never;
    const creationTaskProjection = { kind: 'creation-task-projection' } as never;

    const runtime: AgentRuntimeConfig = {
      creationGuidance: {
        stageTracking: {
          initialStage: 'draft',
          guardian: false,
        },
        creationTaskProjection,
        creativeProcessRecoveryPolicy,
        autohealChainFactory,
      },
      artifactStore: {
        workspace: {
          root: '/workspace/demo',
          fsOps: {
            appendFile: vi.fn(),
            mkdir: vi.fn(),
            readFile: vi.fn(),
          },
          globalPreferencesPath: '/home/demo/.neko/preferences.md',
        },
        artifactService,
        createArtifactWatcher: artifactWatcherFactory,
        createJournalWriter,
      },
      capabilityRuntime: {
        skillRegistry,
        skillService,
        skillLifecycleRuntime,
        toolGroupRegistry,
        toolCategoryRegistry,
        providerCardRegistry,
        promptFragments,
        operationToolAdapterRegistry,
        contentAccessRuntime,
      },
      validationLoop: {
        projectMemoryManager,
        compactLogging: false,
        autoMemoryExtraction: false,
        memoryRecall: false,
        validationCoordinator,
        validationCoordinatorFactory,
      },
    };

    const config = buildAgentSessionConfigWithRuntime({
      service: {} as never,
      toolRegistry: {} as never,
      systemPrompt: 'system',
      conversationId: 'conv-1',
      runtime,
    });

    expect(config.stageTracking).toEqual(
      expect.objectContaining({
        initialStage: 'draft',
        guardian: false,
        skillRegistry,
        skillService,
        skillLifecycleRuntime,
      }),
    );
    expect(config.creationTaskProjection).toBe(creationTaskProjection);
    expect(config.workspace).toEqual(
      expect.objectContaining({
        root: '/workspace/demo',
        globalPreferencesPath: '/home/demo/.neko/preferences.md',
      }),
    );
    expect(config.artifactService).toBe(artifactService);
    expect(config.artifactWatcherFactory).toBe(artifactWatcherFactory);
    expect(config.promptFragments).toBe(promptFragments);
    expect(config.toolGroupRegistry).toBe(toolGroupRegistry);
    expect(config.toolCategoryRegistry).toBe(toolCategoryRegistry);
    expect(config.providerCardRegistry).toBe(providerCardRegistry);
    expect(config.stageTracking?.skillService).toBe(skillService);
    expect(config.stageTracking?.skillLifecycleRuntime).toBe(skillLifecycleRuntime);
    expect(config.projectMemoryManager).toBe(projectMemoryManager);
    expect(config.validationCoordinator).toBe(validationCoordinator);
    expect(config.validationCoordinatorFactory).toBe(validationCoordinatorFactory);
    expect(config.creativeProcessRecoveryPolicy).toBe(creativeProcessRecoveryPolicy);
    expect(config.autohealChainFactory).toBe(autohealChainFactory);
    expect(config.operationToolAdapterRegistry).toBe(operationToolAdapterRegistry);
    expect(config.contentAccessRuntime).toBe(contentAccessRuntime);
    expect(config.compactLogging).toBe(false);
    expect(config.autoMemoryExtraction).toBe(false);
    expect(config.memoryRecall).toBe(false);
    expect(config.journalWriter).toBe(journalWriter);
    expect(createJournalWriter).toHaveBeenCalledWith('conv-1');
  });

  it('keeps explicit session config values over runtime defaults', () => {
    const explicitJournalWriter = {
      appendEvent: vi.fn(),
      appendSnapshot: vi.fn(),
      flush: vi.fn(),
      dispose: vi.fn(),
    };
    const explicitArtifactService = { kind: 'explicit-artifact-service' } as never;
    const runtimeArtifactService = { kind: 'runtime-artifact-service' } as never;
    const explicitArtifactWatcherFactory = vi.fn();
    const runtimeArtifactWatcherFactory = vi.fn();
    const createJournalWriter = vi.fn();

    const config = buildAgentSessionConfigWithRuntime({
      service: {} as never,
      toolRegistry: {} as never,
      systemPrompt: 'system',
      conversationId: 'conv-2',
      journalWriter: explicitJournalWriter as never,
      artifactService: explicitArtifactService,
      artifactWatcherFactory: explicitArtifactWatcherFactory,
      stageTracking: {
        initialStage: 'apply',
      },
      workspace: {
        root: '/explicit/workspace',
        fsOps: {
          appendFile: vi.fn(),
          mkdir: vi.fn(),
        } as never,
      },
      promptFragments: [{ id: 'explicit:fragment', content: 'Explicit fragment' }],
      runtime: {
        creationGuidance: {
          stageTracking: {
            initialStage: 'draft',
            guardian: false,
          },
        },
        artifactStore: {
          workspace: {
            root: '/runtime/workspace',
            fsOps: {
              appendFile: vi.fn(),
              mkdir: vi.fn(),
            },
          },
          artifactService: runtimeArtifactService,
          createArtifactWatcher: runtimeArtifactWatcherFactory,
          createJournalWriter,
        },
        validationLoop: {
          compactLogging: false,
        },
      },
      compactLogging: true,
    });

    expect(config.stageTracking).toEqual(
      expect.objectContaining({
        initialStage: 'apply',
        guardian: false,
      }),
    );
    expect(config.workspace?.root).toBe('/explicit/workspace');
    expect(config.artifactService).toBe(explicitArtifactService);
    expect(config.artifactWatcherFactory).toBe(explicitArtifactWatcherFactory);
    expect(config.promptFragments).toEqual([
      { id: 'explicit:fragment', content: 'Explicit fragment' },
    ]);
    expect(config.journalWriter).toBe(explicitJournalWriter);
    expect(config.compactLogging).toBe(true);
    expect(createJournalWriter).not.toHaveBeenCalled();
  });

  it('keeps provider-owned capability category registry over stale explicit session registry', () => {
    const staleToolCategoryRegistry = { kind: 'stale-tool-category-registry' } as never;
    const capabilityToolCategoryRegistry = { kind: 'capability-tool-category-registry' } as never;

    const config = buildAgentSessionConfigWithRuntime({
      service: {} as never,
      toolRegistry: {} as never,
      systemPrompt: 'system',
      toolCategoryRegistry: staleToolCategoryRegistry,
      runtime: {
        capabilityRuntime: {
          toolCategoryRegistry: capabilityToolCategoryRegistry,
        },
      },
    });

    expect(config.toolCategoryRegistry).toBe(capabilityToolCategoryRegistry);
  });

  it('does not create a journal writer when conversationId is absent', () => {
    const createJournalWriter = vi.fn();

    const config = buildAgentSessionConfigWithRuntime({
      service: {} as never,
      toolRegistry: {} as never,
      systemPrompt: 'system',
      runtime: {
        artifactStore: {
          createJournalWriter,
        },
      },
    });

    expect(config.journalWriter).toBeUndefined();
    expect(createJournalWriter).not.toHaveBeenCalled();
  });
});
