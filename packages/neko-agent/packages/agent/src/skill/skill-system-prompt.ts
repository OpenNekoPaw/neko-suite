import type { Skill } from '@neko/shared';

export interface SkillPromptEntry {
  readonly name: string;
  readonly description?: string;
  readonly enabled?: boolean;
}

export interface BuildSkillAwareSystemPromptInput {
  readonly basePrompt: string;
  readonly skills: readonly SkillPromptEntry[];
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

  const lines = ['\n\n# Available Skills\n'];
  lines.push(
    'Skills are specialized instruction sets that get automatically activated when your request matches them. The following skills are registered:\n',
  );
  for (const skill of skills) {
    const description = skill.description?.split('\n')[0] ?? '';
    lines.push(`- **${skill.name}**: ${description}`);
  }
  lines.push(
    "\nUse `ActivateSkill` to activate a skill when the user's request matches a skill domain.",
    'Do not activate creative production skills for content analysis alone; use read/analysis tools directly unless the user explicitly asks for a storyboard, animation, video, Canvas/Cut handoff, export, or another production artifact.',
    'Use `GetContext` to see all registered skills and current state.',
  );

  return input.basePrompt + lines.join('\n');
}

export function toSkillPromptEntries(skills: readonly Skill[]): SkillPromptEntry[] {
  return skills.map((skill) => ({
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    ...(skill.enabled !== undefined ? { enabled: skill.enabled } : {}),
  }));
}
