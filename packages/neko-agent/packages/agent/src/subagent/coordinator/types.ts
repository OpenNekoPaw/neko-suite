/**
 * Coordinator Types — Multi-phase orchestration for SubAgent workflows
 *
 * Coordinator sits above SubAgentManager, providing:
 * - Phase-based workflow (plan → confirm → execute → verify → done)
 * - Shared TaskPool with dependency resolution
 * - Structured task notifications (replacing plain text results)
 * - Permission bridging (SubAgent confirmations route to parent UI)
 */

import type {
  SubAgentResult,
  SpecializedAgentType,
  ModelTier,
  ISubAgentManager,
  IContextBridge,
} from '../types';

// =============================================================================
// Coordinator Phases
// =============================================================================

/** Coordinator workflow phases */
export type CoordinatorPhase = 'plan' | 'confirm' | 'execute' | 'verify' | 'done';

/** Result summary for a completed phase */
export interface PhaseResult {
  phase: CoordinatorPhase;
  summary: string;
  artifacts?: Record<string, unknown>;
}

// =============================================================================
// Task Pool
// =============================================================================

/** Task lifecycle status */
export type TaskStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed';

/** A single task in the coordinator's pool */
export interface TaskItem {
  /** Unique task ID (user-provided, must be unique within coordinator) */
  id: string;
  /** Short description */
  description: string;
  /** Detailed prompt for the SubAgent */
  prompt: string;
  /** Agent type to use for this task */
  agentType: SpecializedAgentType;
  /** Current status */
  status: TaskStatus;
  /** SubAgent ID that claimed this task */
  claimedBy?: string;
  /** Result when completed/failed */
  result?: SubAgentResult;
  /** Task IDs that must complete before this task can start */
  dependencies?: string[];
  /** Arbitrary metadata (creative: style, quality_tier, asset refs) */
  metadata?: Record<string, unknown>;
  /** Priority (higher = dispatched sooner, default: 0) */
  priority?: number;
}

/** Progress snapshot of the task pool */
export interface TaskPoolProgress {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
}

// =============================================================================
// Coordinator Config
// =============================================================================

/** Configuration for creating a Coordinator */
export interface CoordinatorConfig {
  /** Unique coordinator session ID */
  id: string;
  /** Workflow description */
  description: string;
  /** Task items to execute */
  tasks: Omit<TaskItem, 'status'>[];
  /** Max concurrent workers (default: 3) */
  maxConcurrency?: number;
  /** Require user confirmation before execute phase (default: true) */
  requireConfirmation?: boolean;
  /** Auto-verify results after execute phase (default: false) */
  autoVerify?: boolean;
  /** Timeout per task in ms (default: 5 min) */
  taskTimeout?: number;
  /** Model tier for worker SubAgents */
  workerModelTier?: ModelTier;
  /** Parent agent context summary (for SubAgent context injection) */
  parentContext?: string;
}

// =============================================================================
// Task Notification (structured result backflow)
// =============================================================================

/** Structured notification when a task completes or fails */
export interface TaskNotification {
  taskId: string;
  subAgentId: string;
  status: 'completed' | 'failed';
  result?: {
    response: string;
    artifacts?: Array<{
      type: string;
      path: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  error?: string;
  duration: number;
  timestamp: number;
}

// =============================================================================
// Coordinator Events
// =============================================================================

/** Event types emitted by Coordinator */
export type CoordinatorEventType =
  | 'phase_changed'
  | 'task_claimed'
  | 'task_completed'
  | 'task_failed'
  | 'confirmation_required'
  | 'coordinator_done';

/** Event emitted during coordinator execution */
export interface CoordinatorEvent {
  type: CoordinatorEventType;
  coordinatorId: string;
  phase?: CoordinatorPhase;
  task?: TaskItem;
  notification?: TaskNotification;
  summary?: string;
  progress?: TaskPoolProgress;
  timestamp: number;
}

// =============================================================================
// Coordinator Interface
// =============================================================================

/** Coordinator instance — orchestrates multi-phase SubAgent workflow */
export interface ICoordinator {
  /** Coordinator ID */
  readonly id: string;
  /** Current phase */
  readonly phase: CoordinatorPhase;

  /** Start the coordinator — yields events as it progresses */
  start(): AsyncIterable<CoordinatorEvent>;
  /** User confirmation gate (called externally when user approves/denies) */
  confirm(approved: boolean): void;
  /** Cancel the coordinator and all workers */
  cancel(): void;
  /** Get current task pool progress */
  getProgress(): TaskPoolProgress;
  /** Get all completed task notifications */
  getResults(): TaskNotification[];
}

// =============================================================================
// Coordinator Dependencies
// =============================================================================

/** Dependencies injected into Coordinator */
export interface CoordinatorDeps {
  /** SubAgent manager for worker dispatch */
  subAgentManager: ISubAgentManager;
  /** Context bridge for parent-child context passing */
  contextBridge: IContextBridge;
  /** Parent agent ID (for SubAgent spawning) */
  parentAgentId: string;
  /** Conversation ID (for SubAgent spawning) */
  conversationId: string;
  /** Tool confirmation callback (bridges to parent session) */
  onConfirmTool?: (request: unknown) => Promise<boolean>;
}

// =============================================================================
// CoordinateTool Dependencies
// =============================================================================

/** Dependencies for creating the coordinate tool */
export interface CoordinateToolDeps {
  /** SubAgent manager */
  subAgentManager: ISubAgentManager;
  /** Context bridge */
  contextBridge: IContextBridge;
}
