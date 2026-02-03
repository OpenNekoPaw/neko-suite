/**
 * VSCode Task Storage
 * Persists tasks using VSCode's globalState
 */

import * as vscode from 'vscode';
import type { ITaskStorage, SerializableTask } from '@uniedit/platform';

const STORAGE_KEY = 'uniedit.tasks';

/**
 * VSCode GlobalState based task storage
 */
export class VSCodeTaskStorage implements ITaskStorage {
  constructor(private globalState: vscode.Memento) {}

  async save(task: SerializableTask): Promise<void> {
    const tasks = this.getTasks();
    tasks[task.id] = task;
    await this.globalState.update(STORAGE_KEY, tasks);
  }

  async load(id: string): Promise<SerializableTask | undefined> {
    const tasks = this.getTasks();
    return tasks[id];
  }

  async loadPending(): Promise<SerializableTask[]> {
    const tasks = this.getTasks();
    return Object.values(tasks).filter(
      (t) => t.status === 'pending' || t.status === 'running'
    );
  }

  async loadAll(): Promise<SerializableTask[]> {
    const tasks = this.getTasks();
    return Object.values(tasks);
  }

  async delete(id: string): Promise<void> {
    const tasks = this.getTasks();
    delete tasks[id];
    await this.globalState.update(STORAGE_KEY, tasks);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const tasks = this.getTasks();
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [id, task] of Object.entries(tasks)) {
      // Only cleanup completed, failed, or cancelled tasks
      if (
        (task.status === 'completed' ||
          task.status === 'failed' ||
          task.status === 'cancelled') &&
        task.updatedAt < cutoff
      ) {
        delete tasks[id];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.globalState.update(STORAGE_KEY, tasks);
    }

    return cleaned;
  }

  private getTasks(): Record<string, SerializableTask> {
    return this.globalState.get<Record<string, SerializableTask>>(STORAGE_KEY, {});
  }
}
