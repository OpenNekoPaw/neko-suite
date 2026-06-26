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
  buildCancelTaskActionPlan,
  buildClearCompletedTaskPlan,
  buildRemoveTaskActionPlan,
  buildRetryTaskActionPlan,
  buildTaskResultOpenPlan,
  buildViewTaskResultActionPlan,
  type CancelTaskActionPlan,
  type ClearCompletedTaskPlan,
  type RemoveTaskPlan,
  type RetryTaskPlan,
  type TaskActionRejectPlan,
  type TaskActionNoopPlan,
  type TaskActionRejectReason,
  type TaskMediaCandidate,
  type TaskResultOpenPlan,
  type ViewTaskResultPlan,
} from './task-action-plan';
export {
  runCancelTaskRuntime,
  runClearCompletedTasksRuntime,
  runRemoveTaskRuntime,
  runRetryTaskRuntime,
  runSendTasksRuntime,
  runViewTaskResultRuntime,
  type ConversationTasksRuntimeInput,
  type TaskRuntimeAction,
  type TaskRuntimeDeps,
  type TaskRuntimeEffects,
  type TaskRuntimeInput,
  type TaskRuntimeMediaGateway,
  type TaskRuntimeMessage,
  type TaskRuntimeResult,
  type TaskRuntimeTaskManager,
} from './task-runtime';
export {
  buildBackgroundTaskFailureUpdateView,
  createBackgroundTaskViewFromToolResultData,
  filterTasksForConversation,
  getTaskConversationId,
  getTaskResultUrl,
  matchesTaskConversation,
  mergeBackgroundTaskProgressView,
  toBackgroundTaskView,
  toBackgroundTaskViewStatus,
  toBackgroundTaskViewType,
  type BackgroundTaskView,
  type BackgroundTaskProgressPatch,
  type BackgroundTaskFailureUpdateOptions,
  type BackgroundTaskToolResultProjectionOptions,
  type BackgroundTaskViewStatus,
  type BackgroundTaskViewType,
} from './task-view-projector';
export {
  MemoryTaskStorage,
  FileTaskStorage,
  StateTaskStorage,
  createFileTaskStorage,
  createStateTaskStorage,
  type FileTaskStorageOptions,
  type StateTaskStorageAdapter,
  type StateTaskStorageOptions,
} from './task-storage';
export {
  CLEANUP_TASK_STATUSES,
  DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  DEFAULT_TASK_RETENTION_PERIOD_MS,
  DEFAULT_TASK_STORAGE_KEY,
  RECOVERABLE_TASK_STATUSES,
  buildTaskStorageCleanupPlan,
  filterRecoverableTasks,
  isRecoverableTask,
  isRecoverableTaskStatus,
  isTaskCleanupCandidate,
  isTaskCleanupStatus,
  type TaskStorageCleanupPlan,
} from './task-storage-policy';
export {
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  StateTaskRecoveryStorage,
  createFileRecoveryStorage,
  createStateTaskRecoveryStorage,
  type FileTaskRecoveryStorageOptions,
  type StateTaskRecoveryStorageAdapter,
  type StateTaskRecoveryStorageOptions,
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
  TaskExecutionContext,
  TaskLifecycleMetadata,
  TaskCostPhase,
  TaskInterruptPolicy,
  TaskRecoverPolicy,
  TaskRunMode,
} from '@neko/shared';
