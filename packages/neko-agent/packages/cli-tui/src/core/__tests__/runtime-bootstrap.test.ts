import { describe, expect, it, vi } from 'vitest';

const createNodeArtifactStore = vi.fn((config: unknown) => ({ kind: 'artifact-store', config }));
const createTaskManagerIdcTaskProjection = vi.fn((config: unknown) => ({
  kind: 'idc-projection',
  config,
}));
const registerBuiltinToolGroups = vi.fn();

vi.mock('@neko/agent', () => ({
  ToolGroupRegistry: class ToolGroupRegistry {
    readonly kind = 'tool-group-registry';
  },
  createTaskManagerIdcTaskProjection,
  registerBuiltinToolGroups,
}));

vi.mock('@neko/agent/runtime', () => ({
  createNodeArtifactStore,
}));

describe('createCliAgentRuntime', () => {
  it('builds the shared CLI runtime planes from host-owned services', async () => {
    const { createCliAgentRuntime } = await import('../runtime-bootstrap');
    const taskManager = { id: 'task-manager' };
    const skillService = { registry: { id: 'skill-registry' } };
    const projectMemoryManager = { load: vi.fn() };

    const runtime = createCliAgentRuntime({
      workspaceRoot: '/workspace',
      taskManager: taskManager as never,
      skillService: skillService as never,
      projectMemoryManager: projectMemoryManager as never,
    });

    expect(createTaskManagerIdcTaskProjection).toHaveBeenCalledWith({ store: taskManager });
    expect(createNodeArtifactStore).toHaveBeenCalledWith({ workspaceRoot: '/workspace' });
    expect(registerBuiltinToolGroups).toHaveBeenCalledOnce();
    expect(runtime.workflowRuntime?.stageTracking).toEqual({
      skillService,
      skillRegistry: skillService.registry,
    });
    expect(runtime.workflowRuntime?.idcTaskProjection).toEqual({
      kind: 'idc-projection',
      config: { store: taskManager },
    });
    expect(runtime.capabilityRuntime?.skillService).toBe(skillService);
    expect(runtime.capabilityRuntime?.skillRegistry).toBe(skillService.registry);
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

    expect(runtime.workflowRuntime?.stageTracking).toBeUndefined();
    expect(runtime.capabilityRuntime?.skillService).toBeUndefined();
    expect(runtime.capabilityRuntime?.skillRegistry).toBeUndefined();
    expect(runtime.capabilityRuntime?.toolGroupRegistry).toBeDefined();
    expect(runtime.feedbackLoop).toBeUndefined();
  });
});
