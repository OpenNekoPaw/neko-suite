import type {
  ConfiguredSkill,
  ConfiguredSlashCommand,
  CreateSkillFailureCode,
  CreateSkillInput,
  CreateSkillResult,
  Skill,
  SkillDiagnostic,
  SkillSource,
  SlashCommand,
} from '@neko/shared';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import {
  appendSkillFileScanLoadResult,
  buildCommandFileCreationPlan,
  buildCommandFileDeletionPlan,
  buildSkillDirectoryDeletionPlan,
  buildSkillDirectoryDuplicationPlan,
  buildSkillDirectoryLoadFailureResult,
  buildSkillFileCreationPlan,
  buildSkillFileScanPlan,
  createEmptySkillFileScanResult,
  normalizeDuplicatedSkillContent,
  resolveSkillPathTriggers,
  shouldCopySkillDirectoryEntry,
  toConfiguredSkillFileCatalog,
  type ConfiguredSkillFileCatalog,
  type LazySkillFileScanResult,
  type SkillFileLoadResultOf,
  type SkillFileScanPlan,
  type SkillFileScanPlanEntry,
  type SkillFileScanResult,
  type SkillFileSource,
  type SkillPathTriggerMatch,
} from './skill-file-projector';
import type { LazyCommand, LazySkill } from './lazy-loader';
import {
  resolvePersonalAgentSkillsDir,
  resolvePersonalNekoContentDir,
  resolveProjectAgentSkillsDir,
  resolveProjectNekoContentDir,
} from '../workspace';
import { serializeNekoSkillOverlay, validateNekoSkillOverlay } from './neko-skill-overlay';
import { serializePortableSkillMarkdown, validatePortableSkillDefinition } from './portable-skill';
import { validateSkillPackagePath, validateSkillResources } from './skill-package-path';

export const SKILL_FILE_WATCH_DEBOUNCE_MS = 300;
export const SKILL_PATH_TRIGGER_DEBOUNCE_MS = 300;

export interface SkillFileRuntimeDirentLike {
  name: string;
  isDirectory(): boolean;
}

export interface SkillFileRuntimeFs {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  access(path: string): Promise<unknown>;
  writeFile(path: string, content: string | Uint8Array, encoding?: 'utf-8'): Promise<unknown>;
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
  rm(path: string, options: { recursive: true; force: true }): Promise<unknown>;
  rename(oldPath: string, newPath: string): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
  readdir(path: string, options: { withFileTypes: true }): Promise<SkillFileRuntimeDirentLike[]>;
  copyFile(src: string, dest: string): Promise<unknown>;
}

export interface SkillFileRuntimePath {
  join(...parts: string[]): string;
  dirname(path: string): string;
}

export interface SkillFileRuntimeLoader {
  loadFromDirectory(
    dirPath: string,
    source: SkillSource,
  ): Promise<SkillFileLoadResultOf<Skill, SlashCommand>>;
  loadLazyFromDirectory(
    dirPath: string,
    source: SkillSource,
  ): Promise<SkillFileLoadResultOf<LazySkill, LazyCommand>>;
}

export interface SkillFileRuntimeLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface SkillFileRuntimeOptions {
  readonly fs: SkillFileRuntimeFs;
  readonly path: SkillFileRuntimePath;
  readonly loader: SkillFileRuntimeLoader;
  readonly homeDir: string;
  readonly getWorkspaceRoot?: () => string | null | undefined;
  readonly logger?: Partial<SkillFileRuntimeLogger>;
}

export interface DuplicateSkillDirectoryInput {
  sourceDir: string;
  newSkillName: string;
  targetSource: SkillFileSource;
}

export interface DeleteSkillDirectoryInput {
  skillName: string;
  source: SkillFileSource;
}

export interface CreateCommandFileInput {
  commandName: string;
  source: SkillFileSource;
  content?: string;
}

export interface DeleteCommandFileInput {
  commandName: string;
  source: SkillFileSource;
}

export interface SkillFileRuntime {
  getUserSkillsDir(): string;
  getUserCommandsDir(): string;
  getWorkspaceSkillsDir(): string | null;
  getWorkspaceCommandsDir(): string | null;
  getScanPlan(): SkillFileScanPlan;
  getWatchEntries(): readonly SkillFileScanPlanEntry[];
  ensureDirectories(): Promise<void>;
  scanSkills(): Promise<SkillFileScanResult>;
  scanSkillsLazy(): Promise<LazySkillFileScanResult>;
  getSkills(): Promise<SkillFileScanResult>;
  createSkill(input: CreateSkillInput): Promise<CreateSkillResult>;
  duplicateSkillDirectory(input: DuplicateSkillDirectoryInput): Promise<string>;
  deleteSkillDirectory(input: DeleteSkillDirectoryInput): Promise<boolean>;
  createCommandFile(input: CreateCommandFileInput): Promise<string>;
  deleteCommandFile(input: DeleteCommandFileInput): Promise<boolean>;
  toConfigured(result: SkillFileScanResult): ConfiguredSkillFileCatalog;
  resolvePathTriggers(filePath: string): SkillPathTriggerMatch[];
}

export function createSkillFileRuntime(options: SkillFileRuntimeOptions): SkillFileRuntime {
  return new DefaultSkillFileRuntime(options);
}

export class CreateSkillError extends Error {
  readonly code: CreateSkillFailureCode;
  readonly diagnostics: readonly SkillDiagnostic[];

  constructor(code: CreateSkillFailureCode, diagnostics: readonly SkillDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    this.name = 'CreateSkillError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

class DefaultSkillFileRuntime implements SkillFileRuntime {
  private cachedResult: SkillFileScanResult | null = null;

  constructor(private readonly options: SkillFileRuntimeOptions) {}

  getUserSkillsDir(): string {
    return resolvePersonalAgentSkillsDir(this.options.homeDir);
  }

  getUserCommandsDir(): string {
    return resolvePersonalNekoContentDir(this.options.homeDir, 'commands');
  }

  getWorkspaceSkillsDir(): string | null {
    return resolveProjectAgentSkillsDir(this.getWorkspaceRoot());
  }

  getWorkspaceCommandsDir(): string | null {
    return resolveProjectNekoContentDir(this.getWorkspaceRoot(), 'commands');
  }

  getScanPlan(): SkillFileScanPlan {
    return buildSkillFileScanPlan({
      homeDir: this.options.homeDir,
      workspaceRoot: this.getWorkspaceRoot(),
    });
  }

  getWatchEntries(): readonly SkillFileScanPlanEntry[] {
    return this.getScanPlan().entries;
  }

  async ensureDirectories(): Promise<void> {
    for (const entry of this.getScanPlan().entries) {
      await this.ensureDir(entry.dirPath);
    }
  }

  async scanSkills(): Promise<SkillFileScanResult> {
    const result = createEmptySkillFileScanResult<Skill, SlashCommand>();

    await this.ensureDirectories();

    for (const entry of this.getScanPlan().entries) {
      appendSkillFileScanLoadResult(
        result,
        entry,
        await this.loadFromDirectory(entry.dirPath, entry.source),
      );
    }

    this.cachedResult = result;
    return result;
  }

  async scanSkillsLazy(): Promise<LazySkillFileScanResult> {
    const result = createEmptySkillFileScanResult<LazySkill, LazyCommand>();

    await this.ensureDirectories();

    for (const entry of this.getScanPlan().entries) {
      appendSkillFileScanLoadResult(
        result,
        entry,
        await this.loadLazyFromDirectory(entry.dirPath, entry.source),
      );
    }

    return result;
  }

  async getSkills(): Promise<SkillFileScanResult> {
    return this.cachedResult ?? this.scanSkills();
  }

  async createSkill(input: CreateSkillInput): Promise<CreateSkillResult> {
    const portableValidation = validatePortableSkillDefinition(input.skill);
    if (!portableValidation.valid) {
      throw new CreateSkillError('invalid-skill', portableValidation.diagnostics);
    }
    if (input.neko !== undefined) {
      const overlayValidation = validateNekoSkillOverlay(input.neko);
      if (!overlayValidation.valid) {
        throw new CreateSkillError('invalid-overlay', overlayValidation.diagnostics);
      }
    }
    const resourceDiagnostics = validateSkillResources(input.resources);
    if (resourceDiagnostics.length > 0) {
      const reserved = resourceDiagnostics.some(
        (diagnostic) => diagnostic.code === 'skill-resource-path-reserved',
      );
      throw new CreateSkillError(
        reserved ? 'reserved-resource-path' : 'invalid-resource-path',
        resourceDiagnostics,
      );
    }

    const basePath = this.getSkillsBasePath(input.target);
    if (!basePath) {
      throw new CreateSkillError('filesystem-error', [
        creationDiagnostic('skill-root-unavailable', 'No workspace folder open for project skills'),
      ]);
    }
    const plan = buildSkillFileCreationPlan({
      basePath,
      skillName: input.skill.name,
      unavailableError: 'No workspace folder open for project skills',
    });
    if (plan.ok === false) {
      throw new CreateSkillError('filesystem-error', [
        creationDiagnostic('skill-root-unavailable', plan.error),
      ]);
    }

    if (await this.pathExists(plan.skillDir)) {
      throw new CreateSkillError('skill-already-exists', [
        creationDiagnostic(
          'skill-already-exists',
          `Skill directory already exists: ${plan.skillDir}`,
          input.skill.name,
        ),
      ]);
    }

    const skillMarkdown = serializePortableSkillMarkdown(input.skill);
    const overlayYaml = input.neko === undefined ? null : serializeNekoSkillOverlay(input.neko);
    const resources = prepareSkillResources(input.resources);
    const tempDir = this.options.path.join(basePath, `.${input.skill.name}.tmp-${randomUUID()}`);

    try {
      await this.options.fs.mkdir(basePath, { recursive: true });
      await this.options.fs.mkdir(tempDir, { recursive: true });
      await this.options.fs.writeFile(
        this.options.path.join(tempDir, 'SKILL.md'),
        skillMarkdown,
        'utf-8',
      );
      for (const resource of resources) {
        const resourcePath = this.options.path.join(tempDir, ...resource.normalizedPath.split('/'));
        await this.ensureParentDirectory(resourcePath);
        await this.options.fs.writeFile(
          resourcePath,
          resource.content,
          resource.encoding === 'utf8' ? 'utf-8' : undefined,
        );
      }
      if (overlayYaml !== null) {
        const overlayPath = this.options.path.join(tempDir, 'agents', 'neko.yaml');
        await this.ensureParentDirectory(overlayPath);
        await this.options.fs.writeFile(overlayPath, overlayYaml, 'utf-8');
      }

      try {
        await this.options.fs.rename(tempDir, plan.skillDir);
      } catch (error) {
        if (await this.pathExists(plan.skillDir)) {
          throw new CreateSkillError('atomic-commit-conflict', [
            creationDiagnostic(
              'skill-atomic-commit-conflict',
              `Another creator committed Skill "${input.skill.name}" first.`,
              input.skill.name,
            ),
          ]);
        }
        throw error;
      }
    } catch (error) {
      let cleanupError: unknown;
      try {
        await this.options.fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupFailure) {
        cleanupError = cleanupFailure;
      }
      if (error instanceof CreateSkillError && cleanupError === undefined) {
        throw error;
      }
      const diagnostics = [
        creationDiagnostic(
          'skill-create-filesystem-error',
          `Failed to create Skill "${input.skill.name}": ${formatError(error)}`,
          input.skill.name,
        ),
      ];
      if (cleanupError !== undefined) {
        diagnostics.push(
          creationDiagnostic(
            'skill-create-cleanup-error',
            `Failed to clean temporary Skill state: ${formatError(cleanupError)}`,
            input.skill.name,
          ),
        );
      }
      throw new CreateSkillError(
        error instanceof CreateSkillError ? error.code : 'filesystem-error',
        error instanceof CreateSkillError
          ? [...error.diagnostics, ...diagnostics.slice(1)]
          : diagnostics,
      );
    }

    const result: CreateSkillResult = {
      source: input.target,
      rootId: `${input.target}-agent-skills`,
      relativePath: input.skill.name,
      absolutePath: plan.skillDir,
      fingerprint: fingerprintSkillPackage(skillMarkdown, overlayYaml, resources),
      diagnostics: [],
    };
    this.cachedResult = null;
    await this.scanSkills();
    this.options.logger?.info?.('Created Skill package:', plan.skillDir);
    return result;
  }

  async duplicateSkillDirectory({
    sourceDir,
    newSkillName,
    targetSource,
  }: DuplicateSkillDirectoryInput): Promise<string> {
    const plan = buildSkillDirectoryDuplicationPlan({
      basePath: this.getSkillsBasePath(targetSource),
      newSkillName,
      unavailableError: 'No workspace folder open for project skills',
    });
    if (plan.ok === false) {
      throw new Error(plan.error);
    }

    if (await this.pathExists(plan.newSkillDir)) {
      throw new Error(`Skill directory already exists: ${plan.newSkillDir}`);
    }

    const targetRoot = this.options.path.dirname(plan.newSkillDir);
    const tempDir = this.options.path.join(targetRoot, `.${newSkillName}.tmp-${randomUUID()}`);
    try {
      await this.ensureDir(targetRoot);
      await this.copyDirectory(sourceDir, tempDir, true);
      await this.normalizeDuplicatedSkillFile(
        this.options.path.join(tempDir, 'SKILL.md'),
        newSkillName,
      );
      await this.options.fs.rename(tempDir, plan.newSkillDir);
    } catch (error) {
      await this.options.fs.rm(tempDir, { recursive: true, force: true });
      throw error;
    }

    this.cachedResult = null;
    await this.scanSkills();
    this.options.logger?.info?.(`Duplicated skill directory: ${sourceDir} -> ${plan.newSkillDir}`);
    return plan.newSkillDir;
  }

  async deleteSkillDirectory({ skillName, source }: DeleteSkillDirectoryInput): Promise<boolean> {
    const plan = buildSkillDirectoryDeletionPlan({
      basePath: this.getSkillsBasePath(source),
      skillName,
      unavailableError: 'No workspace folder open for project skills',
    });
    if (plan.ok === false) {
      this.options.logger?.warn?.(plan.error);
      return false;
    }

    if (!(await this.pathExists(plan.skillDir))) {
      this.options.logger?.warn?.('Skill directory does not exist:', plan.skillDir);
      return false;
    }

    try {
      await this.options.fs.rm(plan.skillDir, { recursive: true, force: true });
      this.cachedResult = null;
      await this.scanSkills();
      this.options.logger?.info?.('Deleted skill directory:', plan.skillDir);
      return true;
    } catch (error) {
      this.options.logger?.error?.(`Failed to delete skill directory: ${plan.skillDir}`, error);
      return false;
    }
  }

  async createCommandFile({
    commandName,
    source,
    content,
  }: CreateCommandFileInput): Promise<string> {
    const plan = buildCommandFileCreationPlan({
      basePath: this.getCommandsBasePath(source),
      commandName,
      content,
      unavailableError: 'No workspace folder open for project commands',
    });
    if (plan.ok === false) {
      throw new Error(plan.error);
    }

    await this.ensureDir(plan.dirPath);

    if (await this.pathExists(plan.filePath)) {
      this.options.logger?.info?.('Command file already exists:', plan.filePath);
      return plan.filePath;
    }

    await this.options.fs.writeFile(plan.filePath, plan.fileContent, 'utf-8');
    this.options.logger?.info?.('Created command file:', plan.filePath);
    return plan.filePath;
  }

  async deleteCommandFile({ commandName, source }: DeleteCommandFileInput): Promise<boolean> {
    const plan = buildCommandFileDeletionPlan({
      basePath: this.getCommandsBasePath(source),
      commandName,
      unavailableError: 'No workspace folder open for project commands',
    });
    if (plan.ok === false) {
      this.options.logger?.warn?.(plan.error);
      return false;
    }

    if (!(await this.pathExists(plan.filePath))) {
      this.options.logger?.warn?.('Command file does not exist:', plan.filePath);
      return false;
    }

    try {
      await this.options.fs.unlink(plan.filePath);
      this.options.logger?.info?.('Deleted command file:', plan.filePath);
      return true;
    } catch (error) {
      this.options.logger?.error?.(`Failed to delete command file: ${plan.filePath}`, error);
      return false;
    }
  }

  toConfigured(result: SkillFileScanResult): {
    skills: ConfiguredSkill[];
    commands: ConfiguredSlashCommand[];
  } {
    return toConfiguredSkillFileCatalog(result);
  }

  resolvePathTriggers(filePath: string): SkillPathTriggerMatch[] {
    if (!this.cachedResult) {
      return [];
    }

    const allSkills = [...this.cachedResult.personal.skills, ...this.cachedResult.project.skills];
    return resolveSkillPathTriggers({
      filePath,
      workspaceRoot: this.getWorkspaceRoot() ?? undefined,
      skills: allSkills,
    });
  }

  private getWorkspaceRoot(): string | null {
    return this.options.getWorkspaceRoot?.() ?? null;
  }

  private getSkillsBasePath(source: SkillFileSource): string | null {
    return source === 'personal' ? this.getUserSkillsDir() : this.getWorkspaceSkillsDir();
  }

  private getCommandsBasePath(source: SkillFileSource): string | null {
    return source === 'personal' ? this.getUserCommandsDir() : this.getWorkspaceCommandsDir();
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await this.options.fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') {
        this.options.logger?.warn?.(`Failed to create directory: ${dirPath}`, error);
        throw error;
      }
    }
  }

  private async ensureParentDirectory(filePath: string): Promise<void> {
    await this.options.fs.mkdir(this.options.path.dirname(filePath), { recursive: true });
  }

  private async loadFromDirectory(
    dirPath: string,
    source: SkillSource,
  ): Promise<SkillFileLoadResultOf<Skill, SlashCommand>> {
    try {
      return await this.options.loader.loadFromDirectory(dirPath, source);
    } catch (error) {
      this.options.logger?.warn?.(`Failed to load from directory: ${dirPath}`, error);
      return buildSkillDirectoryLoadFailureResult({
        dirPath,
        operation: 'load',
        error,
      });
    }
  }

  private async loadLazyFromDirectory(
    dirPath: string,
    source: SkillSource,
  ): Promise<SkillFileLoadResultOf<LazySkill, LazyCommand>> {
    try {
      return await this.options.loader.loadLazyFromDirectory(dirPath, source);
    } catch (error) {
      this.options.logger?.warn?.(`Failed to lazy-load from directory: ${dirPath}`, error);
      return buildSkillDirectoryLoadFailureResult({
        dirPath,
        operation: 'lazy-load',
        error,
      });
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await this.options.fs.access(filePath);
      return true;
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private async copyDirectory(src: string, dest: string, isRoot = false): Promise<void> {
    await this.ensureDir(dest);

    const entries = await this.options.fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = this.options.path.join(src, entry.name);
      const destPath = this.options.path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!shouldCopySkillDirectoryEntry(entry.name)) {
          continue;
        }
        await this.copyDirectory(srcPath, destPath);
      } else {
        if (isRoot && entry.name.toLowerCase() === 'manifest.json') {
          continue;
        }
        await this.options.fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async normalizeDuplicatedSkillFile(
    skillFilePath: string,
    newSkillName: string,
  ): Promise<void> {
    const content = await this.options.fs.readFile(skillFilePath, 'utf-8');
    await this.options.fs.writeFile(
      skillFilePath,
      normalizeDuplicatedSkillContent(content, newSkillName),
      'utf-8',
    );
  }
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function creationDiagnostic(code: string, message: string, path?: string): SkillDiagnostic {
  return {
    area: 'creation',
    code,
    severity: 'error',
    message,
    ...(path === undefined ? {} : { path }),
  };
}

interface PreparedSkillResource {
  readonly normalizedPath: string;
  readonly encoding: 'utf8' | 'base64';
  readonly content: string | Uint8Array;
}

function prepareSkillResources(
  resources: CreateSkillInput['resources'],
): readonly PreparedSkillResource[] {
  return (resources ?? []).map((resource) => {
    const validation = validateSkillPackagePath(resource.path, { rejectReserved: true });
    if (!validation.valid || validation.normalizedPath === undefined) {
      throw new Error(`Preflight accepted an invalid resource path: ${resource.path}`);
    }
    return {
      normalizedPath: validation.normalizedPath,
      encoding: resource.encoding,
      content:
        resource.encoding === 'utf8' ? resource.content : Buffer.from(resource.content, 'base64'),
    };
  });
}

function fingerprintSkillPackage(
  skillMarkdown: string,
  overlayYaml: string | null,
  resources: readonly PreparedSkillResource[],
): string {
  const hash = createHash('sha256');
  hash.update('SKILL.md\0');
  hash.update(skillMarkdown);
  if (overlayYaml !== null) {
    hash.update('agents/neko.yaml\0');
    hash.update(overlayYaml);
  }
  const sortedResources = [...resources].sort((left, right) =>
    left.normalizedPath.localeCompare(right.normalizedPath),
  );
  for (const resource of sortedResources) {
    hash.update(`${resource.normalizedPath}\0`);
    hash.update(resource.content);
  }
  return `sha256:${hash.digest('hex')}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
