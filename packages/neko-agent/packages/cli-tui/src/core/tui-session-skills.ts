import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import {
  createCommandBackedSkill,
  createSkillFileRuntime,
  type Skill,
  type SkillFileRuntime,
  type SkillFileScanGroup,
  type SkillFileScanResult,
  type SkillLoader,
} from '@neko/agent';
import { getBuiltinSkills } from '@neko/skills';
import type { CLIConfig } from './types';

export type TuiSessionSkillLoader = Pick<
  SkillLoader,
  'loadFromDirectory' | 'loadLazyFromDirectory'
>;
export type TuiSessionSkillLocale = 'en' | 'zh';

export async function loadTuiSessionSkills(input: {
  readonly skillLoader: TuiSessionSkillLoader;
  readonly config: CLIConfig;
  readonly locale: TuiSessionSkillLocale;
  readonly homeDir?: string;
  readonly skillFileRuntime?: Pick<SkillFileRuntime, 'scanSkills'>;
}): Promise<Skill[]> {
  const merged = new Map<string, Skill>();

  for (const skill of getBuiltinSkills({ locale: input.locale === 'zh' ? 'zh-CN' : 'en' })) {
    merged.set(skill.name, skill);
  }

  const runtime =
    input.skillFileRuntime ??
    createTuiSessionSkillFileRuntime({
      skillLoader: input.skillLoader,
      config: input.config,
      homeDir: input.homeDir,
    });
  appendTuiSessionSkillScanResult(merged, await runtime.scanSkills());

  return Array.from(merged.values());
}

export function createTuiSessionSkillFileRuntime(input: {
  readonly skillLoader: TuiSessionSkillLoader;
  readonly config: CLIConfig;
  readonly homeDir?: string;
}): SkillFileRuntime {
  return createSkillFileRuntime({
    fs,
    path,
    loader: input.skillLoader,
    homeDir: input.homeDir ?? os.homedir(),
    getWorkspaceRoot: () => input.config.workDir,
  });
}

function appendTuiSessionSkillScanResult(
  merged: Map<string, Skill>,
  result: SkillFileScanResult,
): void {
  appendTuiSessionSkillScanGroup(merged, result.personal);
  appendTuiSessionSkillScanGroup(merged, result.project);
}

function appendTuiSessionSkillScanGroup(
  merged: Map<string, Skill>,
  group: SkillFileScanGroup,
): void {
  for (const skill of group.skills) {
    merged.set(skill.name, skill);
  }

  for (const command of group.commands) {
    const skill = createCommandBackedSkill(command);
    merged.set(skill.name, skill);
  }
}
