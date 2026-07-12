import type {
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultFollowUpRequest,
  AgentTaskResultSource,
  Task,
  TaskRunScope,
} from '@neko/shared';
import {
  createAgentTaskResultObservationRuntime,
  type AgentTaskResultObservationContinuationPort,
  type AgentTaskResultObservationCoordinatorDiagnostic,
  type AgentTaskResultObservationJournalPort,
  type AgentTaskResultObservationRuntime,
  type AgentTaskResultObservationRuntimeTaskManagerTerminalInput,
  type HandleAgentChildRunResultTerminalInput,
  type IRuntimeTaskManager,
} from '@neko/agent';
import type { IAgentManager } from '../ai/agentManager';
import { getLogger } from '../base';

const logger = getLogger('TaskResultObservationCoordinator');
const MEDIA_GENERATION_TASK_TYPES = new Set<Task['type']>([
  'image_generation',
  'video_generation',
  'audio_generation',
]);

export type TaskResultObservationContinuationPort = AgentTaskResultObservationContinuationPort;
export type TaskResultObservationJournalPort = AgentTaskResultObservationJournalPort;

export interface TaskResultObservationCoordinatorOptions {
  readonly tasks: IRuntimeTaskManager;
  readonly agents: IAgentManager;
  readonly continuation?: TaskResultObservationContinuationPort;
  readonly journal?: TaskResultObservationJournalPort;
  readonly onDiagnostic?: (diagnostic: AgentTaskResultObservationCoordinatorDiagnostic) => void;
}

export interface TaskResultObservationTerminalOptions {
  readonly scope?: TaskRunScope;
  readonly source?: AgentTaskResultSource;
  readonly parentMessageId?: string;
  readonly parentToolCallId?: string;
  readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
  readonly now?: number;
}

export class TaskResultObservationCoordinator {
  private readonly runtime: AgentTaskResultObservationRuntime;

  constructor(options: TaskResultObservationCoordinatorOptions) {
    this.runtime = createAgentTaskResultObservationRuntime({
      tasks: options.tasks,
      agents: options.agents,
      ...(options.continuation ? { continuation: options.continuation } : {}),
      ...(options.journal ? { journal: options.journal } : {}),
      shouldObserveTaskManagerTerminalTask,
      onDiagnostic: (diagnostic) => {
        logger.warn('Agent task-result observation diagnostic', diagnostic);
        options.onDiagnostic?.(diagnostic);
      },
    });
  }

  setContinuationPort(continuation: TaskResultObservationContinuationPort | undefined): void {
    this.runtime.setContinuationPort(continuation);
  }

  dispose(): void {
    this.runtime.dispose();
  }

  reconcileTerminalTasks(): Promise<void> {
    return this.runtime.reconcileTerminalTasks();
  }

  handleTerminalChildRun(input: HandleAgentChildRunResultTerminalInput): Promise<void> {
    return this.runtime.handleTerminalChildRun(input);
  }

  handleTerminalTask(
    task: Task,
    options: TaskResultObservationTerminalOptions = {},
  ): Promise<void> {
    return this.runtime.handleTerminalTask(task, options);
  }
}

function shouldObserveTaskManagerTerminalTask(
  input: AgentTaskResultObservationRuntimeTaskManagerTerminalInput,
): boolean {
  return !isTaskManagerMediaGenerationTask(input.task);
}

function isTaskManagerMediaGenerationTask(task: Task): boolean {
  return (
    MEDIA_GENERATION_TASK_TYPES.has(task.type) && task.lifecycle?.recoverPolicy === 'resume-polling'
  );
}
