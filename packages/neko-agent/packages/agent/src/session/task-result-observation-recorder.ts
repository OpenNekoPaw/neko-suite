import type {
  AgentTaskResultDeliveryPolicy,
  AgentTaskResultFollowUpRequest,
  AgentTaskResultObservation,
} from '@neko/shared';
import {
  createAgentTaskResultObservationRecords,
  evaluateAgentTaskResultDelivery,
  type AgentTaskResultDeliveryDecision,
} from '../task/task-result-observation';
import type { AgentEvent, IJournalWriter } from './types';

export interface TaskResultObservationJournalEntry {
  readonly event?: Pick<
    AgentEvent,
    'type' | 'agentObservation' | 'agentEvidence' | 'taskResultFollowUp'
  >;
}

export interface AgentTaskResultObservationLedger {
  readonly observationIds: ReadonlySet<string>;
  readonly evidenceIds: ReadonlySet<string>;
  readonly followUpRequestIds: ReadonlySet<string>;
}

export interface RecordAgentTaskResultObservationInput {
  readonly observation: AgentTaskResultObservation;
  readonly outputData?: unknown;
  readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
  readonly existingEntries?: readonly TaskResultObservationJournalEntry[];
  readonly now?: number;
}

export interface RecordAgentTaskResultObservationResult {
  readonly observationRecorded: boolean;
  readonly evidenceRecorded: boolean;
  readonly followUpRecorded: boolean;
  readonly eventIds: readonly string[];
  readonly deliveryDecision: AgentTaskResultDeliveryDecision;
}

export interface SessionTaskResultObservationRecorderConfig {
  readonly journalWriter: IJournalWriter;
  readonly nextSeq: () => number;
}

export class SessionTaskResultObservationRecorder {
  constructor(private readonly config: SessionTaskResultObservationRecorderConfig) {}

  async record(
    input: RecordAgentTaskResultObservationInput,
  ): Promise<RecordAgentTaskResultObservationResult> {
    const ledger = createAgentTaskResultObservationLedger(input.existingEntries ?? []);
    const records = createAgentTaskResultObservationRecords({
      observation: input.observation,
      outputData: input.outputData,
      now: input.now,
    });
    const deliveryDecision = evaluateAgentTaskResultDelivery({
      observation: input.observation,
      policy: input.deliveryPolicy,
      now: input.now,
    });
    const eventIds: string[] = [];
    let observationRecorded = false;
    let evidenceRecorded = false;
    let followUpRecorded = false;

    if (!ledger.observationIds.has(records.observation.id)) {
      eventIds.push(
        await this.config.journalWriter.appendEvent(this.config.nextSeq(), {
          type: 'agent.observation.created',
          agentObservation: records.observation,
        }),
      );
      observationRecorded = true;
    }

    if (!ledger.evidenceIds.has(records.evidence.id)) {
      eventIds.push(
        await this.config.journalWriter.appendEvent(this.config.nextSeq(), {
          type: 'agent.evidence.attached',
          agentEvidence: records.evidence,
        }),
      );
      evidenceRecorded = true;
    }

    if (
      (deliveryDecision.kind === 'ask-user-to-continue' ||
        deliveryDecision.kind === 'auto-resume-agent') &&
      !ledger.followUpRequestIds.has(deliveryDecision.followUpRequest.id)
    ) {
      eventIds.push(
        await this.config.journalWriter.appendEvent(this.config.nextSeq(), {
          type: 'agent.task_result.followup_requested',
          taskResultFollowUp: deliveryDecision.followUpRequest,
        }),
      );
      followUpRecorded = true;
    }

    if (eventIds.length > 0) {
      await this.config.journalWriter.flush();
    }

    return {
      observationRecorded,
      evidenceRecorded,
      followUpRecorded,
      eventIds,
      deliveryDecision,
    };
  }
}

export function createAgentTaskResultObservationLedger(
  entries: readonly TaskResultObservationJournalEntry[],
): AgentTaskResultObservationLedger {
  const observationIds = new Set<string>();
  const evidenceIds = new Set<string>();
  const followUpRequestIds = new Set<string>();

  for (const entry of entries) {
    const event = entry.event;
    if (!event) continue;
    if (event.type === 'agent.observation.created' && event.agentObservation?.id) {
      observationIds.add(event.agentObservation.id);
      continue;
    }
    if (event.type === 'agent.evidence.attached' && event.agentEvidence?.id) {
      evidenceIds.add(event.agentEvidence.id);
      continue;
    }
    if (event.type === 'agent.task_result.followup_requested' && event.taskResultFollowUp?.id) {
      followUpRequestIds.add(event.taskResultFollowUp.id);
    }
  }

  return { observationIds, evidenceIds, followUpRequestIds };
}

export function createTaskResultObservationJournalEntries(input: {
  readonly recordInput: RecordAgentTaskResultObservationInput;
  readonly recordResult: RecordAgentTaskResultObservationResult;
}): readonly TaskResultObservationJournalEntry[] {
  const entries: TaskResultObservationJournalEntry[] = [];
  const records = createAgentTaskResultObservationRecords({
    observation: input.recordInput.observation,
    outputData: input.recordInput.outputData,
    now: input.recordInput.now,
  });

  if (input.recordResult.observationRecorded) {
    entries.push({
      event: {
        type: 'agent.observation.created',
        agentObservation: records.observation,
      },
    });
  }

  if (input.recordResult.evidenceRecorded) {
    entries.push({
      event: {
        type: 'agent.evidence.attached',
        agentEvidence: records.evidence,
      },
    });
  }

  if (
    input.recordResult.followUpRecorded &&
    (input.recordResult.deliveryDecision.kind === 'ask-user-to-continue' ||
      input.recordResult.deliveryDecision.kind === 'auto-resume-agent')
  ) {
    entries.push({
      event: {
        type: 'agent.task_result.followup_requested',
        taskResultFollowUp: input.recordResult.deliveryDecision.followUpRequest,
      },
    });
  }

  return entries;
}

export function createSessionTaskResultObservationRecorder(
  config: SessionTaskResultObservationRecorderConfig,
): SessionTaskResultObservationRecorder {
  return new SessionTaskResultObservationRecorder(config);
}
