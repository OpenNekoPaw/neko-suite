import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNodeArtifactStore = vi.fn((config: unknown) => ({ kind: 'artifact-store', config }));
const createTaskManagerCreationTaskProjection = vi.fn((config: unknown) => ({
  kind: 'idc-projection',
  config,
}));
const registerBuiltinToolGroups = vi.fn();

vi.mock('@neko/agent', () => ({
  ToolGroupRegistry: class ToolGroupRegistry {
    readonly kind = 'tool-group-registry';
  },
  createTaskManagerCreationTaskProjection,
}));

vi.mock('@neko/agent/runtime', () => ({
  createNodeArtifactStore,
}));

vi.mock('@neko/skills', () => ({
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
    expect(runtime.feedbackLoop?.projectMemoryManager).toBe(projectMemoryManager);
  });

  it('keeps optional skill and feedback planes minimal when absent', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: { id: 'task-manager' } as never,
    });

    expect(runtime.creationGuidance?.stageTracking).toBeUndefined();
    expect(runtime.capabilityRuntime?.skillService).toBeUndefined();
    expect(runtime.capabilityRuntime?.skillRegistry).toBeUndefined();
    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBeDefined();
    expect(runtime.feedbackLoop).toBeUndefined();
  });

  it('uses injected capability registries and prompt fragments', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');
    const toolGroupRegistry = { id: 'injected-tool-groups' };
    const providerCardRegistry = { id: 'provider-cards' };
    const promptFragments = [{ id: 'neko-assets:references', content: 'Use asset IDs.' }];

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: { id: 'task-manager' } as never,
      toolGroupRegistry: toolGroupRegistry as never,
      providerCardRegistry: providerCardRegistry as never,
      promptFragments,
    });

    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBe(toolGroupRegistry);
    expect(runtime.capabilityRuntime?.providerCardRegistry).toBe(providerCardRegistry);
    expect(runtime.capabilityRuntime?.promptFragments).toBe(promptFragments);
    expect(registerBuiltinToolGroups).not.toHaveBeenCalled();
  });
});
