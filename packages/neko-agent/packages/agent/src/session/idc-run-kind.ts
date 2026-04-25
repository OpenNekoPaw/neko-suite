/**
 * IDC run kind helpers.
 *
 * Run kinds cross the session/runtime boundary and may be persisted or split
 * by downstream consumers. Skill names therefore need an escaped
 * representation that is stable and delimiter-safe.
 */

const EMPTY_SKILL_RUN_KIND_SEGMENT = 'unnamed';

export function encodeRunKindSegment(value: string): string {
  const trimmed = value.trim();
  return encodeURIComponent(trimmed.length > 0 ? trimmed : EMPTY_SKILL_RUN_KIND_SEGMENT);
}

export function createSkillRunKind(skillName: string): string {
  return `skill:${encodeRunKindSegment(skillName)}`;
}
