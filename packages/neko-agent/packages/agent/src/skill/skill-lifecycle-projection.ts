import type {
  ActiveSkillLifecycleRecordProjection,
  SkillLifecycleDiagnostic,
  SkillLifecycleModelOverrideProjection,
  SkillLifecycleProjection,
  SkillLifecycleRecord,
  SkillLifecycleSlot,
  SkillLifecycleToolPolicyProjection,
} from '@neko/shared';

const SLOT_PRIORITY: Record<SkillLifecycleSlot, number> = {
  stagePersona: 10,
  domainSkill: 20,
  referenceSkill: 30,
  workflowSkill: 40,
  ephemeralSkill: 50,
};

const SLOT_MODEL_SOURCE: Record<
  SkillLifecycleSlot,
  SkillLifecycleModelOverrideProjection['source']
> = {
  stagePersona: 'stagePersona',
  domainSkill: 'domainSkill',
  referenceSkill: 'runtime',
  workflowSkill: 'workflowSkill',
  ephemeralSkill: 'runtime',
};

export interface SkillLifecycleProjectionInput {
  readonly conversationId: string;
  readonly records: readonly SkillLifecycleRecord[];
}

export function projectSkillLifecycle(
  input: SkillLifecycleProjectionInput,
): SkillLifecycleProjection {
  const records = [...input.records].filter(
    (record) => record.conversationId === input.conversationId && record.status === 'active',
  );
  const diagnostics = validateRecords(input.conversationId, records);
  const projectableRecords = records.filter(isProjectableRecord);
  const ordered = projectableRecords.sort(compareRecordForProjection);
  const toolPolicy = projectToolPolicy(input.conversationId, ordered);
  const modelOverride = projectModelOverride(input.conversationId, ordered);

  return {
    promptSections: ordered.map((record, index) => ({
      id: buildLifecyclePromptSectionId(record),
      layer: 'skill',
      content: record.injection.systemPrompt,
      priority: SLOT_PRIORITY[record.slot] + index,
      recordId: record.id,
      slot: record.slot,
      skillName: record.skillName,
    })),
    toolPolicy,
    ...(modelOverride.projection ? { modelOverride: modelOverride.projection } : {}),
    diagnostics: [...diagnostics, ...toolPolicy.diagnostics, ...modelOverride.diagnostics],
    visibleIndicators: ordered.map(projectVisibleIndicator),
  };
}

export function buildLifecyclePromptSectionId(record: SkillLifecycleRecord): string {
  return `skill:${record.slot}:${record.skillName}:${record.id}`;
}

export function hasBlockingLifecycleProjectionDiagnostic(
  projection: SkillLifecycleProjection,
): boolean {
  return projection.diagnostics.some((diagnostic) =>
    [
      'unknown-slot',
      'missing-skill-injection',
      'missing-skill-content',
      'tool-policy-conflict',
      'model-override-conflict',
    ].includes(diagnostic.code),
  );
}

function validateRecords(
  conversationId: string,
  records: readonly SkillLifecycleRecord[],
): SkillLifecycleDiagnostic[] {
  const diagnostics: SkillLifecycleDiagnostic[] = [];
  for (const record of records) {
    if (!isKnownSlot(record.slot)) {
      diagnostics.push({
        code: 'unknown-slot',
        message: `Unknown Skill lifecycle slot: ${String(record.slot)}`,
        conversationId,
        recordId: record.id,
        skillName: record.skillName,
      });
    }
    if (!record.injection) {
      diagnostics.push({
        code: 'missing-skill-injection',
        message: `Skill lifecycle record "${record.id}" has no injection`,
        conversationId,
        recordId: record.id,
        skillName: record.skillName,
        slot: record.slot,
      });
      continue;
    }
    if (!record.injection.systemPrompt) {
      diagnostics.push({
        code: 'missing-skill-content',
        message: `Skill lifecycle record "${record.id}" has no prompt content`,
        conversationId,
        recordId: record.id,
        skillName: record.skillName,
        slot: record.slot,
      });
    }
  }
  return diagnostics;
}

function isProjectableRecord(record: SkillLifecycleRecord): boolean {
  return isKnownSlot(record.slot) && Boolean(record.injection?.systemPrompt);
}

function isKnownSlot(slot: string): slot is SkillLifecycleSlot {
  return slot in SLOT_PRIORITY;
}

function projectToolPolicy(
  conversationId: string,
  records: readonly SkillLifecycleRecord[],
): SkillLifecycleToolPolicyProjection {
  const restrictedRecords = records.filter(
    (record) => (record.injection.allowedTools?.length ?? 0) > 0,
  );
  if (restrictedRecords.length === 0) {
    return {
      mode: 'unrestricted',
      contributingRecordIds: records.map((record) => record.id),
      diagnostics: [],
    };
  }

  let allowed = new Set(restrictedRecords[0]?.injection.allowedTools ?? []);
  for (const record of restrictedRecords.slice(1)) {
    const next = new Set(record.injection.allowedTools ?? []);
    allowed = new Set([...allowed].filter((tool) => next.has(tool)));
  }

  if (allowed.size === 0 && restrictedRecords.length > 1) {
    return {
      mode: 'conflict',
      contributingRecordIds: restrictedRecords.map((record) => record.id),
      diagnostics: [
        {
          code: 'tool-policy-conflict',
          message: 'Active Skill lifecycle records have incompatible tool policies',
          conversationId,
          details: {
            recordIds: restrictedRecords.map((record) => record.id),
          },
        },
      ],
    };
  }

  return {
    mode: restrictedRecords.length === 1 ? 'allowlist' : 'intersection',
    allowedTools: [...allowed].sort(),
    contributingRecordIds: restrictedRecords.map((record) => record.id),
    diagnostics: [],
  };
}

function projectModelOverride(
  conversationId: string,
  records: readonly SkillLifecycleRecord[],
): {
  readonly projection?: SkillLifecycleModelOverrideProjection;
  readonly diagnostics: readonly SkillLifecycleDiagnostic[];
} {
  const recordsWithModel = records.filter((record) => record.injection.model);
  if (recordsWithModel.length === 0) {
    return { diagnostics: [] };
  }

  const first = recordsWithModel[0];
  if (!first?.injection.model) {
    return { diagnostics: [] };
  }

  const conflicting = recordsWithModel.filter(
    (record) => record.injection.model !== first.injection.model,
  );
  if (conflicting.length > 0) {
    return {
      diagnostics: [
        {
          code: 'model-override-conflict',
          message: 'Active Skill lifecycle records request incompatible model overrides',
          conversationId,
          recordId: first.id,
          skillName: first.skillName,
          slot: first.slot,
          details: {
            recordIds: recordsWithModel.map((record) => record.id),
            models: recordsWithModel.map((record) => record.injection.model),
          },
        },
      ],
    };
  }

  return {
    projection: {
      model: first.injection.model,
      source: SLOT_MODEL_SOURCE[first.slot],
      recordId: first.id,
      skillName: first.skillName,
    },
    diagnostics: [],
  };
}

function projectVisibleIndicator(
  record: SkillLifecycleRecord,
): ActiveSkillLifecycleRecordProjection {
  return {
    id: record.id,
    skillName: record.skillName,
    slot: record.slot,
    owner: record.owner,
    clearable: record.deactivation.clearableByUser,
    ...(record.provenance ? { provenance: record.provenance } : {}),
    ...(record.deactivation.lockedReason ? { lockedReason: record.deactivation.lockedReason } : {}),
    ...(projectExpiry(record) ? { expires: projectExpiry(record) } : {}),
    status: record.status,
  };
}

function projectExpiry(record: SkillLifecycleRecord): string | undefined {
  switch (record.lifetime.kind) {
    case 'turn':
      return `turn:${record.lifetime.turnId}`;
    case 'idc-stage':
      return `idc-stage:${record.lifetime.runId}:${record.lifetime.stage}`;
    case 'workflow':
      return `workflow:${record.lifetime.runId}`;
    case 'inactivity':
      return `inactive:${record.lifetime.maxIdleTurns}`;
    case 'conversation':
      return undefined;
  }
}

function compareRecordForProjection(
  left: SkillLifecycleRecord,
  right: SkillLifecycleRecord,
): number {
  return (
    SLOT_PRIORITY[left.slot] - SLOT_PRIORITY[right.slot] ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}
