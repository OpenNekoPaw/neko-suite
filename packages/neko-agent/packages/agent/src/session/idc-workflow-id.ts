/**
 * IDC workflow id helpers.
 *
 * Workflow ids travel across the session/runtime boundary and may be
 * persisted or split by downstream consumers. Skill names therefore
 * need an escaped representation that is stable and delimiter-safe.
 */

const EMPTY_SKILL_WORKFLOW_SEGMENT = 'unnamed';

export function encodeWorkflowIdSegment(value: string): string {
  const trimmed = value.trim();
  return encodeURIComponent(trimmed.length > 0 ? trimmed : EMPTY_SKILL_WORKFLOW_SEGMENT);
}

export function createSkillWorkflowId(skillName: string): string {
  return `skill:${encodeWorkflowIdSegment(skillName)}`;
}
