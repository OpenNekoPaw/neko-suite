import * as path from 'node:path';
import {
  createCommandBackedSkill,
  type Skill,
  type SkillLoader,
  type SkillLoadResult,
} from '@neko/agent';

/**
 * Load workspace skill artifacts from sibling `.neko/skills` + `.neko/commands`
 * directories and project them onto the unified Skill runtime surface.
 */
export async function loadSkillArtifactsAsSkills(
  loader: Pick<SkillLoader, 'loadFromDirectory'>,
  skillsDir: string,
): Promise<Skill[]> {
  const commandsDir = path.join(path.dirname(skillsDir), 'commands');
  const [skillsResult, commandsResult] = await Promise.all([
    loader.loadFromDirectory(skillsDir),
    loader.loadFromDirectory(commandsDir),
  ]);

  return mergeSkillArtifacts(skillsResult, commandsResult);
}

function mergeSkillArtifacts(
  skillsResult: SkillLoadResult,
  commandsResult: SkillLoadResult,
): Skill[] {
  const merged = new Map<string, Skill>();

  for (const skill of skillsResult.skills) {
    merged.set(skill.name, skill);
  }

  for (const command of skillsResult.commands) {
    const skill = createCommandBackedSkill(command);
    merged.set(skill.name, skill);
  }

  for (const command of commandsResult.commands) {
    const skill = createCommandBackedSkill(command);
    merged.set(skill.name, skill);
  }

  return Array.from(merged.values());
}
