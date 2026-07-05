import type {
  AgentTaskResultFollowUpRequest,
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultSource,
  Task,
  TaskRunLease,
  TaskStatus,
} from '@neko/shared';
import {
  createAgentTaskResultObservationCoordinator,
  type AgentTaskResultObservationCoordinatorDiagnostic,
  type IRuntimeTaskManager,
  type RecordAgentTaskResultObservationInput,
  type RecordAgentTaskResultObservationResult,
  type TaskResultObservationJournalEntry,
} from '@neko/agent';
import type { IAgentManager } from '../ai/agentManager';
import type { IAgentRunner } from '../ai/agentRunner';
import { getLogger } from '../base';

const logger = getLogger('TaskResultObservationCoordinator');

const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled'];

export interface TaskResultObservationContinuationPort {
  requestUserContinuation?(request: AgentTaskResultFollowUpRequest): void | Promise<void>;
  dispatchIdleAgentTurn?(request: AgentTaskResultFollowUpRequest): void | Promise<void>;
}

export interface TaskResultObservationCoordinatorOptions {
  readonly tasks: IRuntimeTaskManager;
  readonly agents: IAgentManager;
  readonly continuation?: TaskResultObservationContinuationPort;
  readonly journal?: TaskResultObservationJournalPort;
  readonly onDiagnostic?: (diagnostic: AgentTaskResultObservationCoordinatorDiagnostic) => void;
}

export interface TaskResultObservationJournalPort {
  readExistingEntries(
    conversationId: string,
  ): Promise<readonly TaskResultObservationJournalEntry[]>;
}

export interface TaskResultObservationTerminalOptions {
  readonly lease?: TaskRunLease;
  readonly source?: AgentTaskResultSource;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
  readonly now?: number;
}

export class TaskResultObservationCoordinator {
  private readonly unsubscribe: () => void;
  private continuation: TaskResultObservationContinuationPort | undefined;

  constructor(private readonly options: TaskResultObservationCoordinatorOptions) {
    this.continuation = options.continuation;
    this.unsubscribe = options.tasks.onTerminalTask((event) => {
      void this.handleTerminalTask(event.task, { lease: event.lease });
    });
  }

  setContinuationPort(continuation: TaskResultObservationContinuationPort | undefined): void {
    this.continuation = continuation;
  }

  dispose(): void {
    this.unsubscribe();
  }

  async reconcileTerminalTasks(): Promise<void> {
    const taskGroups = await Promise.all(
      TERMINAL_TASK_STATUSES.map((status) => this.options.tasks.list(status)),
    );
    for (const task of taskGroups.flat()) {
      await this.handleTerminalTask(task);
    }
  }

  async handleTerminalTask(
    task: Task,
    options: TaskResultObservationTerminalOptions = {},
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
      existingEntries: [
        ...(input.existingEntries ?? []),
        ...(existingEntries ?? []),
      ],
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

  private getConfiguredAgent(conversationId: string): IAgentRunner {
    const agent = this.options.agents.get(conversationId);
    if (!agent) {
      throw new Error(`Agent runtime not found for task-result observation: ${conversationId}`);
    }
    return agent;
  }

  private emitDiagnostic(diagnostic: AgentTaskResultObservationCoordinatorDiagnostic): void {
    logger.warn('Agent task-result observation diagnostic', diagnostic);
    this.options.onDiagnostic?.(diagnostic);
  }
}
