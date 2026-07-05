import type { Skill } from '@neko/shared';
import type { BuiltinSkillLocale } from './builtin-skill-content';

export type BuiltinSkillLocaleParityDiagnosticCode =
  | 'missing-default-skill'
  | 'missing-localized-skill'
  | 'empty-default-content'
  | 'empty-localized-content'
  | 'heading-structure-mismatch'
  | 'stable-token-mismatch';

export interface BuiltinSkillLocaleParityDiagnostic {
  readonly skillName: string;
  readonly locale: BuiltinSkillLocale;
  readonly code: BuiltinSkillLocaleParityDiagnosticCode;
  readonly message: string;
  readonly defaultSignature?: readonly string[];
  readonly localizedSignature?: readonly string[];
  readonly missingTokens?: readonly string[];
  readonly extraTokens?: readonly string[];
}

export interface BuiltinSkillLocaleParityInput {
  readonly defaultSkills: readonly Pick<Skill, 'name' | 'content'>[];
  readonly localizedSkills: readonly Pick<Skill, 'name' | 'content'>[];
  readonly locale: BuiltinSkillLocale;
  readonly skillNames: readonly string[];
}

export function validateBuiltinSkillLocaleParity(
  input: BuiltinSkillLocaleParityInput,
): BuiltinSkillLocaleParityDiagnostic[] {
  const diagnostics: BuiltinSkillLocaleParityDiagnostic[] = [];
  const defaultSkillsByName = indexSkillsByName(input.defaultSkills);
  const localizedSkillsByName = indexSkillsByName(input.localizedSkills);

  for (const skillName of input.skillNames) {
    const defaultSkill = defaultSkillsByName.get(skillName);
    const localizedSkill = localizedSkillsByName.get(skillName);

    if (!defaultSkill) {
      diagnostics.push({
        skillName,
        locale: input.locale,
        code: 'missing-default-skill',
        message: `Default builtin skill is missing: ${skillName}`,
      });
      continue;
    }

    if (!localizedSkill) {
      diagnostics.push({
        skillName,
        locale: input.locale,
        code: 'missing-localized-skill',
        message: `Localized builtin skill is missing for ${input.locale}: ${skillName}`,
      });
      continue;
    }

    if (defaultSkill.content.trim().length === 0) {
      diagnostics.push({
        skillName,
        locale: input.locale,
        code: 'empty-default-content',
        message: `Default builtin skill content is empty: ${skillName}`,
      });
      continue;
    }

    if (localizedSkill.content.trim().length === 0) {
      diagnostics.push({
        skillName,
        locale: input.locale,
        code: 'empty-localized-content',
        message: `Localized builtin skill content is empty for ${input.locale}: ${skillName}`,
      });
      continue;
    }

    const defaultSignature = extractHeadingSignature(defaultSkill.content);
    const localizedSignature = extractHeadingSignature(localizedSkill.content);
    if (!sameOrderedValues(defaultSignature, localizedSignature)) {
      diagnostics.push({
        skillName,
        locale: input.locale,
        code: 'heading-structure-mismatch',
        message: `Localized builtin skill heading structure drifted for ${input.locale}: ${skillName}`,
        defaultSignature,
        localizedSignature,
      });
    }

    const defaultTokens = extractStablePromptTokens(defaultSkill.content);
    const localizedTokens = extractStablePromptTokens(localizedSkill.content);
    const missingTokens = defaultTokens.filter((token) => !localizedTokens.includes(token));
    const extraTokens = localizedTokens.filter((token) => !defaultTokens.includes(token));
    if (missingTokens.length > 0 || extraTokens.length > 0) {
      diagnostics.push({
        skillName,
        locale: input.locale,
        code: 'stable-token-mismatch',
        message: `Localized builtin skill stable prompt tokens drifted for ${input.locale}: ${skillName}`,
        missingTokens,
        extraTokens,
      });
    }
  }

  return diagnostics;
}

function indexSkillsByName(
  skills: readonly Pick<Skill, 'name' | 'content'>[],
): Map<string, Pick<Skill, 'name' | 'content'>> {
  const indexed = new Map<string, Pick<Skill, 'name' | 'content'>>();
  for (const skill of skills) {
    indexed.set(skill.name, skill);
  }
  return indexed;
}

function extractHeadingSignature(content: string): string[] {
  const headings = content.matchAll(/^(#{1,6})\s+\S.*$/gm);
  return Array.from(headings, (match) => `h${match[1]?.length ?? 0}`);
}

function extractStablePromptTokens(content: string): string[] {
  const tokens: string[] = [];
  for (const match of content.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1]?.trim();
    if (token && isStablePromptToken(token) && !tokens.includes(token)) {
      tokens.push(token);
    }
  }
  return tokens;
}

function isStablePromptToken(token: string): boolean {
  return /^\S+$/.test(token) && /[A-Za-z0-9]/.test(token);
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
