import type {
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultFollowUpRequest,
  AgentTaskResultSource,
  Task,
  TaskRunLease,
} from '@neko/shared';
import {
  getAgentTaskResultDeliveryPolicy,
  normalizeAgentTaskResultObservation,
  type AgentTaskResultDeliveryDecision,
  AgentTaskResultObservationError,
} from './task-result-observation';
import type {
  RecordAgentTaskResultObservationInput,
  RecordAgentTaskResultObservationResult,
} from '../session/task-result-observation-recorder';

export type AgentTaskResultObservationCoordinatorDiagnosticCode =
  | AgentTaskResultObservationError['code']
  | 'recording-failed'
  | 'followup-dispatch-failed';

export interface AgentTaskResultObservationCoordinatorDiagnostic {
  readonly code: AgentTaskResultObservationCoordinatorDiagnosticCode;
  readonly conversationId?: string;
  readonly runId?: string;
  readonly taskId?: string;
  readonly message: string;
  readonly error?: unknown;
}

export interface AgentTaskResultObservationRecordPort {
  record(input: RecordAgentTaskResultObservationInput): Promise<RecordAgentTaskResultObservationResult>;
}

export interface AgentTaskResultFollowUpScheduler {
  askUserToContinue?(request: AgentTaskResultFollowUpRequest): void | Promise<void>;
  autoResumeAgent?(request: AgentTaskResultFollowUpRequest): void | Promise<void>;
}

export interface HandleAgentTaskResultTerminalInput {
  readonly task: Task;
  readonly lease?: TaskRunLease;
  readonly source: AgentTaskResultSource;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
  readonly now?: number;
}

export interface HandleAgentTaskResultTerminalResult {
  readonly status:
    | 'ignored'
    | 'recorded'
    | 'recorded-and-followup-requested'
    | 'diagnostic';
  readonly recording?: RecordAgentTaskResultObservationResult;
  readonly deliveryDecision?: AgentTaskResultDeliveryDecision;
  readonly diagnostic?: AgentTaskResultObservationCoordinatorDiagnostic;
}

export interface AgentTaskResultObservationCoordinatorOptions {
  readonly recorder: AgentTaskResultObservationRecordPort;
  readonly followUpScheduler?: AgentTaskResultFollowUpScheduler;
  readonly onDiagnostic?: (diagnostic: AgentTaskResultObservationCoordinatorDiagnostic) => void;
}

export class AgentTaskResultObservationCoordinator {
  constructor(private readonly options: AgentTaskResultObservationCoordinatorOptions) {}

  async handleTerminalTask(
    input: HandleAgentTaskResultTerminalInput,
  ): Promise<HandleAgentTaskResultTerminalResult> {
    try {
      const observation = normalizeAgentTaskResultObservation({
        task: input.task,
        source: input.source,
        ...(input.lease ? { lease: input.lease } : {}),
        ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
        ...(input.parentToolCallId ? { parentToolCallId: input.parentToolCallId } : {}),
        now: input.now,
      });
      const recording = await this.options.recorder.record({
        observation,
        outputData: input.task.output?.data,
        deliveryPolicy: input.deliveryPolicy ?? getAgentTaskResultDeliveryPolicy(input.task),
        now: input.now,
      });

      const followUpResult = recording.followUpRecorded
        ? await this.dispatchFollowUp(recording.deliveryDecision)
        : null;
      if (followUpResult) {
        return followUpResult;
      }

      return {
        status:
          recording.followUpRecorded &&
          (recording.deliveryDecision.kind === 'ask-user-to-continue' ||
            recording.deliveryDecision.kind === 'auto-resume-agent')
            ? 'recorded-and-followup-requested'
            : 'recorded',
        recording,
        deliveryDecision: recording.deliveryDecision,
      };
    } catch (error) {
      const diagnostic = this.toDiagnostic(input.task, error);
      this.options.onDiagnostic?.(diagnostic);
      return { status: 'diagnostic', diagnostic };
    }
  }

  private async dispatchFollowUp(
    decision: AgentTaskResultDeliveryDecision,
  ): Promise<HandleAgentTaskResultTerminalResult | null> {
    try {
      if (decision.kind === 'ask-user-to-continue') {
        await this.options.followUpScheduler?.askUserToContinue?.(decision.followUpRequest);
      } else if (decision.kind === 'auto-resume-agent') {
        await this.options.followUpScheduler?.autoResumeAgent?.(decision.followUpRequest);
      }
      return null;
    } catch (error) {
      const diagnostic: AgentTaskResultObservationCoordinatorDiagnostic = {
        code: 'followup-dispatch-failed',
        conversationId:
          decision.kind === 'ask-user-to-continue' || decision.kind === 'auto-resume-agent'
            ? decision.followUpRequest.conversationId
            : undefined,
        runId:
          decision.kind === 'ask-user-to-continue' || decision.kind === 'auto-resume-agent'
            ? decision.followUpRequest.runId
            : undefined,
        taskId:
          decision.kind === 'ask-user-to-continue' || decision.kind === 'auto-resume-agent'
            ? decision.followUpRequest.taskId
            : undefined,
        message: 'Failed to dispatch Agent task-result follow-up request',
        error,
      };
      this.options.onDiagnostic?.(diagnostic);
      return { status: 'diagnostic', diagnostic, deliveryDecision: decision };
    }
  }

  private toDiagnostic(
    task: Task,
    error: unknown,
  ): AgentTaskResultObservationCoordinatorDiagnostic {
    if (error instanceof AgentTaskResultObservationError) {
      return {
        code: error.code,
        conversationId: task.lifecycle?.ownerConversationId,
        runId: readDiagnosticRunId(task, error),
        taskId: task.id,
        message: error.message,
        error,
      };
    }

    return {
      code: 'recording-failed',
      conversationId: task.lifecycle?.ownerConversationId,
      runId: task.lifecycle?.ownerRunId,
      taskId: task.id,
      message: 'Failed to record Agent task-result observation',
      error,
    };
  }
}

export function createAgentTaskResultObservationCoordinator(
  options: AgentTaskResultObservationCoordinatorOptions,
): AgentTaskResultObservationCoordinator {
  return new AgentTaskResultObservationCoordinator(options);
}

function readDiagnosticRunId(task: Task, error: AgentTaskResultObservationError): string | undefined {
  if (
    error.code === 'run-lease-mismatch' &&
    typeof error.details?.['eventLease'] === 'object' &&
    error.details['eventLease'] !== null
  ) {
    const eventLease = error.details['eventLease'] as Record<string, unknown>;
    return typeof eventLease['runId'] === 'string' ? eventLease['runId'] : task.lifecycle?.ownerRunId;
  }

  return task.lifecycle?.ownerRunId;
}
