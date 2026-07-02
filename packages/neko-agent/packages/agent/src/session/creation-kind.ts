/**
 * Default creation kind helpers.
 *
 * Creation kinds cross the session/runtime boundary and may be persisted or split
 * by downstream consumers. Skill names therefore need an escaped
 * representation that is stable and delimiter-safe.
 */

const EMPTY_SKILL_CREATION_KIND_SEGMENT = 'unnamed';

export function encodeCreationKindSegment(value: string): string {
  const trimmed = value.trim();
  return encodeURIComponent(trimmed.length > 0 ? trimmed : EMPTY_SKILL_CREATION_KIND_SEGMENT);
}

export function createSkillCreationKind(skillName: string): string {
  return `skill:${encodeCreationKindSegment(skillName)}`;
}
