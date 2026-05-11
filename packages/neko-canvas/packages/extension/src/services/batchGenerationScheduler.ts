/**
 * BatchGenerationScheduler - Extension-side queue for AI image generation.
 *
 * Design principles:
 * - Runs entirely in Extension Host (Node.js), never in webview
 * - maxConcurrent=2 to avoid overwhelming the generation backend
 * - Exponential backoff retry (3 attempts: 1s, 2s, 4s)
 * - AbortController per task for cancellation
 * - Progress is reported via onProgress callback → webview postMessage
 */

import * as vscode from 'vscode';

// =============================================================================
// Types
// =============================================================================

export type GenerationStatus = 'pending' | 'generating' | 'done' | 'error';

export interface GenerationParams {
  prompt: string;
  style?: string;
  ratio?: string;
  shotScale?: string;
  cameraMovement?: string;
  cameraAngle?: string;
  referenceRefs?: string[];
  count?: number;
  characterIds?: string[];
  sourceNodeId?: string;
  [key: string]: unknown;
}

export interface EnqueueOptions {
  nodeId: string;
  childNodeId?: string;
  params: GenerationParams;
  onProgress: (status: GenerationStatus, dataUrl?: string) => void;
}

interface GenerationTask extends EnqueueOptions {
  id: string;
  abortController: AbortController;
  retryCount: number;
}

// =============================================================================
// Scheduler
// =============================================================================

// Module-level registry of live schedulers so the orchestrator's cross-
// extension plan-state commands can fan out to all of them.  Entries are
// added on construction and removed on dispose.
const liveSchedulers = new Set<BatchGenerationScheduler>();

/**
 * Broadcast quiet mode to every live scheduler.  Called by the VSCode
 * command `neko.canvas.orchestrator.planStateChanged` (registered in
 * canvasEditorProvider bootstrap) when neko-agent signals a workflow
 * plan transition.
 *
 * `reason = undefined` clears quiet mode and resumes pumping.
 */
export function broadcastQuietMode(reason: string | undefined): void {
  for (const scheduler of liveSchedulers) {
    scheduler.setQuietMode(reason);
  }
}

/** Test-only: inspect the current registry size. */
export function getLiveSchedulerCount(): number {
  return liveSchedulers.size;
}

export class BatchGenerationScheduler implements vscode.Disposable {
  readonly maxConcurrent = 2;
  private readonly maxRetries = 3;

  private queue: GenerationTask[] = [];
  private running = new Map<string, GenerationTask>();
  private disposed = false;
  /**
   * When set, the pump will not drain the queue.  Enqueue still works so
   * tasks accumulate, and `pump()` resumes as soon as quiet mode clears.
   * Used to coordinate with the neko-agent Workflow Orchestrator so the
   * canvas batch queue and the orchestrator's `batchGenerate` stage don't
   * run concurrently over the same nodes.
   */
  private quietReason: string | undefined;

  constructor() {
    liveSchedulers.add(this);
  }

  /**
   * Set or clear quiet mode.  While quiet, the pump will not start new
   * tasks; already-running tasks are allowed to finish.
   */
  setQuietMode(reason: string | undefined): void {
    const was = this.quietReason;
    this.quietReason = reason;
    if (!reason && was) {
      // Quiet mode just cleared — drain whatever queued up.
      void this.pump();
    }
  }

  /** Test-only: peek the current quiet reason. */
  getQuietReason(): string | undefined {
    return this.quietReason;
  }

  /** Add a generation task to the queue and start it if a slot is free. */
  enqueue(options: EnqueueOptions): string {
    if (this.disposed) return '';

    const task: GenerationTask = {
      ...options,
      id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      abortController: new AbortController(),
      retryCount: 0,
    };

    this.queue.push(task);
    task.onProgress('pending');
    void this.pump();
    return task.id;
  }

  /** Cancel a specific task by ID. */
  cancel(taskId: string): void {
    const running = this.running.get(taskId);
    if (running) {
      running.abortController.abort();
      return;
    }
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  /** Cancel all queued and running tasks. */
  cancelAll(): void {
    for (const task of this.running.values()) {
      task.abortController.abort();
    }
    this.queue.length = 0;
  }

  dispose(): void {
    this.disposed = true;
    liveSchedulers.delete(this);
    this.cancelAll();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async pump(): Promise<void> {
    // Quiet mode — hold off starting new tasks until the orchestrator plan
    // reaches a terminal state.  Already-running tasks continue.
    if (this.quietReason !== undefined) return;
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      this.running.set(task.id, task);
      void this.execute(task);
    }
  }

  private async execute(task: GenerationTask): Promise<void> {
    const { abortController } = task;

    task.onProgress('generating');

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (abortController.signal.aborted || this.disposed) {
        this.running.delete(task.id);
        return;
      }

      try {
        const dataUrl = await this.callAgent(task, abortController.signal);
        if (abortController.signal.aborted) break;
        task.onProgress('done', dataUrl);
        this.running.delete(task.id);
        void this.pump();
        return;
      } catch (err) {
        lastError = err;
        if (abortController.signal.aborted) break;
        if (attempt < this.maxRetries) {
          const backoffMs = 1000 * Math.pow(2, attempt);
          await this.delay(backoffMs, abortController.signal);
        }
      }
    }

    if (!abortController.signal.aborted) {
      task.onProgress('error');
    }
    this.running.delete(task.id);
    void this.pump();
  }

  private async callAgent(task: GenerationTask, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new Error('Aborted');

    // Build generation context — spread all params so ControlNet/IP-Adapter
    // fields from the webview (controlMode, controlStrength, etc.) pass through.
    // nodeId/childNodeId are applied AFTER the spread so params cannot redirect the
    // request to a different target node.
    const generationInput = {
      ...task.params,
      nodeId: task.nodeId,
      childNodeId: task.childNodeId,
      count: task.params.count ?? 1,
    };

    const result = await vscode.commands.executeCommand<{ dataUrl: string } | undefined>(
      'neko.agent.generateForNode',
      generationInput,
    );

    if (signal.aborted) throw new Error('Aborted');

    if (!result?.dataUrl) {
      throw new Error('neko-agent returned no image data');
    }

    return result.dataUrl;
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      });
    });
  }
}
