/**
 * Task Types - Async task management (core types)
 *
 * These types define the core task management interfaces used by
 * TaskManager in the agent package.
 */
/**
 * Task type
 */
export type TaskType = 'image_generation' | 'video_generation' | 'audio_generation' | 'embedding' | 'workflow' | 'mcp' | 'custom';
/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
/**
 * Task input
 */
export interface TaskInput {
    /** Task type */
    type: TaskType;
    /** Task-specific payload */
    payload: Record<string, unknown>;
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
/**
 * Task executor function type
 */
export type TaskExecutor = (input: TaskInput, onProgress: (progress: number) => void) => Promise<TaskOutput>;
//# sourceMappingURL=task.d.ts.map