import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Skill, SkillLoader } from '@neko/agent';
import { getBuiltinSkills } from '@neko/skills';
import type { CLIConfig } from './types';
import { loadCodexSkillArtifactsAsSkills, loadSkillArtifactsAsSkills } from './skill-artifacts';

export type TuiSessionSkillLoader = Pick<SkillLoader, 'loadFromDirectory'>;
export type TuiSessionSkillLocale = 'en' | 'zh';

export async function loadTuiSessionSkills(input: {
  readonly skillLoader: TuiSessionSkillLoader;
  readonly config: CLIConfig;
  readonly locale: TuiSessionSkillLocale;
}): Promise<Skill[]> {
  const merged = new Map<string, Skill>();

  for (const skill of getBuiltinSkills({ locale: input.locale === 'zh' ? 'zh-CN' : 'en' })) {
    merged.set(skill.name, skill);
  }

  for (const skillsDir of resolveNekoTuiSkillDirectories(input.config)) {
    const loadedSkills = await loadSkillArtifactsAsSkills(input.skillLoader, skillsDir);
    for (const skill of loadedSkills) {
      merged.set(skill.name, skill);
    }
  }

  const codexSkillsDir = path.join(input.config.workDir, '.codex', 'skills');
  const codexSkills = await loadCodexSkillArtifactsAsSkills(fs, path, codexSkillsDir);
  for (const skill of codexSkills) {
    merged.set(skill.name, skill);
  }

  return Array.from(merged.values());
}

export function resolveNekoTuiSkillDirectories(config: CLIConfig): string[] {
  const dirs: string[] = [];

  if (config.skillsDir) {
    const configuredDir = path.resolve(config.workDir, config.skillsDir);
    if (!dirs.some((dir) => path.resolve(dir) === configuredDir)) {
      dirs.push(configuredDir);
    }
  }

  return dirs;
}
