import { describe, expect, it, vi } from 'vitest';
import type { IOperationToolAdapterRegistry, PromptFragment } from '@neko/shared';
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
    const toolGroupRegistry = { kind: 'tool-group-registry' } as never;
    const toolCategoryRegistry = { kind: 'tool-category-registry' } as never;
    const providerCardRegistry = { kind: 'provider-card-registry' } as never;
    const projectMemoryManager = { kind: 'project-memory' } as never;
    const feedbackCoordinator = { kind: 'feedback-coordinator' } as never;
    const controlPlane = { kind: 'control-plane' } as never;
    const operationToolAdapterRegistry = {
      list: vi.fn(() => []),
    } as unknown as IOperationToolAdapterRegistry;
    const idcTaskProjection = { kind: 'idc-task-projection' } as never;

    const runtime: AgentRuntimeConfig = {
      workflowRuntime: {
        stageTracking: {
          initialStage: 'draft',
          guardian: false,
        },
        idcTaskProjection,
        controlPlane,
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
        toolGroupRegistry,
        toolCategoryRegistry,
        providerCardRegistry,
        promptFragments,
        operationToolAdapterRegistry,
      },
      feedbackLoop: {
        projectMemoryManager,
        compactLogging: false,
        autoMemoryExtraction: false,
        memoryRecall: false,
        feedbackCoordinator,
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
      }),
    );
    expect(config.idcTaskProjection).toBe(idcTaskProjection);
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
    expect(config.skillService).toBe(skillService);
    expect(config.projectMemoryManager).toBe(projectMemoryManager);
    expect(config.feedbackCoordinator).toBe(feedbackCoordinator);
    expect(config.controlPlane).toBe(controlPlane);
    expect(config.operationToolAdapterRegistry).toBe(operationToolAdapterRegistry);
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
        workflowRuntime: {
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
        feedbackLoop: {
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
