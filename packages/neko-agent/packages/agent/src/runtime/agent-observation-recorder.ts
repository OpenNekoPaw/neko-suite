import type { AgentObservation, DecisionRationale, PerceptionEvidence } from '@neko/shared';
import type { IRuntimeJournalWriter } from './types';

type PersistedAgentFirstRecord<T extends { readonly contextPacketId?: string }> = T & {
  readonly contextPacketId: string;
};

export interface AgentObservationRecorderConfig {
  readonly journalWriter: IRuntimeJournalWriter;
  readonly nextSeq: () => number;
  readonly contextPacketId: string;
}

export interface IAgentObservationRecorder {
  recordObservation(observation: AgentObservation): Promise<string>;
  attachEvidence(evidence: PerceptionEvidence): Promise<string>;
  recordDecisionRationale(rationale: DecisionRationale): Promise<string>;
}

export class AgentObservationRecorder implements IAgentObservationRecorder {
  private readonly journalWriter: IRuntimeJournalWriter;
  private readonly nextSeq: () => number;
  private readonly contextPacketId: string;
  private readonly observationIds = new Set<string>();
  private readonly evidenceIds = new Set<string>();

  constructor(config: AgentObservationRecorderConfig) {
    if (!config.contextPacketId.trim()) {
      throw new Error('AgentObservationRecorder requires a contextPacketId');
    }
    this.journalWriter = config.journalWriter;
    this.nextSeq = config.nextSeq;
    this.contextPacketId = config.contextPacketId;
  }

  async recordObservation(observation: AgentObservation): Promise<string> {
    const eventId = await this.journalWriter.appendEvent(this.nextSeq(), {
      type: 'agent.observation.created',
      agentObservation: this.withContextPacketId(observation),
    });
    this.observationIds.add(observation.id);
    return eventId;
  }

  async attachEvidence(evidence: PerceptionEvidence): Promise<string> {
    const eventId = await this.journalWriter.appendEvent(this.nextSeq(), {
      type: 'agent.evidence.attached',
      agentEvidence: this.withContextPacketId(evidence),
    });
    this.evidenceIds.add(evidence.id);
    return eventId;
  }

  recordDecisionRationale(rationale: DecisionRationale): Promise<string> {
    this.assertRationaleReferences(rationale);
    return this.journalWriter.appendEvent(this.nextSeq(), {
      type: 'agent.rationale.created',
      agentRationale: this.withContextPacketId(rationale),
    });
  }

  private assertRationaleReferences(rationale: DecisionRationale): void {
    const missingObservationIds = rationale.observationIds.filter(
      (id) => !this.observationIds.has(id),
    );
    const missingEvidenceIds = (rationale.evidenceIds ?? []).filter(
      (id) => !this.evidenceIds.has(id),
    );
    if (missingObservationIds.length === 0 && missingEvidenceIds.length === 0) {
      return;
    }

    throw new Error(
      'DecisionRationale references unknown Agent-first records: ' +
        [
          missingObservationIds.length > 0
            ? `observations=${missingObservationIds.join(',')}`
            : null,
          missingEvidenceIds.length > 0 ? `evidence=${missingEvidenceIds.join(',')}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join('; '),
    );
  }

  private withContextPacketId<T extends { readonly contextPacketId?: string }>(
    value: T,
  ): PersistedAgentFirstRecord<T> {
    if (value.contextPacketId) {
      return { ...value, contextPacketId: value.contextPacketId };
    }

    return { ...value, contextPacketId: this.contextPacketId };
  }
}

export function createAgentObservationRecorder(
  config: AgentObservationRecorderConfig,
): IAgentObservationRecorder {
  return new AgentObservationRecorder(config);
}
