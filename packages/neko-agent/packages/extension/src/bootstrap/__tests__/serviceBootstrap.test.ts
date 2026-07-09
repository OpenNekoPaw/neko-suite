import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SerializableTask, TaskRecoveryInfo } from '@neko/shared';
import {
  createExtensionAgentTaskRecoveryStorage,
  createExtensionAgentTaskStorage,
} from '../serviceBootstrap';

vi.mock('vscode', () => ({
  ExtensionMode: {
    Production: 1,
    Development: 2,
    Test: 3,
  },
}));

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('serviceBootstrap task storage scope', () => {
  it('stores workspace task facts in the workspace-visible task plane', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'neko-agent-extension-task-workspace-'));
    tempRoots.push(workspaceRoot);
    const context = createMockExtensionContext();
    const storage = createExtensionAgentTaskStorage({
      context: context as never,
      workspacePath: workspaceRoot,
    });

    await storage.save(createSerializableTask('workspace-task'));
    if ('flush' in storage) {
      await storage.flush();
    }

    const workspaceTaskPath = join(workspaceRoot, '.neko', 'tasks.json');
    expect(existsSync(workspaceTaskPath)).toBe(true);
    expect(readFileSync(workspaceTaskPath, 'utf-8')).toContain('workspace-task');
    expect(context.values.has('neko.agent.tasks')).toBe(false);
  });

  it('keeps recovery handles in VS Code state instead of the workspace task file', async () => {
    const context = createMockExtensionContext();
    const recoveryStorage = createExtensionAgentTaskRecoveryStorage(context as never);
    const recovery: TaskRecoveryInfo = {
      taskId: 'workspace-task',
      externalTaskId: 'provider-task',
      providerId: 'provider',
      taskType: 'workflow',
      payload: {},
      createdAt: 1,
      updatedAt: 2,
    };

    await recoveryStorage.save(recovery);

    expect(context.values.get('neko.agent.taskRecovery')).toEqual([recovery]);
  });
});

function createSerializableTask(id: string): SerializableTask {
  return {
    id,
    type: 'workflow',
    status: 'running',
    input: { type: 'workflow', payload: {} },
    progress: 50,
    createdAt: 1,
    updatedAt: 2,
  };
}

function createMockExtensionContext(): {
  readonly values: Map<string, unknown>;
  readonly globalState: {
    get<T>(key: string, defaultValue?: T): T | undefined;
    update(key: string, value: unknown): Promise<void>;
  };
} {
  const values = new Map<string, unknown>();
  return {
    values,
    globalState: {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return values.has(key) ? (values.get(key) as T) : defaultValue;
      },
      async update(key: string, value: unknown): Promise<void> {
        values.set(key, value);
      },
    },
  };
}
