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
import type { CreateSkillInput, CreateSkillResult } from '@neko/shared';
import type { CLIConfig } from './types';

export type TuiSessionSkillLoader = Pick<
  SkillLoader,
  'loadFromDirectory' | 'loadLazyFromDirectory'
>;
export type TuiSessionSkillLocale = 'en' | 'zh';

export type TuiSessionSkillFileRuntime = Pick<
  SkillFileRuntime,
  'scanSkills' | 'getSkills' | 'createSkill'
>;

export interface TuiSessionSkillCreation {
  readonly created: CreateSkillResult;
  readonly skills: readonly Skill[];
}

export interface TuiSessionSkillRuntime {
  scanSkills(): Promise<readonly Skill[]>;
  createSkill(input: CreateSkillInput): Promise<TuiSessionSkillCreation>;
}

export async function loadTuiSessionSkills(input: {
  readonly skillLoader: TuiSessionSkillLoader;
  readonly config: CLIConfig;
  readonly locale: TuiSessionSkillLocale;
  readonly homeDir?: string;
  readonly skillFileRuntime?: Pick<SkillFileRuntime, 'scanSkills'>;
}): Promise<Skill[]> {
  const runtime =
    input.skillFileRuntime ??
    createTuiSessionSkillFileRuntime({
      skillLoader: input.skillLoader,
      config: input.config,
      homeDir: input.homeDir,
    });
  return mergeTuiSessionSkills(input.locale, await runtime.scanSkills());
}

export function createTuiSessionSkillRuntime(input: {
  readonly skillLoader: TuiSessionSkillLoader;
  readonly config: CLIConfig;
  readonly locale: TuiSessionSkillLocale;
  readonly homeDir?: string;
  readonly skillFileRuntime?: TuiSessionSkillFileRuntime;
}): TuiSessionSkillRuntime {
  const fileRuntime =
    input.skillFileRuntime ??
    createTuiSessionSkillFileRuntime({
      skillLoader: input.skillLoader,
      config: input.config,
      homeDir: input.homeDir,
    });

  return {
    scanSkills: async () => mergeTuiSessionSkills(input.locale, await fileRuntime.scanSkills()),
    createSkill: async (createInput) => {
      const created = await fileRuntime.createSkill(createInput);
      return {
        created,
        skills: mergeTuiSessionSkills(input.locale, await fileRuntime.getSkills()),
      };
    },
  };
}

function createTuiSessionSkillFileRuntime(input: {
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

function mergeTuiSessionSkills(
  locale: TuiSessionSkillLocale,
  result: SkillFileScanResult,
): Skill[] {
  const merged = new Map<string, Skill>();
  for (const skill of getBuiltinSkills({ locale: locale === 'zh' ? 'zh-CN' : 'en' })) {
    merged.set(skill.name, skill);
  }
  appendTuiSessionSkillScanResult(merged, result);
  return Array.from(merged.values());
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
