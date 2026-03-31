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
  [key: string]: unknown;
}

export interface EnqueueOptions {
  nodeId: string;
  cellId?: string;
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

export class BatchGenerationScheduler implements vscode.Disposable {
  readonly maxConcurrent = 2;
  private readonly maxRetries = 3;

  private queue: GenerationTask[] = [];
  private running = new Map<string, GenerationTask>();
  private disposed = false;

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
    this.cancelAll();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async pump(): Promise<void> {
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
    this.reportToAgent(task, 'generating');

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
        this.reportToAgent(task, 'done');
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
      this.reportToAgent(task, 'error');
    }
    this.running.delete(task.id);
    void this.pump();
  }

  /**
   * Fire-and-forget VSCode command that lets neko-agent forward the progress
   * event to its chat webview. Silently no-ops when neko-agent is not installed.
   */
  private reportToAgent(task: GenerationTask, status: GenerationStatus): void {
    vscode.commands
      .executeCommand('neko.agent.reportGenerationProgress', {
        nodeId: task.nodeId,
        taskId: task.id,
        cellId: task.cellId,
        status,
        total: this.queue.length + this.running.size,
      })
      .then(undefined, () => {
        // neko-agent not installed — ignore
      });
  }

  private async callAgent(task: GenerationTask, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new Error('Aborted');

    // Build generation context from task params + node/cell IDs
    const generationInput = {
      nodeId: task.nodeId,
      cellId: task.cellId,
      prompt: task.params.prompt,
      style: task.params.style,
      ratio: task.params.ratio,
      shotScale: task.params.shotScale,
      cameraMovement: task.params.cameraMovement,
      cameraAngle: task.params.cameraAngle,
      referenceRefs: task.params.referenceRefs,
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
