/**
 * Task Storage - Persistence layer for tasks
 */

import type { ITaskStorage, SerializableTask } from '@neko/shared';

/**
 * In-memory task storage (default implementation)
 * Used when no persistent storage is available
 */
export class MemoryTaskStorage implements ITaskStorage {
  private tasks: Map<string, SerializableTask> = new Map();

  async save(task: SerializableTask): Promise<void> {
    this.tasks.set(task.id, { ...task });
  }

  async load(id: string): Promise<SerializableTask | undefined> {
    const task = this.tasks.get(id);
    return task ? { ...task } : undefined;
  }

  async loadPending(): Promise<SerializableTask[]> {
    return Array.from(this.tasks.values())
      .filter((t) => t.status === 'pending' || t.status === 'running')
      .map((t) => ({ ...t }));
  }

  async loadAll(): Promise<SerializableTask[]> {
    return Array.from(this.tasks.values()).map((t) => ({ ...t }));
  }

  async delete(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [id, task] of this.tasks.entries()) {
      // Only cleanup completed, failed, or cancelled tasks
      if (
        (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
        task.updatedAt < cutoff
      ) {
        this.tasks.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}
