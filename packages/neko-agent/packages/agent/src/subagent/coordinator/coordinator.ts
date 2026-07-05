/**
 * Coordinator — Multi-phase SubAgent orchestration
 *
 * Workflow: plan → confirm → execute → verify → done
 *
 * Sits above SubAgentManager, providing:
 * - Phase-based execution with user confirmation gates
 * - TaskPool with dependency resolution and priority
 * - Structured TaskNotification backflow
 * - Concurrent worker dispatch with configurable limits
 */

import { getLogger } from '../../utils/logger';
import type {
  CoordinatorConfig,
  CoordinatorDeps,
  CoordinatorEvent,
  CoordinatorPhase,
  ICoordinator,
  TaskItem,
  TaskNotification,
  TaskPoolProgress,
} from './types';
import { TaskPool } from './task-pool';
import { getSubAgentPromptLabels } from '../subagent-localization';

const logger = getLogger('Coordinator');

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_TASK_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Coordinator
// =============================================================================

export class Coordinator implements ICoordinator {
  readonly id: string;
  private _phase: CoordinatorPhase = 'plan';
  private _config: CoordinatorConfig;
  private _deps: CoordinatorDeps;
  private _pool: TaskPool;
  private _notifications: TaskNotification[] = [];
  private _cancelled = false;

  // Confirmation gate
  private _confirmResolve: ((approved: boolean) => void) | null = null;

  constructor(config: CoordinatorConfig, deps: CoordinatorDeps) {
    this.id = config.id;
    this._config = config;
    this._deps = deps;
    this._pool = new TaskPool();

    // Initialize task pool from config
    for (const task of config.tasks) {
      this._pool.add({ ...task, status: 'pending' } as TaskItem);
    }
  }

  get phase(): CoordinatorPhase {
    return this._phase;
  }

  // ---------------------------------------------------------------------------
  // Main Execution
  // ---------------------------------------------------------------------------

  async *start(): AsyncIterable<CoordinatorEvent> {
    try {
      // Phase 1: PLAN
      this._phase = 'plan';
      const planSummary = this.buildPlanSummary();
      yield this.event('phase_changed', { phase: 'plan', summary: planSummary });

      if (this._cancelled) return;

      // Phase 2: CONFIRM (optional)
      if (this._config.requireConfirmation !== false) {
        this._phase = 'confirm';

        // Set up confirmation gate BEFORE yielding so confirm() can be called
        // in the for-await body without race condition
        const confirmationPromise = new Promise<boolean>((resolve) => {
          this._confirmResolve = resolve;
        });

        yield this.event('confirmation_required', {
          phase: 'confirm',
          summary: planSummary,
        });

        const approved = await confirmationPromise;
        if (!approved || this._cancelled) {
          this._phase = 'done';
          yield this.event('coordinator_done', {
            phase: 'done',
            summary: 'Coordinator cancelled by user during confirmation',
          });
          return;
        }
      }

      if (this._cancelled) return;

      // Phase 3: EXECUTE
      this._phase = 'execute';
      yield this.event('phase_changed', { phase: 'execute' });
      yield* this.executePhase();

      if (this._cancelled) return;

      // Phase 4: VERIFY (optional)
      if (this._config.autoVerify) {
        this._phase = 'verify';
        yield this.event('phase_changed', { phase: 'verify' });
        yield* this.verifyPhase();
      }

      // Phase 5: DONE
      this._phase = 'done';
      yield this.event('coordinator_done', {
        phase: 'done',
        summary: this.buildResultSummary(),
        progress: this._pool.getProgress(),
      });
    } catch (error) {
      logger.error('Coordinator error', { id: this.id, error });
      this._phase = 'done';
      yield this.event('coordinator_done', {
        phase: 'done',
        summary: `Coordinator failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  confirm(approved: boolean): void {
    if (this._confirmResolve) {
      this._confirmResolve(approved);
      this._confirmResolve = null;
    }
  }

  cancel(): void {
    this._cancelled = true;
    // Cancel all running SubAgents
    this._deps.subAgentManager.cancelAll(this._deps.parentAgentId);
    // Unblock confirmation gate
    if (this._confirmResolve) {
      this._confirmResolve(false);
      this._confirmResolve = null;
    }
  }

  getProgress(): TaskPoolProgress {
    return this._pool.getProgress();
  }

  getResults(): TaskNotification[] {
    return [...this._notifications];
  }

  // ---------------------------------------------------------------------------
  // Phase Implementations
  // ---------------------------------------------------------------------------

  private async *executePhase(): AsyncIterable<CoordinatorEvent> {
    const maxConcurrency = this._config.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    const taskTimeout = this._config.taskTimeout ?? DEFAULT_TASK_TIMEOUT;

    // Track active SubAgent → Task mapping
    const activeAgents = new Map<string, string>(); // subAgentId → taskId

    while (!this._pool.isAllDone() && !this._cancelled) {
      // Dispatch ready tasks up to concurrency limit
      const running =
        this._pool.getByStatus('running').length + this._pool.getByStatus('claimed').length;
      const slotsAvailable = maxConcurrency - running;

      if (slotsAvailable > 0) {
        for (let i = 0; i < slotsAvailable; i++) {
          const task = this._pool.claim(`coordinator-${this.id}`);
          if (!task) break;

          yield this.event('task_claimed', { task });

          // Spawn SubAgent synchronously (await spawn, not fire-and-forget)
          await this.dispatchTask(task, taskTimeout, activeAgents);
        }
      }

      // If no active agents and no ready tasks — exit (unresolvable deps or all done)
      if (activeAgents.size === 0 && this._pool.getReady().length === 0) {
        break;
      }

      // Wait for any active SubAgent to complete
      if (activeAgents.size > 0) {
        const completed = await this.waitForAnyCompletion(activeAgents, taskTimeout);
        if (completed) {
          this._notifications.push(completed.notification);
          activeAgents.delete(completed.agentId);

          if (completed.notification.status === 'completed') {
            yield this.event('task_completed', {
              notification: completed.notification,
              progress: this._pool.getProgress(),
            });
          } else {
            yield this.event('task_failed', {
              notification: completed.notification,
              progress: this._pool.getProgress(),
            });
          }
        } else {
          // waitForAnyCompletion returned undefined — break to avoid infinite loop
          break;
        }
      }
    }
  }

  /**
   * Verify phase — check results and optionally re-dispatch failed tasks.
   * For now, just report failed tasks.
   */
  private async *verifyPhase(): AsyncIterable<CoordinatorEvent> {
    const failed = this._pool.getByStatus('failed');
    if (failed.length > 0) {
      const summary = `${failed.length} task(s) failed: ${failed.map((t) => t.id).join(', ')}`;
      yield this.event('phase_changed', { phase: 'verify', summary });
    }
  }

  // ---------------------------------------------------------------------------
  // Task Dispatch
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a task to a SubAgent. On spawn failure, marks task as failed.
   * On success, registers in activeAgents map and marks as running.
   */
  private async dispatchTask(
    task: TaskItem,
    timeout: number,
    activeAgents: Map<string, string>,
  ): Promise<void> {
    const modelTier = this._config.workerModelTier ?? 'balanced';
    const labels = getSubAgentPromptLabels(this._config.locale);

    // Build prompt with parent context
    let prompt = task.prompt;
    if (this._config.parentContext) {
      prompt = `## ${labels.contextFromCoordinator}\n${this._config.parentContext}\n\n## ${labels.task}\n${prompt}`;
    }

    // Include dependency results in prompt
    const depResults = this.getDependencyResults(task);
    if (depResults) {
      prompt = `${prompt}\n\n## ${labels.resultsFromPreviousTasks}\n${depResults}`;
    }

    try {
      const subAgentId = await this._deps.subAgentManager.spawn(
        this._deps.parentAgentId,
        this._deps.conversationId,
        {
          id: `${this.id}-${task.id}`,
          type: task.agentType,
          description: task.description,
          prompt,
          runMode: 'background',
          modelTier,
          timeout,
          ...(this._config.locale ? { locale: this._config.locale } : {}),
        },
      );

      activeAgents.set(subAgentId, task.id);
      // Mark as running (SubAgent was spawned successfully)
      this._pool.markRunning(task.id);
    } catch (err) {
      // Spawn failed — mark task as failed
      const notification = this._pool.fail(
        task.id,
        `Spawn failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this._notifications.push(notification);
    }
  }

  // ---------------------------------------------------------------------------
  // Wait Helpers
  // ---------------------------------------------------------------------------

  private async waitForAnyCompletion(
    activeAgents: Map<string, string>,
    timeout: number,
  ): Promise<{ notification: TaskNotification; agentId: string } | undefined> {
    const agentIds = Array.from(activeAgents.keys());
    if (agentIds.length === 0) return undefined;

    // Race all active agents for first completion
    try {
      const result = await Promise.race(
        agentIds.map(async (agentId) => {
          const subResult = await this._deps.subAgentManager.getResult(agentId, timeout);
          return { agentId, subResult };
        }),
      );

      const taskId = activeAgents.get(result.agentId);
      if (!taskId) return undefined;

      if (result.subResult.status === 'completed') {
        return {
          notification: this._pool.complete(taskId, result.subResult),
          agentId: result.agentId,
        };
      } else {
        return {
          notification: this._pool.fail(
            taskId,
            result.subResult.error ?? 'SubAgent failed',
            result.subResult.duration,
          ),
          agentId: result.agentId,
        };
      }
    } catch (err) {
      logger.error('Wait for completion error', { error: err });
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Summary Builders
  // ---------------------------------------------------------------------------

  private buildPlanSummary(): string {
    const tasks = this._pool.getAll();
    const lines = tasks.map((t) => {
      const deps = t.dependencies?.length ? ` (depends on: ${t.dependencies.join(', ')})` : '';
      return `- [${t.agentType}] ${t.description}${deps}`;
    });

    return `Coordinator "${this._config.description}" — ${tasks.length} task(s):\n${lines.join('\n')}`;
  }

  private buildResultSummary(): string {
    const progress = this._pool.getProgress();
    const lines = [
      `Coordinator "${this._config.description}" completed.`,
      `Results: ${progress.completed} succeeded, ${progress.failed} failed, ${progress.total} total.`,
    ];

    for (const n of this._notifications) {
      const status = n.status === 'completed' ? '✓' : '✗';
      const detail = n.result?.response?.slice(0, 100) ?? n.error ?? '';
      lines.push(`  ${status} ${n.taskId}: ${detail}`);
    }

    return lines.join('\n');
  }

  private getDependencyResults(task: TaskItem): string | undefined {
    if (!task.dependencies || task.dependencies.length === 0) return undefined;

    const parts: string[] = [];
    for (const depId of task.dependencies) {
      const dep = this._pool.get(depId);
      if (dep?.result?.response) {
        parts.push(`### ${depId}\n${dep.result.response}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  // ---------------------------------------------------------------------------
  // Event Helper
  // ---------------------------------------------------------------------------

  private event(
    type: CoordinatorEvent['type'],
    data: Partial<Omit<CoordinatorEvent, 'type' | 'coordinatorId' | 'timestamp'>> = {},
  ): CoordinatorEvent {
    return {
      type,
      coordinatorId: this.id,
      timestamp: Date.now(),
      ...data,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/** Create a Coordinator instance */
export function createCoordinator(config: CoordinatorConfig, deps: CoordinatorDeps): Coordinator {
  return new Coordinator(config, deps);
}
