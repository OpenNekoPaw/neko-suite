/**
 * Task Module - Async task management for Agent
 *
 * Provides task scheduling, persistence, recovery, and concurrency control.
 */

export {
  TaskManager,
  type TaskManagerOptions,
  type ConcurrencyConfig,
  type IIdcProjectedTaskStore,
  type IRuntimeTaskManager,
} from './task-manager';
export {
  createTaskManagerIdcTaskProjection,
  type IIdcTaskProjection,
  type IIdcTaskProjectionStore,
  type IdcTaskProjectionConfig,
} from './idc-task-projection';
export {
  getIdcProjectedTaskRunId,
  isIdcProjectedTaskPayload,
  toSerializableIdcProjectedTask,
  toIdcProjectedTaskPayload,
  type IdcProjectedTaskArtifactBinding,
  type IdcProjectedTaskBinding,
  type IdcProjectedTaskPayload,
  type IdcProjectedTaskUpsertInput,
} from './idc-projected-task';
export {
  MemoryTaskStorage,
  FileTaskStorage,
  createFileTaskStorage,
  type FileTaskStorageOptions,
} from './task-storage';
export {
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
  type FileTaskRecoveryStorageOptions,
} from './task-recovery-storage';

// Re-export types from shared for convenience
export type {
  Task,
  TaskType,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskProgressCallback,
  ITaskManager,
  ITaskStorage,
  ITaskRecoveryStorage,
  TaskRecoveryInfo,
  SerializableTask,
  TaskExecutor,
} from '@neko/shared';
