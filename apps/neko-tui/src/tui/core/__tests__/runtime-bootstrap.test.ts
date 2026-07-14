import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNodeArtifactStore = vi.fn((config: unknown) => ({ kind: 'artifact-store', config }));
const createTaskManagerCreationTaskProjection = vi.fn((config: unknown) => ({
  kind: 'idc-projection',
  config,
}));
const createAgentCapabilityRuntimeRegistries = vi.fn(() => ({
  artifactProfileRegistry: { id: 'default-artifact-profiles' },
  creationProfileRegistry: { id: 'default-creation-profiles' },
  providerExpressionProfileRegistry: { id: 'default-provider-expression-profiles' },
}));
const registerBuiltinToolGroups = vi.fn();
const createQualityReviewValidationAdapter = vi.fn(() => ({ id: 'quality-review-validation' }));
const createValidationCoordinatorFactory = vi.fn(() => ({ id: 'validation-coordinator-factory' }));
const createDefaultCreativeProcessRecoveryPolicy = vi.fn(() => ({
  id: 'creative-process-recovery-policy',
}));
const createAutohealChain = vi.fn(() => ({ id: 'autoheal-chain' }));

vi.mock('@neko/agent', () => ({
  ToolGroupRegistry: class ToolGroupRegistry {
    readonly kind = 'tool-group-registry';
  },
  createTaskManagerCreationTaskProjection,
}));

vi.mock('@neko/agent/runtime', () => ({
  createAgentCapabilityRuntimeRegistries,
  createNodeArtifactStore,
}));

vi.mock('@neko/skills', () => ({
  createAutohealChain,
  createDefaultCreativeProcessRecoveryPolicy,
  createValidationCoordinatorFactory,
  createQualityReviewValidationAdapter,
  registerBuiltinToolGroups,
}));

describe('createCliAgentRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the shared CLI runtime planes from host-owned services', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');
    const taskManager = { id: 'task-manager' };
    const skillService = { registry: { id: 'skill-registry' } };
    const skillLifecycleRuntime = { id: 'skill-lifecycle-runtime' };
    const projectMemoryManager = { load: vi.fn() };

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: taskManager as never,
      skillService: skillService as never,
      skillLifecycleRuntime: skillLifecycleRuntime as never,
      projectMemoryManager: projectMemoryManager as never,
    });

    expect(createTaskManagerCreationTaskProjection).toHaveBeenCalledWith({ store: taskManager });
    expect(createNodeArtifactStore).toHaveBeenCalledWith({ workspaceRoot: '/workspace' });
    expect(registerBuiltinToolGroups).toHaveBeenCalledOnce();
    expect(runtime.creationGuidance?.stageTracking).toEqual({
      skillService,
      skillRegistry: skillService.registry,
      skillLifecycleRuntime,
    });
    expect(runtime.creationGuidance?.creativeProcessRecoveryPolicy).toEqual({
      id: 'creative-process-recovery-policy',
    });
    expect(runtime.creationGuidance?.autohealChainFactory).toBe(createAutohealChain);
    expect(runtime.creationGuidance?.creationTaskProjection).toEqual({
      kind: 'idc-projection',
      config: { store: taskManager },
    });
    expect(runtime.capabilityRuntime?.skillService).toBe(skillService);
    expect(runtime.capabilityRuntime?.skillRegistry).toBe(skillService.registry);
    expect(runtime.capabilityRuntime?.skillLifecycleRuntime).toBe(skillLifecycleRuntime);
    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBeDefined();
    expect(runtime.artifactStore).toEqual({
      kind: 'artifact-store',
      config: { workspaceRoot: '/workspace' },
    });
    expect(runtime.validationLoop?.projectMemoryManager).toBe(projectMemoryManager);
    expect(runtime.validationLoop?.validationCoordinatorFactory).toEqual({
      id: 'validation-coordinator-factory',
    });
    expect(runtime.validationLoop?.toolResultValidationAdapters).toEqual([
      { id: 'quality-review-validation' },
    ]);
  });

  it('keeps optional skill planes minimal when absent', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: { id: 'task-manager' } as never,
    });

    expect(runtime.creationGuidance?.stageTracking).toBeUndefined();
    expect(runtime.creationGuidance?.autohealChainFactory).toBe(createAutohealChain);
    expect(runtime.capabilityRuntime?.skillService).toBeUndefined();
    expect(runtime.capabilityRuntime?.skillRegistry).toBeUndefined();
    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBeDefined();
    expect(runtime.validationLoop).toEqual({
      validationCoordinatorFactory: { id: 'validation-coordinator-factory' },
      toolResultValidationAdapters: [{ id: 'quality-review-validation' }],
    });
  });

  it('uses injected capability registries and prompt fragments', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');
    const toolGroupRegistry = { id: 'injected-tool-groups' };
    const providerCardRegistry = { id: 'provider-cards' };
    const artifactProfileRegistry = { id: 'artifact-profiles' };
    const creationProfileRegistry = { id: 'creation-profiles' };
    const providerExpressionProfileRegistry = { id: 'provider-expression-profiles' };
    const promptFragments = [{ id: 'neko-assets:references', content: 'Use asset IDs.' }];

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: { id: 'task-manager' } as never,
      toolGroupRegistry: toolGroupRegistry as never,
      providerCardRegistry: providerCardRegistry as never,
      artifactProfileRegistry: artifactProfileRegistry as never,
      creationProfileRegistry: creationProfileRegistry as never,
      providerExpressionProfileRegistry: providerExpressionProfileRegistry as never,
      promptFragments,
    });

    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBe(toolGroupRegistry);
    expect(runtime.capabilityRuntime?.providerCardRegistry).toBe(providerCardRegistry);
    expect(runtime.capabilityRuntime?.artifactProfileRegistry).toBe(artifactProfileRegistry);
    expect(runtime.capabilityRuntime?.creationProfileRegistry).toBe(creationProfileRegistry);
    expect(runtime.capabilityRuntime?.providerExpressionProfileRegistry).toBe(
      providerExpressionProfileRegistry,
    );
    expect(runtime.capabilityRuntime?.promptFragments).toBe(promptFragments);
    expect(registerBuiltinToolGroups).not.toHaveBeenCalled();
  });
});
