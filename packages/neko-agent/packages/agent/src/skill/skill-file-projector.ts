/**
 * Pure skill-file business rules shared by hosts.
 *
 * Host layers own filesystem, workspace, and watcher integration. This module
 * owns content normalization, catalog projection, and path-trigger matching.
 */

import type {
  ConfiguredSkill,
  ConfiguredSlashCommand,
  Skill,
  SkillSource,
  SlashCommand,
} from '@neko/shared';
import * as path from 'node:path';
import { builtinSkills } from './builtins';
import type { LazyCommand, LazySkill } from './lazy-loader';
import { matchSkillPaths } from './path-matcher';
import { resolveNekoContentDir, type NekoContentSource } from '../workspace/neko-content-layout';

export type SkillFileSource = NekoContentSource;
export type SkillFileScanKind = 'skills' | 'commands';

export interface SkillFileScanPlanEntry {
  source: SkillFileSource;
  kind: SkillFileScanKind;
  dirPath: string;
  watchPattern: string;
}

export interface SkillFileScanPlan {
  entries: SkillFileScanPlanEntry[];
}

export interface SkillFileScanError {
  file: string;
  message: string;
}

export interface SkillFileScanGroupOf<TSkill, TCommand> {
  skills: TSkill[];
  commands: TCommand[];
}

export interface SkillFileScanResultOf<TSkill, TCommand> {
  personal: SkillFileScanGroupOf<TSkill, TCommand>;
  project: SkillFileScanGroupOf<TSkill, TCommand>;
  errors: SkillFileScanError[];
}

export type SkillFileScanGroup = SkillFileScanGroupOf<Skill, SlashCommand>;
export type SkillFileScanResult = SkillFileScanResultOf<Skill, SlashCommand>;
export type LazySkillFileScanResult = SkillFileScanResultOf<LazySkill, LazyCommand>;

export interface SkillFileLoadResultOf<TSkill, TCommand> {
  skills: readonly TSkill[];
  commands: readonly TCommand[];
  errors: readonly SkillFileScanError[];
}

export interface ConfiguredSkillFileCatalog {
  skills: ConfiguredSkill[];
  commands: ConfiguredSlashCommand[];
}

export interface BuildSkillFileContentOptions {
  skillName: string;
  content?: string;
  description?: string;
}

export interface SkillFileOperationFailurePlan {
  ok: false;
  error: string;
}

export interface SkillFileCreationPlan {
  ok: true;
  skillDir: string;
  filePath: string;
  fileContent: string;
}

export interface SkillDirectoryDuplicationPlan {
  ok: true;
  newSkillDir: string;
  skillFilePath: string;
}

export interface SkillDirectoryDeletionPlan {
  ok: true;
  skillDir: string;
}

export interface CommandFileCreationPlan {
  ok: true;
  dirPath: string;
  filePath: string;
  fileContent: string;
}

export interface CommandFileDeletionPlan {
  ok: true;
  filePath: string;
}

export type SkillSupportFileOpenType = 'skill' | 'reference' | 'script';

export interface SkillSupportFileOpenPlan {
  ok: true;
  filePath: string;
}

export interface CommandFileOpenPlan {
  ok: true;
  filePath: string;
}

export interface ResolveSkillPathTriggersOptions {
  filePath: string;
  workspaceRoot?: string;
  skills: readonly Pick<Skill, 'name' | 'paths'>[];
}

export interface SkillPathTriggerMatch {
  skillName: string;
  filePath: string;
}

const DEFAULT_SKILL_DESCRIPTION = 'A custom skill.';
const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_COPY_EXCLUDED_DIRECTORIES = new Set(['__pycache__', 'node_modules', '.git']);
const SKILL_WATCH_PATTERN = '**/*.md';
const COMMAND_WATCH_PATTERN = '*.md';

export function buildSkillFileScanPlan(input: {
  homeDir: string;
  workspaceRoot?: string | null;
}): SkillFileScanPlan {
  const entries: SkillFileScanPlanEntry[] = [];

  addSkillFileScanPlanEntry(entries, {
    source: 'personal',
    kind: 'skills',
    homeDir: input.homeDir,
  });
  addSkillFileScanPlanEntry(entries, {
    source: 'personal',
    kind: 'commands',
    homeDir: input.homeDir,
  });
  addSkillFileScanPlanEntry(entries, {
    source: 'project',
    kind: 'skills',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  addSkillFileScanPlanEntry(entries, {
    source: 'project',
    kind: 'commands',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });

  return { entries };
}

export function createEmptySkillFileScanResult<TSkill, TCommand>(): SkillFileScanResultOf<
  TSkill,
  TCommand
> {
  return {
    personal: { skills: [], commands: [] },
    project: { skills: [], commands: [] },
    errors: [],
  };
}

export function appendSkillFileScanLoadResult<TSkill, TCommand>(
  result: SkillFileScanResultOf<TSkill, TCommand>,
  entry: Pick<SkillFileScanPlanEntry, 'source' | 'kind'>,
  loaded: SkillFileLoadResultOf<TSkill, TCommand>,
): void {
  if (entry.kind === 'skills') {
    result[entry.source].skills.push(...loaded.skills);
  } else {
    result[entry.source].commands.push(...loaded.commands);
  }

  result.errors.push(...loaded.errors.map(normalizeSkillFileScanError));
}

export function buildSkillDirectoryLoadFailureResult<TSkill, TCommand>(input: {
  dirPath: string;
  operation: 'load' | 'lazy-load';
  error: unknown;
}): SkillFileLoadResultOf<TSkill, TCommand> {
  return {
    skills: [],
    commands: [],
    errors: [
      {
        file: input.dirPath,
        message: `Failed to ${input.operation}: ${formatSkillFileError(input.error)}`,
      },
    ],
  };
}

export function buildSkillFileContent({
  skillName,
  content,
  description = DEFAULT_SKILL_DESCRIPTION,
}: BuildSkillFileContentOptions): string {
  if (content && content.trim().length > 0) {
    return normalizeSkillFrontmatter(content, skillName, description);
  }

  return `---
name: "${skillName}"
description: "${description}"
---

# ${skillName}

## Instructions

Add your skill instructions here.
`;
}

export function normalizeSkillFrontmatter(
  content: string,
  skillName: string,
  description = DEFAULT_SKILL_DESCRIPTION,
): string {
  if (!hasFrontmatter(content)) {
    return `---
name: "${skillName}"
description: "${description}"
---

${content}`;
  }

  return upsertFrontmatterField(content, 'name', `"${skillName}"`);
}

export function normalizeDuplicatedSkillContent(content: string, newSkillName: string): string {
  return removeDisabledFalse(normalizeSkillFrontmatter(content, newSkillName));
}

export function buildCommandFileContent(commandName: string, content?: string): string {
  return (
    content ??
    `# /${commandName}

<!-- Command configuration -->

## Description

A custom command.

## Instructions

Add your command instructions here.
`
  );
}

export function buildSkillFileCreationPlan(input: {
  basePath: string | null | undefined;
  skillName: string;
  content?: string;
  description?: string;
  unavailableError: string;
}): SkillFileCreationPlan | SkillFileOperationFailurePlan {
  if (!input.basePath) {
    return { ok: false, error: input.unavailableError };
  }

  const skillDir = path.join(input.basePath, input.skillName);
  return {
    ok: true,
    skillDir,
    filePath: path.join(skillDir, SKILL_FILE_NAME),
    fileContent: buildSkillFileContent({
      skillName: input.skillName,
      content: input.content,
      description: input.description,
    }),
  };
}

export function buildSkillDirectoryDuplicationPlan(input: {
  basePath: string | null | undefined;
  newSkillName: string;
  unavailableError: string;
}): SkillDirectoryDuplicationPlan | SkillFileOperationFailurePlan {
  if (!input.basePath) {
    return { ok: false, error: input.unavailableError };
  }

  const newSkillDir = path.join(input.basePath, input.newSkillName);
  return {
    ok: true,
    newSkillDir,
    skillFilePath: path.join(newSkillDir, SKILL_FILE_NAME),
  };
}

export function buildSkillDirectoryDeletionPlan(input: {
  basePath: string | null | undefined;
  skillName: string;
  unavailableError: string;
}): SkillDirectoryDeletionPlan | SkillFileOperationFailurePlan {
  if (!input.basePath) {
    return { ok: false, error: input.unavailableError };
  }

  return { ok: true, skillDir: path.join(input.basePath, input.skillName) };
}

export function buildCommandFileCreationPlan(input: {
  basePath: string | null | undefined;
  commandName: string;
  content?: string;
  unavailableError: string;
}): CommandFileCreationPlan | SkillFileOperationFailurePlan {
  if (!input.basePath) {
    return { ok: false, error: input.unavailableError };
  }

  return {
    ok: true,
    dirPath: input.basePath,
    filePath: path.join(input.basePath, `${input.commandName}.md`),
    fileContent: buildCommandFileContent(input.commandName, input.content),
  };
}

export function buildCommandFileDeletionPlan(input: {
  basePath: string | null | undefined;
  commandName: string;
  unavailableError: string;
}): CommandFileDeletionPlan | SkillFileOperationFailurePlan {
  if (!input.basePath) {
    return { ok: false, error: input.unavailableError };
  }

  return { ok: true, filePath: path.join(input.basePath, `${input.commandName}.md`) };
}

export function buildSkillSupportFileOpenPlan(input: {
  source: NekoContentSource;
  homeDir: string;
  workspaceRoot?: string | null;
  skillName: string;
  fileType: SkillSupportFileOpenType;
  filePath?: string;
  unavailableError?: string;
}): SkillSupportFileOpenPlan | SkillFileOperationFailurePlan {
  const basePath = resolveNekoContentDir({
    source: input.source,
    subdir: 'skills',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  if (!basePath) {
    return {
      ok: false,
      error: input.unavailableError ?? 'No workspace folder open for project skills',
    };
  }

  switch (input.fileType) {
    case 'skill':
      return {
        ok: true,
        filePath: path.join(basePath, input.skillName, SKILL_FILE_NAME),
      };
    case 'reference':
      if (!input.filePath) {
        return { ok: false, error: 'No file path provided for reference' };
      }
      return {
        ok: true,
        filePath: path.join(basePath, input.skillName, 'references', input.filePath),
      };
    case 'script':
      if (!input.filePath) {
        return { ok: false, error: 'No file path provided for script' };
      }
      return {
        ok: true,
        filePath: path.join(basePath, input.skillName, 'scripts', input.filePath),
      };
  }
}

export function buildCommandFileOpenPlan(input: {
  source: NekoContentSource;
  homeDir: string;
  workspaceRoot?: string | null;
  commandName: string;
  unavailableError?: string;
}): CommandFileOpenPlan | SkillFileOperationFailurePlan {
  const basePath = resolveNekoContentDir({
    source: input.source,
    subdir: 'commands',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  if (!basePath) {
    return {
      ok: false,
      error: input.unavailableError ?? 'No workspace folder open for project commands',
    };
  }

  return { ok: true, filePath: path.join(basePath, `${input.commandName}.md`) };
}

export function shouldCopySkillDirectoryEntry(entryName: string): boolean {
  return !SKILL_COPY_EXCLUDED_DIRECTORIES.has(entryName);
}

export function toConfiguredSkillFileCatalog(
  result: SkillFileScanResult,
): ConfiguredSkillFileCatalog {
  const builtinSkillConfigs: ConfiguredSkill[] = builtinSkills.map((skill) => ({
    ...skill,
    source: 'builtin' as SkillSource,
    enabled: true,
  }));

  return {
    skills: [
      ...builtinSkillConfigs,
      ...result.personal.skills.map((skill) => ({ ...skill, enabled: true })),
      ...result.project.skills.map((skill) => ({ ...skill, enabled: true })),
    ],
    commands: [
      ...result.personal.commands.map((command) => ({ ...command, enabled: true })),
      ...result.project.commands.map((command) => ({ ...command, enabled: true })),
    ],
  };
}

export function resolveSkillPathTriggers({
  filePath,
  workspaceRoot,
  skills,
}: ResolveSkillPathTriggersOptions): SkillPathTriggerMatch[] {
  const skillInfos = skills
    .filter((skill) => skill.paths && skill.paths.length > 0)
    .map((skill) => ({ name: skill.name, paths: skill.paths ?? [] }));

  if (skillInfos.length === 0) {
    return [];
  }

  const relativePath =
    workspaceRoot && isPathInsideWorkspace(filePath, workspaceRoot)
      ? filePath.slice(workspaceRoot.length + 1)
      : filePath;

  return matchSkillPaths(relativePath, skillInfos).map((skillName) => ({
    skillName,
    filePath: relativePath,
  }));
}

function hasFrontmatter(content: string): boolean {
  return /^---\s*\r?\n/.test(content);
}

function upsertFrontmatterField(content: string, key: string, value: string): string {
  const blockMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!blockMatch?.[0]) {
    return content;
  }

  const block = blockMatch[0];
  const fieldPattern = new RegExp(`^${escapeRegExp(key)}:\\s*.*$`, 'm');
  const nextBlock = fieldPattern.test(block)
    ? block.replace(fieldPattern, `${key}: ${value}`)
    : block.replace(/^---\s*\r?\n/, `---\n${key}: ${value}\n`);

  return `${nextBlock}${content.slice(block.length)}`;
}

function removeDisabledFalse(content: string): string {
  return content.replace(/^enabled:\s*false\s*$/m, '').replace(/\n{3,}/g, '\n\n');
}

function isPathInsideWorkspace(filePath: string, workspaceRoot: string): boolean {
  return filePath === workspaceRoot || filePath.startsWith(`${workspaceRoot}/`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addSkillFileScanPlanEntry(
  entries: SkillFileScanPlanEntry[],
  input: {
    source: SkillFileSource;
    kind: SkillFileScanKind;
    homeDir: string;
    workspaceRoot?: string | null;
  },
): void {
  const dirPath = resolveNekoContentDir({
    source: input.source,
    subdir: input.kind,
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });

  if (!dirPath) {
    return;
  }

  entries.push({
    source: input.source,
    kind: input.kind,
    dirPath,
    watchPattern: input.kind === 'skills' ? SKILL_WATCH_PATTERN : COMMAND_WATCH_PATTERN,
  });
}

function normalizeSkillFileScanError(error: SkillFileScanError): SkillFileScanError {
  return {
    file: error.file,
    message: error.message,
  };
}

function formatSkillFileError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return String(error);
}
