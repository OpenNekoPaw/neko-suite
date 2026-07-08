import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFileTaskStorage: vi.fn(() => ({ kind: 'host-private-task-storage' })),
  createFileWorkspaceVisibleAgentTaskStorage: vi.fn(() => ({
    kind: 'workspace-visible-task-storage',
  })),
  taskManagerOptions: [] as unknown[],
}));

vi.mock('@neko/agent', () => ({
  TaskManager: class TaskManager {
    constructor(options: unknown) {
      mocks.taskManagerOptions.push(options);
    }
  },
  createFileTaskStorage: mocks.createFileTaskStorage,
  createFileWorkspaceVisibleAgentTaskStorage: mocks.createFileWorkspaceVisibleAgentTaskStorage,
}));

describe('createCLITaskManager', () => {
  beforeEach(() => {
    mocks.createFileTaskStorage.mockClear();
    mocks.createFileWorkspaceVisibleAgentTaskStorage.mockClear();
    mocks.taskManagerOptions.length = 0;
  });

  it('uses the workspace-visible task plane when a workspace path is available', async () => {
    const { createCLITaskManager } = await import('../platform-bootstrap');

    createCLITaskManager({ workspacePath: '/workspace/project' });

    expect(mocks.createFileWorkspaceVisibleAgentTaskStorage).toHaveBeenCalledWith({
      workspaceRoot: '/workspace/project',
      writerId: 'tui-workspace-task-storage',
    });
    expect(mocks.createFileTaskStorage).not.toHaveBeenCalled();
    expect(mocks.taskManagerOptions[0]).toEqual({
      storage: { kind: 'workspace-visible-task-storage' },
    });
  });

  it('uses a host-private task file only when no workspace path is available', async () => {
    const { createCLITaskManager } = await import('../platform-bootstrap');

    createCLITaskManager();

    expect(mocks.createFileWorkspaceVisibleAgentTaskStorage).not.toHaveBeenCalled();
    expect(mocks.createFileTaskStorage).toHaveBeenCalledWith(
      expect.stringContaining('/.neko/tasks.json'),
    );
    expect(mocks.taskManagerOptions[0]).toEqual({
      storage: { kind: 'host-private-task-storage' },
    });
  });
});
