import * as vscode from 'vscode';
import {
  isDashboardTask,
  isDashboardTaskEvent,
  isDashboardTaskSource,
  isDashboardDisposableLike,
  toDashboardTaskId,
  type DashboardTask,
  type DashboardTaskEvent,
  type DashboardTaskRef,
  type DashboardTaskSource,
  type DashboardDisposableLike,
} from '@neko/shared/types/dashboard-task';
import { NOOP_DASHBOARD_LOGGER, type DashboardLogger } from './logging';

const SOURCE_COMMANDS = [
  'neko.cut.getDashboardTaskSource',
  'neko.canvas.getDashboardTaskSource',
  'neko.agent.getDashboardTaskSource',
  'neko.engine.getDashboardTaskSource',
] as const;

interface RegisteredSource {
  readonly source: DashboardTaskSource;
  readonly subscription: DashboardDisposableLike;
}

export interface TaskAggregatorOptions {
  readonly logger?: DashboardLogger;
  readonly sourceCommands?: readonly string[];
}

export class TaskAggregator implements vscode.Disposable {
  private readonly sources = new Map<string, RegisteredSource>();
  private readonly tasks = new Map<string, DashboardTask>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<DashboardTaskEvent>();
  private readonly logger: DashboardLogger;
  private readonly sourceCommands: readonly string[];

  readonly onDidChangeTask = this.emitter.event;

  constructor(options: TaskAggregatorOptions = {}) {
    this.logger = options.logger ?? NOOP_DASHBOARD_LOGGER;
    this.sourceCommands = options.sourceCommands ?? SOURCE_COMMANDS;
    this.disposables.push(
      vscode.commands.registerCommand('neko.dashboard.registerTaskSource', (candidate: unknown) =>
        this.register(candidate),
      ),
    );
  }

  async refreshSources(): Promise<void> {
    await Promise.all(
      this.sourceCommands.map(async (command) => {
        try {
          const candidate = await vscode.commands.executeCommand<unknown>(command);
          await this.register(candidate);
        } catch (error) {
          this.logger.warn('Dashboard task source discovery failed', { command, error });
        }
      }),
    );
  }

  getSnapshot(): DashboardTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  getTask(taskId: string): DashboardTask | undefined {
    return this.tasks.get(taskId);
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown dashboard task: ${taskId}`);
    const source = this.sources.get(task.source)?.source;
    if (!source?.cancel) throw new Error(`Task source cannot cancel: ${task.source}`);
    await source.cancel(toTaskRef(task));
  }

  async retry(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown dashboard task: ${taskId}`);
    const source = this.sources.get(task.source)?.source;
    if (!source?.retry) throw new Error(`Task source cannot retry: ${task.source}`);
    await source.retry(toTaskRef(task));
  }

  dispose(): void {
    for (const registered of this.sources.values()) {
      registered.subscription.dispose();
    }
    this.sources.clear();
    this.tasks.clear();
    this.emitter.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async register(candidate: unknown): Promise<void> {
    if (!isDashboardTaskSource(candidate)) {
      if (candidate !== undefined) {
        this.logger.warn('Ignoring invalid dashboard task source', { candidate });
      }
      return;
    }

    const eventTaskIds = new Set<string>();
    let collectingInitialEvents = true;
    const subscription = candidate.onDidChangeTask((event) => {
      if (collectingInitialEvents && isDashboardTaskEvent(event)) {
        eventTaskIds.add(toDashboardTaskId(event.task));
      }
      this.applyEvent(event);
    });
    if (!isDashboardDisposableLike(subscription)) {
      this.logger.warn('Ignoring dashboard task source with invalid event subscription', {
        source: candidate.source,
      });
      return;
    }

    const previous = this.sources.get(candidate.source);
    previous?.subscription.dispose();
    this.sources.set(candidate.source, { source: candidate, subscription });

    try {
      const snapshot = await candidate.getSnapshot();
      for (const task of snapshot) {
        if (isDashboardTask(task)) {
          const taskId = toDashboardTaskId(task);
          if (!eventTaskIds.has(taskId)) {
            this.tasks.set(taskId, task);
          }
        } else {
          this.logger.warn('Ignoring invalid dashboard task snapshot item', {
            source: candidate.source,
          });
        }
      }
    } catch (error) {
      this.logger.warn('Dashboard task source snapshot failed', {
        source: candidate.source,
        error,
      });
    } finally {
      collectingInitialEvents = false;
    }
  }

  private applyEvent(event: DashboardTaskEvent): void {
    if (!isDashboardTaskEvent(event)) return;

    const taskId = toDashboardTaskId(event.task);
    if (event.type === 'removed') {
      this.tasks.delete(taskId);
    } else {
      this.tasks.set(taskId, event.task);
    }
    this.emitter.fire(event);
  }
}

function toTaskRef(task: DashboardTask): DashboardTaskRef {
  return {
    source: task.source,
    sourceTaskId: task.sourceTaskId,
  };
}
