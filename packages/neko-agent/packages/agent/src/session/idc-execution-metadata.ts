import type { Skill } from '@neko/shared';
import { createSkillRunKind } from './idc-run-kind';

export function createPlanModeIdcMetadata(): Record<string, unknown> {
  const runKind = 'plan-mode';
  return {
    idc: {
      entrySignal: 'vague-creative',
      taskShape: 'multi-step',
      runKind,
      workflowId: runKind,
    },
  };
}

export function createSkillExecutionIdcMetadata(
  skill: Skill | undefined,
): Record<string, unknown> | undefined {
  if (!skill) {
    return undefined;
  }

  const legacyPipelines = Reflect.get(skill as object, 'pipelines');
  const hasWorkflowTemplate =
    (skill.phases?.length ?? 0) > 0 ||
    (typeof legacyPipelines === 'object' && legacyPipelines !== null);

  if (!hasWorkflowTemplate) {
    return undefined;
  }

  const runKind = createSkillRunKind(skill.name);
  return {
    idc: {
      entrySignal: 'workflow-template',
      taskShape: 'multi-step',
      runKind,
      workflowId: runKind,
    },
  };
}

export function mergeIdcExecutionMetadata(
  base?: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !overrides) return undefined;

  const merged: Record<string, unknown> = {
    ...(base ?? {}),
    ...(overrides ?? {}),
  };

  const baseIdc = asRecord(base?.['idc']);
  const overrideIdc = asRecord(overrides?.['idc']);
  if (baseIdc || overrideIdc) {
    merged['idc'] = {
      ...(baseIdc ?? {}),
      ...(overrideIdc ?? {}),
    };
  }

  return merged;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
