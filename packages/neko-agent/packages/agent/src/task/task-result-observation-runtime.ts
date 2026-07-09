import type {
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultFollowUpRequest,
  AgentTaskResultSource,
  Task,
  TaskRunLease,
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
} from './task-result-observation-coordinator';

const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export interface AgentTaskResultObservationRuntimeTaskPort {
  list(status?: TaskStatus): Promise<readonly Task[]>;
  onTerminalTask(
    callback: (event: { readonly task: Task; readonly lease?: TaskRunLease }) => void,
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
    readonly source: 'task-result-observation';
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
  readonly lease?: TaskRunLease;
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
  readonly lease?: TaskRunLease;
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
            void this.handleTerminalTask(event.task, { lease: event.lease });
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
      if (!this.shouldObserveTaskManagerTerminalTask({ task })) {
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

  private async handleTerminalTaskSerialized(
    task: Task,
    options: AgentTaskResultObservationTerminalOptions,
  ): Promise<void> {
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
      ...(options.lease ? { lease: options.lease } : {}),
      source: options.source ?? 'task-manager',
      ...(options.parentMessageId ? { parentMessageId: options.parentMessageId } : {}),
      ...(options.parentToolCallId ? { parentToolCallId: options.parentToolCallId } : {}),
      ...(options.deliveryPolicy ? { deliveryPolicy: options.deliveryPolicy } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
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
        source: 'task-result-observation',
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

export function createAgentTaskResultObservationRuntime(
  options: AgentTaskResultObservationRuntimeOptions,
): AgentTaskResultObservationRuntime {
  return new AgentTaskResultObservationRuntime(options);
}

function createTerminalTaskObservationKey(
  task: Task,
  options: AgentTaskResultObservationTerminalOptions,
): string {
  const conversationId = options.lease?.conversationId ?? task.lifecycle?.ownerConversationId ?? '';
  const runId = options.lease?.runId ?? task.lifecycle?.ownerRunId ?? '';
  return `${conversationId}:${runId}:${task.id}:${task.status}`;
}
