/**
 * Checkpoint Hooks - Supports execution checkpoint and recovery
 *
 * Provides:
 * - Automatic checkpoint creation
 * - Manual checkpoint management
 * - Execution recovery from checkpoint
 */

import type {
  AgentContext,
  AgentResult,
  AgentStep,
  AgentCheckpoint,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
  ToolResult,
  ChatMessage,
} from '@uniedit/shared';

/**
 * Checkpoint policy configuration
 */
export interface CheckpointPolicy {
  /** Create checkpoint every N iterations */
  iterationInterval?: number;
  /** Create checkpoint every N milliseconds */
  timeInterval?: number;
  /** Create checkpoint after tool calls */
  afterToolCall?: boolean;
  /** Maximum checkpoints to retain */
  maxCheckpoints?: number;
  /** Auto-cleanup old checkpoints */
  autoCleanup?: boolean;
}

/**
 * Checkpoint storage interface
 */
export interface ICheckpointStorage {
  /** Save a checkpoint */
  save(checkpoint: AgentCheckpoint): Promise<void>;
  /** Load a checkpoint by ID */
  load(checkpointId: string): Promise<AgentCheckpoint | undefined>;
  /** List all checkpoints */
  list(agentName?: string): Promise<AgentCheckpoint[]>;
  /** Delete a checkpoint */
  delete(checkpointId: string): Promise<void>;
  /** Clear all checkpoints */
  clear(agentName?: string): Promise<void>;
}

/**
 * Default checkpoint policy
 */
export const DEFAULT_CHECKPOINT_POLICY: CheckpointPolicy = {
  iterationInterval: 5,
  timeInterval: 0,
  afterToolCall: true,
  maxCheckpoints: 10,
  autoCleanup: true,
};

/**
 * In-memory checkpoint storage
 */
export class InMemoryCheckpointStorage implements ICheckpointStorage {
  private checkpoints: Map<string, AgentCheckpoint> = new Map();

  async save(checkpoint: AgentCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  async load(checkpointId: string): Promise<AgentCheckpoint | undefined> {
    return this.checkpoints.get(checkpointId);
  }

  async list(agentName?: string): Promise<AgentCheckpoint[]> {
    const all = Array.from(this.checkpoints.values());
    if (agentName) {
      return all.filter((cp) => cp.agentName === agentName);
    }
    return all;
  }

  async delete(checkpointId: string): Promise<void> {
    this.checkpoints.delete(checkpointId);
  }

  async clear(agentName?: string): Promise<void> {
    if (agentName) {
      for (const [id, cp] of this.checkpoints) {
        if (cp.agentName === agentName) {
          this.checkpoints.delete(id);
        }
      }
    } else {
      this.checkpoints.clear();
    }
  }
}

/**
 * Checkpoint hooks options
 */
export interface CheckpointHooksOptions {
  /** Agent name for checkpoint identification */
  agentName: string;
  /** Checkpoint policy */
  policy?: CheckpointPolicy;
  /** Checkpoint storage */
  storage?: ICheckpointStorage;
  /** Callback when checkpoint is created */
  onCheckpointCreated?: (checkpoint: AgentCheckpoint) => void;
  /** Callback when checkpoint is restored */
  onCheckpointRestored?: (checkpoint: AgentCheckpoint) => void;
}

/**
 * Checkpoint hooks implementation
 */
export class CheckpointHooks implements ExecutorHooks {
  name = 'checkpoint';

  private agentName: string;
  private policy: CheckpointPolicy;
  private storage: ICheckpointStorage;
  private onCheckpointCreated?: (checkpoint: AgentCheckpoint) => void;
  private onCheckpointRestored?: (checkpoint: AgentCheckpoint) => void;

  private lastCheckpointTime: number = 0;
  private lastCheckpointIteration: number = 0;
  private currentContext: AgentContext | null = null;

  constructor(options: CheckpointHooksOptions) {
    this.agentName = options.agentName;
    this.policy = { ...DEFAULT_CHECKPOINT_POLICY, ...options.policy };
    this.storage = options.storage || new InMemoryCheckpointStorage();
    this.onCheckpointCreated = options.onCheckpointCreated;
    this.onCheckpointRestored = options.onCheckpointRestored;
  }

  /**
   * Get checkpoint policy
   */
  getPolicy(): CheckpointPolicy {
    return { ...this.policy };
  }

  /**
   * Get checkpoint storage
   */
  getStorage(): ICheckpointStorage {
    return this.storage;
  }

  /**
   * Manually create a checkpoint
   */
  async createCheckpoint(context?: AgentContext): Promise<AgentCheckpoint> {
    const ctx = context || this.currentContext;
    if (!ctx) {
      throw new Error('No context available for checkpoint');
    }

    const checkpoint: AgentCheckpoint = {
      id: this.generateCheckpointId(),
      agentName: this.agentName,
      context: this.cloneContext(ctx),
      timestamp: Date.now(),
    };

    await this.storage.save(checkpoint);
    this.onCheckpointCreated?.(checkpoint);

    // Auto-cleanup if enabled
    if (this.policy.autoCleanup && this.policy.maxCheckpoints) {
      await this.cleanupOldCheckpoints();
    }

    this.lastCheckpointTime = Date.now();
    this.lastCheckpointIteration = ctx.iteration;

    return checkpoint;
  }

  /**
   * Restore from a checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<AgentContext> {
    const checkpoint = await this.storage.load(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint '${checkpointId}' not found`);
    }

    this.onCheckpointRestored?.(checkpoint);
    return this.cloneContext(checkpoint.context);
  }

  /**
   * Get latest checkpoint for this agent
   */
  async getLatestCheckpoint(): Promise<AgentCheckpoint | undefined> {
    const checkpoints = await this.storage.list(this.agentName);
    if (checkpoints.length === 0) return undefined;

    return checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * List all checkpoints for this agent
   */
  async listCheckpoints(): Promise<AgentCheckpoint[]> {
    return this.storage.list(this.agentName);
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await this.storage.delete(checkpointId);
  }

  /**
   * Clear all checkpoints for this agent
   */
  async clearCheckpoints(): Promise<void> {
    await this.storage.clear(this.agentName);
  }

  // ==================== ExecutorHooks Implementation ====================

  async onExecuteStart(input: string, context: AgentContext): Promise<void> {
    this.currentContext = context;
    this.lastCheckpointTime = Date.now();
    this.lastCheckpointIteration = context.iteration;
  }

  async onExecuteEnd(result: AgentResult): Promise<void> {
    this.currentContext = null;
  }

  async onIterationComplete(iteration: number, context: AgentContext): Promise<void> {
    this.currentContext = context;

    // Check if we should create a checkpoint based on iteration interval
    if (this.policy.iterationInterval && this.policy.iterationInterval > 0) {
      const iterationsSinceCheckpoint = iteration - this.lastCheckpointIteration;
      if (iterationsSinceCheckpoint >= this.policy.iterationInterval) {
        await this.createCheckpoint(context);
      }
    }

    // Check if we should create a checkpoint based on time interval
    if (this.policy.timeInterval && this.policy.timeInterval > 0) {
      const timeSinceCheckpoint = Date.now() - this.lastCheckpointTime;
      if (timeSinceCheckpoint >= this.policy.timeInterval) {
        await this.createCheckpoint(context);
      }
    }
  }

  async afterAct(results: ToolResultWithMeta[]): Promise<void> {
    // Create checkpoint after tool calls if enabled
    if (this.policy.afterToolCall && this.currentContext) {
      await this.createCheckpoint(this.currentContext);
    }
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    // Create checkpoint on error for recovery
    this.currentContext = context;
    await this.createCheckpoint(context);
  }

  // ==================== Private Methods ====================

  private generateCheckpointId(): string {
    return `cp_${this.agentName}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private cloneContext(context: AgentContext): AgentContext {
    return {
      messages: context.messages.map((m) => ({ ...m })),
      state: context.state,
      iteration: context.iteration,
      toolResults: context.toolResults.map((r) => ({ ...r })),
      metadata: { ...context.metadata },
    };
  }

  private async cleanupOldCheckpoints(): Promise<void> {
    const checkpoints = await this.storage.list(this.agentName);
    if (checkpoints.length <= (this.policy.maxCheckpoints || 10)) {
      return;
    }

    // Sort by timestamp descending
    const sorted = checkpoints.sort((a, b) => b.timestamp - a.timestamp);

    // Delete oldest checkpoints
    const toDelete = sorted.slice(this.policy.maxCheckpoints);
    for (const cp of toDelete) {
      await this.storage.delete(cp.id);
    }
  }
}

/**
 * Create checkpoint hooks
 */
export function createCheckpointHooks(options: CheckpointHooksOptions): CheckpointHooks {
  return new CheckpointHooks(options);
}

/**
 * Create in-memory checkpoint storage
 */
export function createInMemoryCheckpointStorage(): InMemoryCheckpointStorage {
  return new InMemoryCheckpointStorage();
}
