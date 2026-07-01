import type {
  Skill,
  SkillInjection,
  SkillLifecycleActivationRequest,
  SkillLifecycleActivationResult,
  SkillLifecycleDeactivationPolicy,
  SkillLifecycleDeactivationRequest,
  SkillLifecycleDeactivationResult,
  SkillLifecycleDiagnostic,
  SkillLifecycleLifetime,
  SkillLifecycleOwner,
  SkillLifecycleProjection,
  SkillLifecycleRecord,
  SkillLifecycleSkillSummary,
  SkillLifecycleSlot,
  SkillConflictConfig,
} from '@neko/shared';
import { normalizeAgentInputTriggerName } from '@neko-agent/types';
import type { SkillService } from './skill-service';
import { SkillLifecycleStore, type SkillLifecycleExpireInput } from './skill-lifecycle-store';
import { projectSkillLifecycle } from './skill-lifecycle-projection';
import { resolveSkillLifecycleActivationConflict } from './skill-conflict-resolver';

export interface SkillLifecycleRuntimeOptions {
  readonly skillService: SkillService;
  readonly store?: SkillLifecycleStore;
  readonly now?: () => number;
  readonly getConflictConfig?: (skillName: string) => SkillConflictConfig | undefined;
}

export interface SkillLifecyclePreparedActivationInput extends Omit<
  SkillLifecycleActivationRequest,
  'skillName'
> {
  readonly skill: Skill;
  readonly injection: SkillInjection;
  readonly deactivation?: SkillLifecycleDeactivationPolicy;
}

export class SkillLifecycleRuntime {
  private readonly _skillService: SkillService;
  private readonly _store: SkillLifecycleStore;
  private readonly _now: () => number;
  private readonly _getConflictConfig?: (skillName: string) => SkillConflictConfig | undefined;

  constructor(options: SkillLifecycleRuntimeOptions) {
    this._skillService = options.skillService;
    this._store = options.store ?? new SkillLifecycleStore();
    this._now = options.now ?? Date.now;
    this._getConflictConfig = options.getConflictConfig;
  }

  get store(): SkillLifecycleStore {
    return this._store;
  }

  list(conversationId: string): readonly SkillLifecycleRecord[] {
    return this._store.list(conversationId);
  }

  getActiveDomainRecord(conversationId: string): SkillLifecycleRecord | undefined {
    return this._store.list(conversationId).find((record) => record.slot === 'domainSkill');
  }

  async activate(
    request: SkillLifecycleActivationRequest,
  ): Promise<SkillLifecycleActivationResult> {
    const skillName = normalizeAgentInputTriggerName(request.skillName);
    const skill = await this._loadSkill(request.conversationId, skillName, request.slot);
    if (!skill.ok) {
      return { ok: false, diagnostics: skill.diagnostics };
    }

    try {
      const injection =
        request.args === undefined
          ? await this._skillService.apply(skill.skill)
          : await this._skillService.apply(skill.skill, request.args);
      return this.activatePrepared({
        ...request,
        skill: skill.skill,
        injection,
      });
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          activationDiagnostic({
            conversationId: request.conversationId,
            skillName,
            slot: request.slot,
            message: error instanceof Error ? error.message : String(error),
          }),
        ],
      };
    }
  }

  activatePrepared(input: SkillLifecyclePreparedActivationInput): SkillLifecycleActivationResult {
    const now = input.now ?? this._now();
    const turnCount = input.turnCount ?? 0;
    const existing = this._store.findRenewable({
      conversationId: input.conversationId,
      skillName: input.skill.name,
      slot: input.slot,
      lifetime: input.lifetime,
    });
    if (existing) {
      const renewed = this._store.renew({
        recordId: existing.id,
        injection: input.injection,
        skillSummary: projectSkillSummary(input.skill),
        lifetime: input.lifetime,
        turnCount,
      });
      return { ok: true, record: renewed, diagnostics: [] };
    }

    const conflict = this._resolveActivationConflict(input);
    if (!conflict.ok) {
      return {
        ok: false,
        diagnostics: conflict.diagnostics,
      };
    }

    if (conflict.replacedRecordIds.length > 0) {
      this._store.remove(conflict.replacedRecordIds);
    }

    const record = this._store.create({
      conversationId: input.conversationId,
      skillName: input.skill.name,
      slot: input.slot,
      owner: input.owner,
      lifetime: input.lifetime,
      injection: input.injection,
      skillSummary: projectSkillSummary(input.skill),
      deactivation: input.deactivation ?? defaultDeactivationPolicy(input.slot, input.owner),
      createdAt: now,
      lastUsedTurn: turnCount,
      source: input.source,
      ...(input.provenance ? { provenance: input.provenance } : {}),
    });

    return {
      ok: true,
      record,
      replacedRecordIds: conflict.replacedRecordIds,
      diagnostics: conflict.diagnostics,
    };
  }

  deactivate(request: SkillLifecycleDeactivationRequest): SkillLifecycleDeactivationResult {
    const target = this._resolveDeactivationTarget(request);
    if (!target.ok) {
      return {
        ok: false,
        removedRecordIds: [],
        diagnostics: target.diagnostics,
      };
    }

    const blocked = target.records.filter((record) => !canDeactivate(record, request.actor));
    if (blocked.length > 0) {
      return {
        ok: false,
        removedRecordIds: [],
        diagnostics: blocked.map((record) => ({
          code: 'locked-deactivation',
          message:
            record.deactivation.lockedReason ??
            `Skill lifecycle record "${record.skillName}" is locked`,
          conversationId: record.conversationId,
          recordId: record.id,
          skillName: record.skillName,
          slot: record.slot,
        })),
      };
    }

    const removedRecordIds = target.records.map((record) => record.id);
    this._store.remove(removedRecordIds);
    return {
      ok: true,
      removedRecordIds,
      diagnostics: [],
    };
  }

  expire(input: SkillLifecycleExpireInput): SkillLifecycleDeactivationResult {
    return this._store.expire(input);
  }

  project(conversationId: string): SkillLifecycleProjection {
    return projectSkillLifecycle({
      conversationId,
      records: this._store.list(conversationId),
    });
  }

  private async _loadSkill(
    conversationId: string,
    skillName: string,
    slot: SkillLifecycleSlot,
  ): Promise<
    | { readonly ok: true; readonly skill: Skill }
    | { readonly ok: false; readonly diagnostics: readonly SkillLifecycleDiagnostic[] }
  > {
    const registered = this._skillService.registry.getSkill(skillName);
    if (!registered) {
      return {
        ok: false,
        diagnostics: [
          activationDiagnostic({
            conversationId,
            skillName,
            slot,
            message: `Skill "${skillName}" not found`,
          }),
        ],
      };
    }
    if (registered.enabled === false) {
      return {
        ok: false,
        diagnostics: [
          activationDiagnostic({
            conversationId,
            skillName,
            slot,
            message: `Skill "${skillName}" is disabled`,
          }),
        ],
      };
    }

    const loaded = await this._skillService.registry.ensureLoaded(skillName);
    if (!loaded) {
      return {
        ok: false,
        diagnostics: [
          activationDiagnostic({
            conversationId,
            skillName,
            slot,
            message: `Skill "${skillName}" could not be loaded`,
          }),
        ],
      };
    }
    if (loaded.enabled === false) {
      return {
        ok: false,
        diagnostics: [
          activationDiagnostic({
            conversationId,
            skillName,
            slot,
            message: `Skill "${skillName}" is disabled`,
          }),
        ],
      };
    }
    if (!loaded.content) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'missing-skill-content',
            message: `Skill "${skillName}" has no content`,
            conversationId,
            skillName,
            slot,
          },
        ],
      };
    }

    return { ok: true, skill: loaded };
  }

  private _resolveActivationConflict(input: SkillLifecyclePreparedActivationInput): {
    readonly ok: boolean;
    readonly replacedRecordIds: readonly string[];
    readonly diagnostics: readonly SkillLifecycleDiagnostic[];
  } {
    return resolveSkillLifecycleActivationConflict({
      conversationId: input.conversationId,
      requestedSkill: input.skill,
      requestedInjection: input.injection,
      requestedSlot: input.slot,
      activeRecords: this._store.list(input.conversationId),
      ...(this._getConflictConfig ? { getConflictConfig: this._getConflictConfig } : {}),
    });
  }

  private _resolveDeactivationTarget(
    request: SkillLifecycleDeactivationRequest,
  ):
    | { readonly ok: true; readonly records: readonly SkillLifecycleRecord[] }
    | { readonly ok: false; readonly diagnostics: readonly SkillLifecycleDiagnostic[] } {
    const active = this._store.list(request.conversationId);
    if (request.recordId) {
      const record = active.find((candidate) => candidate.id === request.recordId);
      if (!record) {
        return {
          ok: false,
          diagnostics: [
            {
              code: 'unknown-record',
              message: `Unknown Skill lifecycle record: ${request.recordId}`,
              conversationId: request.conversationId,
              recordId: request.recordId,
            },
          ],
        };
      }
      return { ok: true, records: [record] };
    }

    let candidates = active;
    if (request.slot) {
      candidates = candidates.filter((record) => record.slot === request.slot);
    }
    if (request.skillName) {
      const skillName = normalizeAgentInputTriggerName(request.skillName);
      candidates = candidates.filter((record) => record.skillName === skillName);
    }

    if (candidates.length === 0) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'no-active-record',
            message: 'No matching active Skill lifecycle record',
            conversationId: request.conversationId,
            skillName: request.skillName,
            slot: request.slot,
          },
        ],
      };
    }

    if (request.skillName && !request.slot && candidates.length > 1) {
      return {
        ok: false,
        diagnostics: [
          {
            code: 'ambiguous-deactivation',
            message: `Skill name "${request.skillName}" matches multiple active lifecycle records`,
            conversationId: request.conversationId,
            skillName: request.skillName,
            details: { recordIds: candidates.map((record) => record.id) },
          },
        ],
      };
    }

    return { ok: true, records: candidates };
  }
}

export function defaultSkillLifecycleRequest(input: {
  readonly conversationId: string;
  readonly skillName: string;
  readonly owner: SkillLifecycleOwner;
  readonly source: SkillLifecycleActivationRequest['source'];
  readonly args?: string;
  readonly now?: number;
  readonly turnCount?: number;
}): SkillLifecycleActivationRequest {
  return {
    conversationId: input.conversationId,
    skillName: input.skillName,
    slot: 'domainSkill',
    owner: input.owner,
    lifetime: { kind: 'conversation', untilCleared: true },
    source: input.source,
    ...(input.args !== undefined ? { args: input.args } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
    ...(input.turnCount !== undefined ? { turnCount: input.turnCount } : {}),
  };
}

export function projectSkillSummary(skill: Skill): SkillLifecycleSkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.domain ? { domain: skill.domain } : {}),
    ...(skill.referencedSkills && skill.referencedSkills.length > 0
      ? { relatedSkills: skill.referencedSkills }
      : {}),
    ...(skill.mediaWorkflow ? { mediaWorkflow: skill.mediaWorkflow } : {}),
  };
}

export function defaultDeactivationPolicy(
  slot: SkillLifecycleSlot,
  owner: SkillLifecycleOwner,
): SkillLifecycleDeactivationPolicy {
  if (slot === 'stagePersona' && owner === 'idc') {
    return {
      clearableByUser: false,
      clearableByAgent: false,
      clearableByRuntime: true,
      lockedReason: 'IDC stage persona is cleared when its owning stage exits',
    };
  }

  if (slot === 'ephemeralSkill') {
    return {
      clearableByUser: false,
      clearableByAgent: false,
      clearableByRuntime: true,
    };
  }

  return {
    clearableByUser: owner === 'user' || owner === 'agent',
    clearableByAgent: owner === 'agent' || owner === 'user',
    clearableByRuntime: true,
  };
}

function activationDiagnostic(input: {
  readonly conversationId: string;
  readonly skillName: string;
  readonly slot: SkillLifecycleSlot;
  readonly message: string;
}): SkillLifecycleDiagnostic {
  return {
    code: 'skill-activation-rejected',
    message: input.message,
    conversationId: input.conversationId,
    skillName: input.skillName,
    slot: input.slot,
  };
}

function canDeactivate(
  record: SkillLifecycleRecord,
  actor: SkillLifecycleDeactivationRequest['actor'],
): boolean {
  switch (actor) {
    case 'user':
      return record.deactivation.clearableByUser;
    case 'agent':
      return record.deactivation.clearableByAgent;
    case 'runtime':
      return record.deactivation.clearableByRuntime;
  }
}
