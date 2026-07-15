import type { Skill } from '@neko/shared';

export interface SkillPromptEntry {
  readonly name: string;
  readonly description?: string;
  readonly enabled?: boolean;
}

export type SkillPromptLocale = 'en' | 'zh';

export interface BuildSkillAwareSystemPromptInput {
  readonly basePrompt: string;
  readonly skills: readonly SkillPromptEntry[];
  readonly locale?: string;
}

export function getEnabledSkillPromptEntries(
  skills: readonly SkillPromptEntry[],
): SkillPromptEntry[] {
  return skills.filter((skill) => skill.enabled !== false);
}

export function buildSkillAwareSystemPrompt(input: BuildSkillAwareSystemPromptInput): string {
  const skills = getEnabledSkillPromptEntries(input.skills);
  if (skills.length === 0) {
    return input.basePrompt;
  }
  const locale = resolveSkillPromptLocale(input.locale, input.basePrompt, skills);

  const lines = [locale === 'zh' ? '\n\n# 可用技能\n' : '\n\n# Available Skills\n'];
  lines.push(locale === 'zh' ? ZH_SKILL_PROMPT_INTRO : EN_SKILL_PROMPT_INTRO);
  for (const skill of skills) {
    const description = formatSkillPromptDescription(skill, locale);
    lines.push(`- **${skill.name}**: ${description}`);
  }
  lines.push(...(locale === 'zh' ? ZH_SKILL_PROMPT_RULES : EN_SKILL_PROMPT_RULES));

  return input.basePrompt + lines.join('\n');
}

export function toSkillPromptEntries(skills: readonly Skill[]): SkillPromptEntry[] {
  return skills.map((skill) => ({
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    ...(skill.enabled !== undefined ? { enabled: skill.enabled } : {}),
  }));
}

export function normalizeSkillPromptLocale(locale?: string): SkillPromptLocale {
  const normalized = locale?.trim().toLowerCase().replace('_', '-');
  return normalized?.startsWith('zh') ? 'zh' : 'en';
}

function resolveSkillPromptLocale(
  locale: string | undefined,
  basePrompt: string,
  skills: readonly SkillPromptEntry[],
): SkillPromptLocale {
  if (locale) {
    return normalizeSkillPromptLocale(locale);
  }
  if (containsCjk(basePrompt) || skills.some((skill) => containsCjk(skill.description ?? ''))) {
    return 'zh';
  }
  return 'en';
}

function formatSkillPromptDescription(skill: SkillPromptEntry, locale: SkillPromptLocale): string {
  const firstLine = skill.description?.split('\n')[0]?.trim() ?? '';
  if (locale === 'en') {
    return firstLine;
  }
  return containsCjk(firstLine) ? firstLine : ZH_SKILL_DESCRIPTION_DEFAULT;
}

function containsCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

const EN_SKILL_PROMPT_INTRO =
  'Skills are specialized instruction sets that can be activated explicitly by the user or by calling `ActivateSkill`. The following skills are registered:\n';

const ZH_SKILL_PROMPT_INTRO =
  '技能是可由用户显式请求或由 Agent 调用 `ActivateSkill` 激活的专项指导。当前已注册技能如下：\n';

const EN_SKILL_PROMPT_RULES = [
  '\nDo not activate skills by keyword matching, catalog hints, or skill descriptions alone.',
  'Use ordinary Agent capabilities first: understand the user request, inspect available conversation context, and gather the evidence required by the current request before deciding whether a skill is needed.',
  'When a non-command request truly needs a domain skill, briefly state the activation reason to the user. Use `ActivateSkill` with the same reason only after that decision.',
  'Activate a domain skill only when its registered description and current capability context match the requested outcome; use directly available capabilities when no specialized method is needed.',
  'Use `GetContext` to see all registered skills and current state.',
];

const ZH_SKILL_PROMPT_RULES = [
  '\n不要通过关键词匹配、目录提示或技能描述本身激活技能。',
  '先使用普通 Agent 能力理解用户请求、检查对话上下文，并收集当前请求所需的证据，再判断是否需要技能。',
  '非命令请求确实需要领域技能时，先向用户简要说明激活原因，再用同一个原因调用 `ActivateSkill`。',
  '仅当已注册技能描述和当前能力上下文符合目标产物时激活领域技能；不需要专项方法时直接使用当前可用能力。',
  '使用 `GetContext` 查看已注册技能和当前状态。',
];

const ZH_SKILL_DESCRIPTION_DEFAULT = '领域能力说明以技能正文为准；仅在 Agent 判断需要后激活。';
