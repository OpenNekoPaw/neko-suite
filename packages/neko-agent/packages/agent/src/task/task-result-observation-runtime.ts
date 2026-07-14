import { formatChildRunScope } from '@neko/shared';
import type { AgentContinuationMetadata, AgentQueuedMessageDisplayKind } from '@neko-agent/types';
import type {
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultFollowUpRequest,
  AgentTaskResultSource,
  Task,
  TaskRunScope,
  TaskStatus,
} from '@neko/shared';
import type {
  RecordAgentTaskResultObservationInput,
  RecordAgentTaskResultObservationResult,
} from '../session/task-result-observation-recorder';
import type { TaskResultObservationJournalEntry } from '../session/task-result-observation-recorder';
import {
  createAgentTaskResultObservationCoordinator,
  type AgentTaskResultObservationCoordinatorDiagnostic,
  type HandleAgentChildRunResultTerminalInput,
} from './task-result-observation-coordinator';

const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export interface AgentTaskResultObservationRuntimeTaskPort {
  list(status?: TaskStatus): Promise<readonly Task[]>;
  onTerminalTask(
    callback: (event: { readonly task: Task; readonly scope: TaskRunScope }) => void,
    options?: { readonly replayExisting?: boolean },
  ): () => void;
}

export interface AgentTaskResultObservationRuntimeAgentPort {
  recordTaskResultObservation(
    input: RecordAgentTaskResultObservationInput,
  ): Promise<RecordAgentTaskResultObservationResult>;
  enqueuePendingMessage?(input: {
    readonly conversationId: string;
    readonly content: string;
    readonly source: 'task-result-continuation';
    readonly displayKind: AgentQueuedMessageDisplayKind;
    readonly metadata: AgentContinuationMetadata;
  }): unknown;
}

export interface AgentTaskResultObservationRuntimeAgentRegistry {
  get(conversationId: string): AgentTaskResultObservationRuntimeAgentPort | undefined;
  isRunning(conversationId: string): boolean;
}

export interface AgentTaskResultObservationContinuationPort {
  requestUserContinuation?(request: AgentTaskResultFollowUpRequest): void | Promise<void>;
  dispatchIdleAgentTurn?(request: AgentTaskResultFollowUpRequest): void | Promise<void>;
}

export interface AgentTaskResultObservationJournalPort {
  readExistingEntries(
    conversationId: string,
  ): Promise<readonly TaskResultObservationJournalEntry[]>;
}

export interface AgentTaskResultObservationRuntimeTaskManagerTerminalInput {
  readonly task: Task;
  readonly scope: TaskRunScope;
}

export interface AgentTaskResultObservationRuntimeOptions {
  readonly tasks: AgentTaskResultObservationRuntimeTaskPort;
  readonly agents: AgentTaskResultObservationRuntimeAgentRegistry;
  readonly continuation?: AgentTaskResultObservationContinuationPort;
  readonly journal?: AgentTaskResultObservationJournalPort;
  readonly onDiagnostic?: (diagnostic: AgentTaskResultObservationCoordinatorDiagnostic) => void;
  readonly subscribeToTaskManagerTerminalTasks?: boolean;
  readonly shouldObserveTaskManagerTerminalTask?: (
    input: AgentTaskResultObservationRuntimeTaskManagerTerminalInput,
  ) => boolean;
}

export interface AgentTaskResultObservationTerminalOptions {
  readonly scope?: TaskRunScope;
  readonly source?: AgentTaskResultSource;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
  readonly now?: number;
}

export class AgentTaskResultObservationRuntime {
  private readonly unsubscribe: () => void;
  private readonly terminalTaskHandling = new Map<string, Promise<void>>();
  private continuation: AgentTaskResultObservationContinuationPort | undefined;

  constructor(private readonly options: AgentTaskResultObservationRuntimeOptions) {
    this.continuation = options.continuation;
    this.unsubscribe =
      options.subscribeToTaskManagerTerminalTasks === false
        ? () => undefined
        : options.tasks.onTerminalTask((event) => {
            if (!this.shouldObserveTaskManagerTerminalTask(event)) {
              return;
            }
            void this.handleTerminalTask(event.task, { scope: event.scope });
          });
  }

  setContinuationPort(continuation: AgentTaskResultObservationContinuationPort | undefined): void {
    this.continuation = continuation;
  }

  dispose(): void {
    this.unsubscribe();
  }

  async flush(): Promise<void> {
    await Promise.resolve();
    await Promise.all([...this.terminalTaskHandling.values()]);
  }

  async reconcileTerminalTasks(): Promise<void> {
    const taskGroups = await Promise.all(
      TERMINAL_TASK_STATUSES.map((status) => this.options.tasks.list(status)),
    );
    for (const task of taskGroups.flat()) {
      if (!this.shouldObserveTaskManagerTerminalTask({ task, scope: task.scope })) {
        continue;
      }
      await this.handleTerminalTask(task);
    }
  }

  async handleTerminalTask(
    task: Task,
    options: AgentTaskResultObservationTerminalOptions = {},
  ): Promise<void> {
    const key = createTerminalTaskObservationKey(task, options);
    const previous = this.terminalTaskHandling.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.handleTerminalTaskSerialized(task, options));
    this.terminalTaskHandling.set(key, current);
    try {
      await current;
    } finally {
      if (this.terminalTaskHandling.get(key) === current) {
        this.terminalTaskHandling.delete(key);
      }
    }
  }

  async handleTerminalChildRun(input: HandleAgentChildRunResultTerminalInput): Promise<void> {
    const key = formatChildRunScope(input.scope);
    const previous = this.terminalTaskHandling.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        const coordinator = createAgentTaskResultObservationCoordinator({
          recorder: { record: (recordInput) => this.recordObservation(recordInput) },
          followUpScheduler: {
            askUserToContinue: (request) => this.askUserToContinue(request),
            autoResumeAgent: (request) => this.autoResumeAgent(request),
          },
          onDiagnostic: (diagnostic) => this.emitDiagnostic(diagnostic),
        });
        await coordinator.handleTerminalChildRun(input);
      });
    this.terminalTaskHandling.set(key, current);
    try {
      await current;
    } finally {
      if (this.terminalTaskHandling.get(key) === current) {
        this.terminalTaskHandling.delete(key);
      }
    }
  }

  private async handleTerminalTaskSerialized(
    task: Task,
    options: AgentTaskResultObservationTerminalOptions,
  ): Promise<void> {
    const deliveryPolicy = await this.resolveDeliveryPolicyForTask(task, options);
    const coordinator = createAgentTaskResultObservationCoordinator({
      recorder: {
        record: (input) => this.recordObservation(input),
      },
      followUpScheduler: {
        askUserToContinue: (request) => this.askUserToContinue(request),
        autoResumeAgent: (request) => this.autoResumeAgent(request),
      },
      onDiagnostic: (diagnostic) => this.emitDiagnostic(diagnostic),
    });

    await coordinator.handleTerminalTask({
      task,
      ...(options.scope ? { scope: options.scope } : {}),
      source: options.source ?? 'task-manager',
      ...(options.parentMessageId ? { parentMessageId: options.parentMessageId } : {}),
      ...(options.parentToolCallId ? { parentToolCallId: options.parentToolCallId } : {}),
      ...(deliveryPolicy ? { deliveryPolicy } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  }

  private async resolveDeliveryPolicyForTask(
    task: Task,
    options: AgentTaskResultObservationTerminalOptions,
  ): Promise<AgentTaskResultDeliveryPolicy | undefined> {
    if (options.deliveryPolicy) return options.deliveryPolicy;
    const group = task.lifecycle?.resultDeliveryGroup;
    if (!group || group.resultDeliveryPolicy !== 'wait-all') {
      return undefined;
    }
    if (!group.expectedTaskIds || group.expectedTaskIds.length === 0) {
      this.emitDiagnostic({
        code: 'invalid-task-group',
        conversationId: task.scope.conversationId,
        runId: task.scope.runId,
        taskId: task.id,
        message: `Task group ${group.taskGroupId} wait-all delivery requires explicit expectedTaskIds.`,
      });
      return { kind: 'append-observation' };
    }
    const terminalTasks = (
      await Promise.all(TERMINAL_TASK_STATUSES.map((status) => this.options.tasks.list(status)))
    ).flat();
    const terminalIds = new Set(
      terminalTasks
        .filter((item) => hasSameTaskOwnerScope(item.scope, task.scope))
        .map((item) => item.id),
    );
    const allExpectedTerminal = group.expectedTaskIds.every((taskId) => terminalIds.has(taskId));
    return allExpectedTerminal ? undefined : { kind: 'append-observation' };
  }

  private async recordObservation(
    input: RecordAgentTaskResultObservationInput,
  ): Promise<RecordAgentTaskResultObservationResult> {
    const agent = this.getConfiguredAgent(input.observation.conversationId);
    const existingEntries = await this.options.journal?.readExistingEntries(
      input.observation.conversationId,
    );
    return agent.recordTaskResultObservation({
      ...input,
      existingEntries: [...(input.existingEntries ?? []), ...(existingEntries ?? [])],
    });
  }

  private async askUserToContinue(request: AgentTaskResultFollowUpRequest): Promise<void> {
    if (!this.continuation?.requestUserContinuation) {
      throw new Error('No task-result continuation UI is registered');
    }
    await this.continuation.requestUserContinuation(request);
  }

  private async autoResumeAgent(request: AgentTaskResultFollowUpRequest): Promise<void> {
    const agent = this.getConfiguredAgent(request.conversationId);
    if (this.options.agents.isRunning(request.conversationId)) {
      if (!agent.enqueuePendingMessage) {
        throw new Error('Running Agent did not expose a task-result follow-up queue');
      }
      const queued = agent.enqueuePendingMessage({
        conversationId: request.conversationId,
        content: request.prompt,
        source: 'task-result-continuation',
        displayKind: 'task-continuation',
        metadata: {
          observationId: request.observationId,
          taskId: request.taskId,
          runId: request.runId,
          status: 'queued',
          policy: request.policy.kind,
        },
      });
      if (!queued) {
        throw new Error('Agent was running but did not accept task-result follow-up queue item');
      }
      return;
    }

    if (!this.continuation?.dispatchIdleAgentTurn) {
      throw new Error('No idle Agent turn dispatcher is registered for task-result follow-up');
    }
    await this.continuation.dispatchIdleAgentTurn(request);
  }

  private getConfiguredAgent(conversationId: string): AgentTaskResultObservationRuntimeAgentPort {
    const agent = this.options.agents.get(conversationId);
    if (!agent) {
      throw new Error(`Agent runtime not found for task-result observation: ${conversationId}`);
    }
    return agent;
  }

  private emitDiagnostic(diagnostic: AgentTaskResultObservationCoordinatorDiagnostic): void {
    this.options.onDiagnostic?.(diagnostic);
  }

  private shouldObserveTaskManagerTerminalTask(
    input: AgentTaskResultObservationRuntimeTaskManagerTerminalInput,
  ): boolean {
    return this.options.shouldObserveTaskManagerTerminalTask?.(input) ?? true;
  }
}

function hasSameTaskOwnerScope(left: TaskRunScope, right: TaskRunScope): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.runId === right.runId &&
    left.parentRunId === right.parentRunId &&
    left.childKind === right.childKind
  );
}

export function createAgentTaskResultObservationRuntime(
  options: AgentTaskResultObservationRuntimeOptions,
): AgentTaskResultObservationRuntime {
  return new AgentTaskResultObservationRuntime(options);
}

function createTerminalTaskObservationKey(
  task: Task,
  options: AgentTaskResultObservationTerminalOptions,
): string {
  const scope = options.scope ?? task.scope;
  return `${scope.conversationId}:${scope.runId}:${scope.parentRunId}:${scope.childRunId}:${task.status}`;
}
