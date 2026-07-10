import type { AgentTaskResultDeliveryPolicy } from './agent-task-result-observation';

/**
 * Task Types - Async task management (core types)
 *
 * These types define the core task management interfaces used by
 * TaskManager in the agent package.
 */

/**
 * Task type
 */
export type TaskType =
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'embedding'
  | 'workflow'
  | 'mcp'
  | 'custom';

export const TASK_TYPES = [
  'image_generation',
  'video_generation',
  'audio_generation',
  'embedding',
  'workflow',
  'mcp',
  'custom',
] as const satisfies readonly TaskType[];

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === 'string' && TASK_TYPES.includes(value as TaskType);
}

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Task run mode.
 *
 * Foreground tasks belong to the active user turn. Background tasks are
 * intentionally detached and must remain visible through task surfaces.
 */
export type TaskRunMode = 'foreground' | 'background';

/**
 * Task cost phase.
 *
 * This describes where cost is currently being incurred. Provider adapters and
 * executors own transitions because they are closest to token/provider cost
 * boundaries.
 */
export type TaskCostPhase = 'idle' | 'token-active' | 'external-wait' | 'local-finalize';

/**
 * Task interruption policy used when the owning Agent conversation is stopped.
 */
export type TaskInterruptPolicy =
  'cancel-with-agent' | 'detach-and-continue' | 'finish-critical-step';

/**
 * Recovery policy used after Extension Host restart or process interruption.
 */
export type TaskRecoverPolicy = 'resume-polling' | 'retry-executor' | 'snapshot-only' | 'none';

/**
 * Serializable ownership lease for long-running task/process work.
 */
export interface TaskRunLease {
  readonly conversationId: string;
  readonly runId: string;
  readonly runStartedAt?: number;
}

export type TaskResultDeliveryGroupPolicy =
  'wait-all' | 'continue-on-each' | 'continue-on-threshold';

export interface TaskResultDeliveryGroupMetadata {
  readonly taskGroupId: string;
  readonly resultDeliveryPolicy: TaskResultDeliveryGroupPolicy;
  readonly expectedTaskIds?: readonly string[];
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly thresholdCount?: number;
}

/**
 * Serializable task lifecycle metadata.
 *
 * This is a Layer 0 DTO. It must not reference VSCode, React, AbortSignal, or
 * other process-local runtime handles.
 */
export interface TaskLifecycleMetadata {
  /** Owning conversation for UI replay, Dashboard grouping, and auditing */
  readonly ownerConversationId?: string;
  /** Owning durable run for terminal/process-backed observers and cancellation */
  readonly ownerRunId?: string;
  /** Optional monotonic creation timestamp for disambiguating restored run ids */
  readonly ownerRunStartedAt?: number;
  /** Whether the task is foreground turn work or detached background work */
  readonly runMode: TaskRunMode;
  /** Current cost phase */
  readonly costPhase: TaskCostPhase;
  /** How this task reacts to Agent conversation interruption */
  readonly interruptPolicy: TaskInterruptPolicy;
  /** How this task recovers after restart */
  readonly recoverPolicy: TaskRecoverPolicy;
  /** How an Agent-owned terminal task result is delivered back to the Agent */
  readonly resultDeliveryPolicy?: AgentTaskResultDeliveryPolicy;
  /** Explicit batch/group result delivery contract declared by the task submitter */
  readonly resultDeliveryGroup?: TaskResultDeliveryGroupMetadata;
}

/**
 * Conservative lifecycle defaults for tasks that predate lifecycle metadata.
 */
export const DEFAULT_TASK_LIFECYCLE_METADATA: TaskLifecycleMetadata = {
  runMode: 'foreground',
  costPhase: 'idle',
  interruptPolicy: 'cancel-with-agent',
  recoverPolicy: 'retry-executor',
};

export function createTaskLifecycleMetadata(
  overrides: Partial<TaskLifecycleMetadata> = {},
): TaskLifecycleMetadata {
  return {
    ...DEFAULT_TASK_LIFECYCLE_METADATA,
    ...overrides,
  };
}

export function extractTaskRunLease(input: {
  readonly lifecycle?: Partial<TaskLifecycleMetadata> | null;
}): TaskRunLease | null {
  const conversationId = input.lifecycle?.ownerConversationId?.trim();
  const runId = input.lifecycle?.ownerRunId?.trim();
  if (!conversationId || !runId) {
    return null;
  }

  const runStartedAt = input.lifecycle?.ownerRunStartedAt;
  return {
    conversationId,
    runId,
    ...(typeof runStartedAt === 'number' ? { runStartedAt } : {}),
  };
}

/**
 * Task input
 */
export interface TaskInput {
  /** Task type */
  type: TaskType;
  /** Task-specific payload */
  payload: Record<string, unknown>;
  /** Optional lifecycle metadata for Agent-owned async tasks */
  lifecycle?: Partial<TaskLifecycleMetadata>;
  /** Task options */
  options?: {
    /** Priority (higher = more urgent) */
    priority?: number;
    /** Timeout in milliseconds */
    timeout?: number;
    /** Retry configuration */
    retry?: {
      maxRetries: number;
      backoffMs: number;
    };
  };
}

/**
 * Task output
 */
export interface TaskOutput {
  /** Result data */
  data?: unknown;
  /** Error if failed */
  error?: string;
  /** Task metrics */
  metrics?: {
    /** Start time */
    startTime: number;
    /** End time */
    endTime: number;
    /** Duration in ms */
    duration: number;
    /** Retry count */
    retries: number;
  };
}

/**
 * Task definition
 */
export interface Task {
  /** Unique task ID */
  id: string;
  /** Task type */
  type: TaskType;
  /** Task status */
  status: TaskStatus;
  /** Input data */
  input: TaskInput;
  /** Output data (when completed) */
  output?: TaskOutput;
  /** Progress 0-100 */
  progress: number;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
  /** Error message if failed */
  error?: string;
  /** Retry count for recovery */
  retryCount?: number;
  /** Optional lifecycle metadata for Agent-owned async tasks */
  lifecycle?: TaskLifecycleMetadata;
}

/**
 * Task progress callback
 */
export type TaskProgressCallback = (task: Task) => void;

/**
 * Task manager interface
 */
export interface ITaskManager {
  /** Submit a new task */
  submit(input: TaskInput): Promise<string>;

  /** Get task by ID */
  get(id: string): Promise<Task | undefined>;

  /** Cancel a task */
  cancel(id: string): Promise<boolean>;

  /** Delete a task */
  delete(id: string): Promise<boolean>;

  /** Wait for task completion */
  waitForCompletion(id: string, timeoutMs?: number): Promise<Task>;

  /** List tasks by status */
  list(status?: TaskStatus): Promise<Task[]>;

  /** Subscribe to task progress */
  onProgress(id: string, callback: TaskProgressCallback): () => void;
}

/**
 * Serializable task data for persistence
 */
export interface SerializableTask {
  /** Unique task ID */
  id: string;
  /** Task type */
  type: TaskType;
  /** Task status */
  status: TaskStatus;
  /** Input data (serializable) */
  input: TaskInput;
  /** Output data (when completed) */
  output?: TaskOutput;
  /** Progress 0-100 */
  progress: number;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
  /** Error message if failed */
  error?: string;
  /** Retry count for recovery */
  retryCount?: number;
  /** Optional lifecycle metadata for Agent-owned async tasks */
  lifecycle?: TaskLifecycleMetadata;
}

/**
 * Task storage interface for persistence
 */
export interface ITaskStorage {
  /** Save a task */
  save(task: SerializableTask): Promise<void>;

  /** Load task by ID */
  load(id: string): Promise<SerializableTask | undefined>;

  /** Load all pending/running tasks for recovery */
  loadPending(): Promise<SerializableTask[]>;

  /** Delete a task */
  delete(id: string): Promise<void>;

  /** Cleanup old completed/failed tasks */
  cleanup(olderThanMs: number): Promise<number>;

  /** Load all tasks (for listing) */
  loadAll(): Promise<SerializableTask[]>;
}

/**
 * Lightweight recovery info for external tasks (e.g., media generation)
 * Only stores essential data needed to resume polling after restart
 */
export interface TaskRecoveryInfo {
  /** Internal task ID */
  taskId: string;
  /** External platform task ID (e.g., Runway task ID) */
  externalTaskId: string;
  /** Provider ID for adapter lookup */
  providerId: string;
  /** Task type for executor lookup */
  taskType: TaskType;
  /** Original input payload for context */
  payload: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Lightweight recovery storage interface
 * Only persists essential info for resuming external tasks
 */
export interface ITaskRecoveryStorage {
  /** Save recovery info */
  save(info: TaskRecoveryInfo): Promise<void>;

  /** Load recovery info by task ID */
  load(taskId: string): Promise<TaskRecoveryInfo | undefined>;

  /** Load all pending recovery infos */
  loadAll(): Promise<TaskRecoveryInfo[]>;

  /** Delete recovery info */
  delete(taskId: string): Promise<void>;

  /** Clear all recovery infos */
  clear(): Promise<void>;
}

export interface TaskLifecycleReport {
  readonly lifecycle?: Partial<TaskLifecycleMetadata>;
}

export interface TaskExecutionContext {
  /** Internal task id for runtime-only coordination */
  readonly taskId: string;
  /** Runtime-only cancellation signal. Never persist this object. */
  readonly signal: AbortSignal;
  /** Report lifecycle changes from executor/provider boundaries */
  reportLifecycle(update: TaskLifecycleReport): void;
}

/**
 * Task executor function type
 */
export type TaskExecutor = (
  input: TaskInput,
  onProgress: (progress: number) => void,
  context?: TaskExecutionContext,
) => Promise<TaskOutput>;
