import type {
  SkillLifecycleDeactivationResult,
  SkillLifecycleDiagnostic,
  SkillLifecycleLifetime,
  SkillLifecycleRecord,
  SkillLifecycleRecordStatus,
} from '@neko/shared';

export interface SkillLifecycleCreateRecordInput extends Omit<
  SkillLifecycleRecord,
  'id' | 'createdAt' | 'lastUsedTurn' | 'status'
> {
  readonly id?: string;
  readonly createdAt: number;
  readonly lastUsedTurn: number;
  readonly status?: SkillLifecycleRecordStatus;
}

export interface SkillLifecycleRenewRecordInput {
  readonly recordId: string;
  readonly injection: SkillLifecycleRecord['injection'];
  readonly skillSummary: SkillLifecycleRecord['skillSummary'];
  readonly lifetime?: SkillLifecycleRecord['lifetime'];
  readonly turnCount: number;
}

export interface SkillLifecycleStoreOptions {
  readonly createId?: (input: SkillLifecycleCreateRecordInput) => string;
}

export interface SkillLifecycleExpireInput {
  readonly conversationId: string;
  readonly reason: 'turn-ended' | 'stage-exited' | 'workflow-ended' | 'inactive';
  readonly turnId?: string;
  readonly runId?: string;
  readonly stage?: string;
  readonly currentTurn?: number;
}

/**
 * Conversation-scoped source of truth for active Skill lifecycle records.
 */
export class SkillLifecycleStore {
  private readonly _records = new Map<string, SkillLifecycleRecord>();
  private readonly _createId: (input: SkillLifecycleCreateRecordInput) => string;
  private _sequence = 0;

  constructor(options: SkillLifecycleStoreOptions = {}) {
    this._createId = options.createId ?? ((input) => this._nextId(input));
  }

  create(input: SkillLifecycleCreateRecordInput): SkillLifecycleRecord {
    const id = input.id ?? this._createId(input);
    if (this._records.has(id)) {
      throw new Error(`Skill lifecycle record already exists: ${id}`);
    }

    const record: SkillLifecycleRecord = {
      id,
      conversationId: input.conversationId,
      skillName: input.skillName,
      slot: input.slot,
      owner: input.owner,
      lifetime: input.lifetime,
      injection: input.injection,
      skillSummary: input.skillSummary,
      status: input.status ?? 'active',
      deactivation: input.deactivation,
      createdAt: input.createdAt,
      lastUsedTurn: input.lastUsedTurn,
      source: input.source,
      ...(input.provenance ? { provenance: input.provenance } : {}),
    };
    this._records.set(id, record);
    return record;
  }

  renew(input: SkillLifecycleRenewRecordInput): SkillLifecycleRecord {
    const existing = this._records.get(input.recordId);
    if (!existing) {
      throw new Error(`Cannot renew unknown Skill lifecycle record: ${input.recordId}`);
    }

    const renewed: SkillLifecycleRecord = {
      ...existing,
      injection: input.injection,
      skillSummary: input.skillSummary,
      lifetime: input.lifetime ?? existing.lifetime,
      status: 'active',
      lastUsedTurn: input.turnCount,
    };
    this._records.set(input.recordId, renewed);
    return renewed;
  }

  get(recordId: string): SkillLifecycleRecord | undefined {
    return this._records.get(recordId);
  }

  list(conversationId: string): readonly SkillLifecycleRecord[] {
    return [...this._records.values()]
      .filter((record) => record.conversationId === conversationId && record.status === 'active')
      .sort(compareLifecycleRecords);
  }

  findRenewable(input: {
    readonly conversationId: string;
    readonly skillName: string;
    readonly slot: SkillLifecycleRecord['slot'];
    readonly lifetime: SkillLifecycleLifetime;
  }): SkillLifecycleRecord | undefined {
    return this.list(input.conversationId).find(
      (record) =>
        record.skillName === input.skillName &&
        record.slot === input.slot &&
        isSameLifecycleLifetime(record.lifetime, input.lifetime),
    );
  }

  remove(recordIds: readonly string[]): readonly SkillLifecycleRecord[] {
    const removed: SkillLifecycleRecord[] = [];
    for (const recordId of recordIds) {
      const record = this._records.get(recordId);
      if (!record) {
        continue;
      }
      this._records.delete(recordId);
      removed.push({ ...record, status: 'expired' });
    }
    return removed;
  }

  expire(input: SkillLifecycleExpireInput): SkillLifecycleDeactivationResult {
    const records = this.list(input.conversationId);
    const removed = records.filter((record) => shouldExpire(record, input));
    const removedRecordIds = removed.map((record) => record.id);
    this.remove(removedRecordIds);
    const diagnostics: SkillLifecycleDiagnostic[] =
      removed.length > 0
        ? removed.map((record) => ({
            code: 'expired-record',
            message: `Expired Skill lifecycle record "${record.skillName}"`,
            conversationId: record.conversationId,
            recordId: record.id,
            skillName: record.skillName,
            slot: record.slot,
            details: { reason: input.reason },
          }))
        : [];

    return {
      ok: true,
      removedRecordIds,
      diagnostics,
    };
  }

  private _nextId(input: SkillLifecycleCreateRecordInput): string {
    this._sequence += 1;
    return `skill:${input.conversationId}:${input.slot}:${input.skillName}:${this._sequence}`;
  }
}

export function compareLifecycleRecords(
  left: SkillLifecycleRecord,
  right: SkillLifecycleRecord,
): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function shouldExpire(record: SkillLifecycleRecord, input: SkillLifecycleExpireInput): boolean {
  switch (input.reason) {
    case 'turn-ended':
      return record.lifetime.kind === 'turn' && record.lifetime.turnId === input.turnId;
    case 'stage-exited':
      return (
        record.lifetime.kind === 'idc-stage' &&
        record.lifetime.runId === input.runId &&
        record.lifetime.stage === input.stage
      );
    case 'workflow-ended':
      return record.lifetime.kind === 'workflow' && record.lifetime.runId === input.runId;
    case 'inactive':
      return (
        record.lifetime.kind === 'inactivity' &&
        input.currentTurn !== undefined &&
        input.currentTurn - record.lastUsedTurn >= record.lifetime.maxIdleTurns
      );
  }
}

function isSameLifecycleLifetime(
  left: SkillLifecycleLifetime,
  right: SkillLifecycleLifetime,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case 'turn':
      return right.kind === 'turn' && left.turnId === right.turnId;
    case 'conversation':
      return right.kind === 'conversation';
    case 'idc-stage':
      return right.kind === 'idc-stage' && left.runId === right.runId && left.stage === right.stage;
    case 'workflow':
      return right.kind === 'workflow' && left.runId === right.runId;
    case 'inactivity':
      return right.kind === 'inactivity' && left.maxIdleTurns === right.maxIdleTurns;
  }
}
