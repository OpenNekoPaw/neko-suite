import type { Skill } from '@neko/shared';

export type BuiltinSkillLocale = 'en' | 'zh-cn';

export interface LocalizedBuiltinSkillContent {
  readonly default: string;
  readonly localized?: Partial<Record<BuiltinSkillLocale, string>>;
}

export interface BuiltinSkillOptions {
  readonly locale?: string;
}

export function normalizeBuiltinSkillLocale(locale?: string): BuiltinSkillLocale {
  const normalized = locale?.trim().toLowerCase().replace('_', '-');

  if (normalized?.startsWith('zh')) {
    return 'zh-cn';
  }

  return 'en';
}

export function selectBuiltinSkillContent(
  content: LocalizedBuiltinSkillContent,
  locale?: string,
): string {
  const normalizedLocale = normalizeBuiltinSkillLocale(locale);
  return content.localized?.[normalizedLocale] ?? content.default;
}

export function localizeBuiltinSkill(
  skill: Skill,
  content: LocalizedBuiltinSkillContent,
  locale?: string,
): Skill {
  const selectedContent = selectBuiltinSkillContent(content, locale);

  if (selectedContent === skill.content) {
    return skill;
  }

  return {
    ...skill,
    content: selectedContent,
    portableDefinition: skill.portableDefinition ?? {
      name: skill.name,
      description: skill.description,
      body: skill.content,
      ...(skill.allowedTools === undefined ? {} : { allowedTools: [...skill.allowedTools] }),
    },
  };
}
