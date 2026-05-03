import type {
  ConfiguredSkill,
  ConfiguredSlashCommand,
  Skill,
  SkillSource,
  SlashCommand,
} from '@neko/shared';
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
import { resolvePersonalNekoContentDir, resolveProjectNekoContentDir } from '../workspace';

export const SKILL_FILE_WATCH_DEBOUNCE_MS = 300;
export const SKILL_PATH_TRIGGER_DEBOUNCE_MS = 300;

export interface SkillFileRuntimeDirentLike {
  name: string;
  isDirectory(): boolean;
}

export interface SkillFileRuntimeFs {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  access(path: string): Promise<unknown>;
  writeFile(path: string, content: string, encoding: 'utf-8'): Promise<unknown>;
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
  rm(path: string, options: { recursive: true; force: true }): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
  readdir(path: string, options: { withFileTypes: true }): Promise<SkillFileRuntimeDirentLike[]>;
  copyFile(src: string, dest: string): Promise<unknown>;
}

export interface SkillFileRuntimePath {
  join(...parts: string[]): string;
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

export interface CreateSkillFileInput {
  skillName: string;
  source: SkillFileSource;
  content?: string;
  description?: string;
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
  createSkillFile(input: CreateSkillFileInput): Promise<string>;
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

class DefaultSkillFileRuntime implements SkillFileRuntime {
  private cachedResult: SkillFileScanResult | null = null;

  constructor(private readonly options: SkillFileRuntimeOptions) {}

  getUserSkillsDir(): string {
    return resolvePersonalNekoContentDir(this.options.homeDir, 'skills');
  }

  getUserCommandsDir(): string {
    return resolvePersonalNekoContentDir(this.options.homeDir, 'commands');
  }

  getWorkspaceSkillsDir(): string | null {
    return resolveProjectNekoContentDir(this.getWorkspaceRoot(), 'skills');
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

  async createSkillFile({
    skillName,
    source,
    content,
    description,
  }: CreateSkillFileInput): Promise<string> {
    const plan = buildSkillFileCreationPlan({
      basePath: this.getSkillsBasePath(source),
      skillName,
      content,
      description,
      unavailableError: 'No workspace folder open for project skills',
    });
    if (plan.ok === false) {
      throw new Error(plan.error);
    }

    await this.ensureDir(plan.skillDir);

    if (await this.pathExists(plan.filePath)) {
      this.options.logger?.info?.('Skill file already exists:', plan.filePath);
      return plan.filePath;
    }

    await this.options.fs.writeFile(plan.filePath, plan.fileContent, 'utf-8');
    this.options.logger?.info?.('Created skill file:', plan.filePath);
    return plan.filePath;
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

    await this.copyDirectory(sourceDir, plan.newSkillDir);
    await this.normalizeDuplicatedSkillFile(plan.skillFilePath, newSkillName);

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
      }
    }
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
    } catch {
      return false;
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
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
        await this.options.fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async normalizeDuplicatedSkillFile(
    skillFilePath: string,
    newSkillName: string,
  ): Promise<void> {
    try {
      const content = await this.options.fs.readFile(skillFilePath, 'utf-8');
      await this.options.fs.writeFile(
        skillFilePath,
        normalizeDuplicatedSkillContent(content, newSkillName),
        'utf-8',
      );
    } catch {
      // Duplicated support folders may not contain a canonical SKILL.md.
    }
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
