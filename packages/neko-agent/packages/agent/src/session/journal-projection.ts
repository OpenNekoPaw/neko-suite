/**
 * JournalProjection — build resume-oriented views from journal JSONL files.
 *
 * Recovery reads are projection-backed; old per-workDir conversation JSON is
 * intentionally ignored by the steady-state runtime.
 */

import * as path from 'node:path';
import type {
  AgentObservation,
  ChatMessage,
  DecisionRationale,
  PerceptionEvidence,
} from '@neko/shared';
import { JournalReader } from './journal-reader';
import type { JournalReaderFsOps } from './journal-reader';
import type { AgentEventType } from './types';
import type { JournalEntry } from './journal-writer';
import {
  parseConversationJournalMetadata,
  type ConversationJournalMetadata,
} from './conversation-journal-metadata';
import { projectJournalEntriesToHistory, type ProjectedHistory } from './working-memory';

export interface JournalProjectionOptions {
  includeCompacted?: boolean;
  upToEventId?: string;
}

export interface ConversationSummary {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  source: 'journal-projection';
}

export interface AgentFirstIntegrityIssue {
  readonly kind:
    | 'orphan-observation'
    | 'orphan-evidence'
    | 'observation-missing-evidence'
    | 'rationale-missing-observation'
    | 'rationale-missing-evidence';
  readonly id: string;
  readonly missingId?: string;
  readonly recommendedStatus: 'expired';
}

export interface AgentFirstIntegrityScanResult {
  readonly conversationId: string;
  readonly issues: readonly AgentFirstIntegrityIssue[];
}

export interface AgentFirstProjectionSummary {
  conversationId: string;
  observations: Array<{
    id: string;
    summary: string;
    confidence: AgentObservation['confidence'];
    evidenceIds: readonly string[];
    contextPacketId?: string;
  }>;
  evidence: Array<{
    id: string;
    source: PerceptionEvidence['source'];
    summary: string;
    observationId?: string;
    contextPacketId?: string;
  }>;
  rationales: Array<{
    id: string;
    decision: string;
    reason: string;
    confidence: DecisionRationale['confidence'];
    observationIds: readonly string[];
    evidenceIds: readonly string[];
    contextPacketId?: string;
  }>;
}

export interface IJournalProjection {
  projectToHistory(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ChatMessage[]>;
  projectToHistoryWithEventIds(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ProjectedHistory>;
  projectToSummary(conversationId: string): Promise<ConversationSummary | null>;
  projectToConversationMetadata(
    conversationId: string,
  ): Promise<ConversationJournalMetadata | null>;
  projectAgentFirstGraph(conversationId: string): Promise<AgentFirstProjectionSummary>;
  scanAgentFirstIntegrity(conversationId: string): Promise<AgentFirstIntegrityScanResult>;
  filterEvents(
    conversationId: string,
    type: AgentEventType,
  ): AsyncIterable<JournalEntry & { type: 'event'; event: { type: AgentEventType } }>;
}

export class JournalProjection implements IJournalProjection {
  constructor(
    private readonly _baseDir: string,
    private readonly _fsOps: JournalReaderFsOps,
  ) {}

  async projectToHistory(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ChatMessage[]> {
    const projected = await this.projectToHistoryWithEventIds(conversationId, options);
    return projected.messages;
  }

  async projectToHistoryWithEventIds(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<ProjectedHistory> {
    const entries = await this._readEntries(conversationId, options);
    return projectJournalEntriesToHistory(entries, options);
  }

  async projectToSummary(conversationId: string): Promise<ConversationSummary | null> {
    const entries = await this._readEntries(conversationId);
    if (entries.length === 0) return null;

    const history = projectEntriesToHistory(entries);
    const firstUserMessage = history.find(
      (message): message is ChatMessage & { role: 'user'; content: string } =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    );

    return {
      conversationId,
      title: summarizeConversationTitle(firstUserMessage?.content),
      createdAt: entries[0]!.ts,
      updatedAt: entries[entries.length - 1]!.ts,
      messageCount: history.length,
      source: 'journal-projection',
    };
  }

  async projectToConversationMetadata(
    conversationId: string,
  ): Promise<ConversationJournalMetadata | null> {
    const entries = await this._readEntries(conversationId);
    let latest: ConversationJournalMetadata | null = null;
    for (const entry of entries) {
      if (entry.type !== 'conversation_metadata') continue;
      const metadata = parseConversationJournalMetadata(entry.conversationMetadata);
      if (metadata.conversationId !== conversationId) {
        throw new Error(
          `Conversation Journal metadata owner mismatch: expected ${conversationId}, received ${metadata.conversationId}.`,
        );
      }
      latest = metadata;
    }
    return latest;
  }

  async projectAgentFirstGraph(conversationId: string): Promise<AgentFirstProjectionSummary> {
    const entries = await this._readEntries(conversationId);
    const observations: AgentFirstProjectionSummary['observations'] = [];
    const evidence: AgentFirstProjectionSummary['evidence'] = [];
    const rationales: AgentFirstProjectionSummary['rationales'] = [];

    for (const entry of entries) {
      if (entry.type !== 'event' || !entry.event) {
        continue;
      }
      if (entry.event.type === 'agent.observation.created' && entry.event.agentObservation) {
        observations.push({
          id: entry.event.agentObservation.id,
          summary: entry.event.agentObservation.summary,
          confidence: entry.event.agentObservation.confidence,
          evidenceIds: [...entry.event.agentObservation.evidenceIds],
          ...(entry.event.agentObservation.contextPacketId
            ? { contextPacketId: entry.event.agentObservation.contextPacketId }
            : {}),
        });
      }
      if (entry.event.type === 'agent.evidence.attached' && entry.event.agentEvidence) {
        evidence.push({
          id: entry.event.agentEvidence.id,
          source: entry.event.agentEvidence.source,
          summary: entry.event.agentEvidence.summary,
          ...(entry.event.agentEvidence.observationId
            ? { observationId: entry.event.agentEvidence.observationId }
            : {}),
          ...(entry.event.agentEvidence.contextPacketId
            ? { contextPacketId: entry.event.agentEvidence.contextPacketId }
            : {}),
        });
      }
      if (entry.event.type === 'agent.rationale.created' && entry.event.agentRationale) {
        rationales.push({
          id: entry.event.agentRationale.id,
          decision: entry.event.agentRationale.decision,
          reason: entry.event.agentRationale.reason,
          confidence: entry.event.agentRationale.confidence,
          observationIds: [...entry.event.agentRationale.observationIds],
          evidenceIds: [...entry.event.agentRationale.evidenceIds],
          ...(entry.event.agentRationale.contextPacketId
            ? { contextPacketId: entry.event.agentRationale.contextPacketId }
            : {}),
        });
      }
    }

    return { conversationId, observations, evidence, rationales };
  }

  async scanAgentFirstIntegrity(conversationId: string): Promise<AgentFirstIntegrityScanResult> {
    const graph = await this.projectAgentFirstGraph(conversationId);
    const observationIds = new Set(graph.observations.map((observation) => observation.id));
    const evidenceIds = new Set(graph.evidence.map((item) => item.id));
    const referencedObservationIds = new Set<string>();
    const referencedEvidenceIds = new Set<string>();
    const issues: AgentFirstIntegrityIssue[] = [];

    for (const item of graph.evidence) {
      if (!item.observationId) {
        issues.push({ kind: 'orphan-evidence', id: item.id, recommendedStatus: 'expired' });
        continue;
      }
      referencedObservationIds.add(item.observationId);
      if (!observationIds.has(item.observationId)) {
        issues.push({
          kind: 'orphan-evidence',
          id: item.id,
          missingId: item.observationId,
          recommendedStatus: 'expired',
        });
      }
    }

    for (const rationale of graph.rationales) {
      for (const observationId of rationale.observationIds) {
        referencedObservationIds.add(observationId);
        if (!observationIds.has(observationId)) {
          issues.push({
            kind: 'rationale-missing-observation',
            id: rationale.id,
            missingId: observationId,
            recommendedStatus: 'expired',
          });
        }
      }
      for (const evidenceId of rationale.evidenceIds) {
        referencedEvidenceIds.add(evidenceId);
        if (!evidenceIds.has(evidenceId)) {
          issues.push({
            kind: 'rationale-missing-evidence',
            id: rationale.id,
            missingId: evidenceId,
            recommendedStatus: 'expired',
          });
        }
      }
    }

    for (const observation of graph.observations) {
      if (!referencedObservationIds.has(observation.id) && observation.evidenceIds.length === 0) {
        issues.push({
          kind: 'orphan-observation',
          id: observation.id,
          recommendedStatus: 'expired',
        });
      }
      for (const evidenceId of observation.evidenceIds) {
        referencedEvidenceIds.add(evidenceId);
        if (!evidenceIds.has(evidenceId)) {
          issues.push({
            kind: 'observation-missing-evidence',
            id: observation.id,
            missingId: evidenceId,
            recommendedStatus: 'expired',
          });
        }
      }
    }

    return { conversationId, issues };
  }

  async *filterEvents(
    conversationId: string,
    type: AgentEventType,
  ): AsyncIterable<JournalEntry & { type: 'event'; event: { type: AgentEventType } }> {
    const entries = await this._readEntries(conversationId);
    for (const entry of entries) {
      if (entry.type === 'event' && entry.event?.type === type) {
        yield entry as JournalEntry & { type: 'event'; event: { type: AgentEventType } };
      }
    }
  }

  private async _readEntries(
    conversationId: string,
    options?: JournalProjectionOptions,
  ): Promise<JournalEntry[]> {
    const reader = new JournalReader({
      filePath: path.join(this._baseDir, `${conversationId}.jsonl`),
      fsOps: this._fsOps,
    });
    const entries = await reader.readAll();

    if (!options?.upToEventId) return entries;

    const sliced: JournalEntry[] = [];
    for (const entry of entries) {
      sliced.push(entry);
      if (entry.eventId === options.upToEventId) break;
    }
    return sliced;
  }
}

export function projectEntriesToHistory(entries: readonly JournalEntry[]): ChatMessage[] {
  return projectJournalEntriesToHistory(entries).messages;
}

function summarizeConversationTitle(content?: string): string {
  const trimmed = content?.trim();
  if (!trimmed) return 'Untitled Conversation';
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
}
