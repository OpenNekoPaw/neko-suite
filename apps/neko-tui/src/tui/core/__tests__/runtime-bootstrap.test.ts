import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNodeWorkspaceRuntimeStore = vi.fn((config: unknown) => ({
  kind: 'workspace-store',
  config,
}));
const createAgentCapabilityRuntimeRegistries = vi.fn(() => ({
  artifactProfileRegistry: { id: 'default-artifact-profiles' },
  providerExpressionProfileRegistry: { id: 'default-provider-expression-profiles' },
}));
const registerBuiltinToolGroups = vi.fn();
const createQualityReviewValidationAdapter = vi.fn(() => ({ id: 'quality-review-validation' }));
const createValidationCoordinatorFactory = vi.fn(() => ({ id: 'validation-coordinator-factory' }));
const createAutohealChain = vi.fn(() => ({ id: 'autoheal-chain' }));

vi.mock('@neko/agent', () => ({
  ToolGroupRegistry: class ToolGroupRegistry {
    readonly kind = 'tool-group-registry';
  },
}));

vi.mock('@neko/agent/runtime', () => ({
  createAgentCapabilityRuntimeRegistries,
  createNodeWorkspaceRuntimeStore,
}));

vi.mock('@neko/skills', () => ({
  createAutohealChain,
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

    expect(createNodeWorkspaceRuntimeStore).toHaveBeenCalledWith({ workspaceRoot: '/workspace' });
    expect(registerBuiltinToolGroups).toHaveBeenCalledOnce();
    expect(runtime.validationLoop?.autohealChainFactory).toBe(createAutohealChain);
    expect(runtime.capabilityRuntime?.skillService).toBe(skillService);
    expect(runtime.capabilityRuntime?.skillRegistry).toBe(skillService.registry);
    expect(runtime.capabilityRuntime?.skillLifecycleRuntime).toBe(skillLifecycleRuntime);
    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBeDefined();
    expect(runtime.workspaceStore).toEqual({
      kind: 'workspace-store',
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

    expect(runtime.validationLoop?.autohealChainFactory).toBe(createAutohealChain);
    expect(runtime.capabilityRuntime?.skillService).toBeUndefined();
    expect(runtime.capabilityRuntime?.skillRegistry).toBeUndefined();
    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBeDefined();
    expect(runtime.validationLoop).toEqual({
      autohealChainFactory: createAutohealChain,
      validationCoordinatorFactory: { id: 'validation-coordinator-factory' },
      toolResultValidationAdapters: [{ id: 'quality-review-validation' }],
    });
  });

  it('uses injected capability registries and prompt fragments', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');
    const toolGroupRegistry = { id: 'injected-tool-groups' };
    const providerCardRegistry = { id: 'provider-cards' };
    const artifactProfileRegistry = { id: 'artifact-profiles' };
    const providerExpressionProfileRegistry = { id: 'provider-expression-profiles' };
    const promptFragments = [{ id: 'neko-assets:references', content: 'Use asset IDs.' }];

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: { id: 'task-manager' } as never,
      toolGroupRegistry: toolGroupRegistry as never,
      providerCardRegistry: providerCardRegistry as never,
      artifactProfileRegistry: artifactProfileRegistry as never,
      providerExpressionProfileRegistry: providerExpressionProfileRegistry as never,
      promptFragments,
    });

    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBe(toolGroupRegistry);
    expect(runtime.capabilityRuntime?.providerCardRegistry).toBe(providerCardRegistry);
    expect(runtime.capabilityRuntime?.artifactProfileRegistry).toBe(artifactProfileRegistry);
    expect(runtime.capabilityRuntime?.providerExpressionProfileRegistry).toBe(
      providerExpressionProfileRegistry,
    );
    expect(runtime.capabilityRuntime?.promptFragments).toBe(promptFragments);
    expect(registerBuiltinToolGroups).not.toHaveBeenCalled();
  });
});
