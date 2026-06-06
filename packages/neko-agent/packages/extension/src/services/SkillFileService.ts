/**
 * SkillFileService - Skill 文件加载与监听服务
 *
 * 职责：
 * 1. 启动时加载用户/工作区的 skill 目录
 * 2. 监听 skill 文件变更，自动更新
 * 3. 提供事件接口通知 UI 更新
 *
 * 目录结构：
 * - 用户 Skills: ~/.neko/skills/<name>/SKILL.md
 * - 工作区 Skills: .neko/skills/<name>/SKILL.md
 * - 用户 Commands: ~/.neko/commands/<name>.md
 * - 工作区 Commands: .neko/commands/<name>.md
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getLogger } from '../base';
import type { ConfiguredSkill, ConfiguredSlashCommand, SkillManifest } from '@neko/shared';
import {
  SKILL_FILE_WATCH_DEBOUNCE_MS,
  SKILL_PATH_TRIGGER_DEBOUNCE_MS,
  createSkillFileRuntime,
  createNodeSkillLoader,
  type LazySkillFileScanResult,
  type SkillFileRuntime,
  type SkillFileScanResult,
} from '@neko/agent';

const logger = getLogger('SkillFileService');

// =============================================================================
// Types
// =============================================================================

export type SkillScanResult = SkillFileScanResult;

/**
 * Lazy scan result — frontmatter-only skills/commands for tiered loading.
 * Lazy skills have deferred `loadContent()` for on-demand content loading.
 */
export type LazySkillScanResult = LazySkillFileScanResult;

export interface SkillFileServiceEvents {
  onSkillsChanged: vscode.Event<SkillScanResult>;
}

// =============================================================================
// Constants
// =============================================================================

// =============================================================================
// SkillFileService
// =============================================================================

export class SkillFileService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private readonly runtime: SkillFileRuntime;

  // Event emitter for skill changes
  private readonly _onSkillsChanged = new vscode.EventEmitter<SkillScanResult>();
  readonly onSkillsChanged = this._onSkillsChanged.event;

  // Event emitter for path-triggered skill activation
  private readonly _onSkillPathTriggered = new vscode.EventEmitter<{
    skillName: string;
    filePath: string;
  }>();
  readonly onSkillPathTriggered = this._onSkillPathTriggered.event;

  // Debounce timer for path triggers
  private pathTriggerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.runtime = createSkillFileRuntime({
      fs,
      path,
      loader: createNodeSkillLoader(fs, path),
      homeDir: os.homedir(),
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      logger,
    });
    this.setupFileWatchers();
    this.setupPathTriggers();
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.disposeWatchers();
        this.setupFileWatchers();
        this.scanSkills().then((result) => {
          this._onSkillsChanged.fire(result);
        });
      }),
    );
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  /**
   * Get user skills directory path (~/.neko/skills/)
   */
  getUserSkillsDir(): string {
    return this.runtime.getUserSkillsDir();
  }

  /**
   * Get user commands directory path (~/.neko/commands/)
   */
  getUserCommandsDir(): string {
    return this.runtime.getUserCommandsDir();
  }

  /**
   * Get workspace skills directory path (.neko/skills/)
   */
  getWorkspaceSkillsDir(): string | null {
    return this.runtime.getWorkspaceSkillsDir();
  }

  /**
   * Get workspace commands directory path (.neko/commands/)
   */
  getWorkspaceCommandsDir(): string | null {
    return this.runtime.getWorkspaceCommandsDir();
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  // ==========================================================================
  // Directory Creation
  // ==========================================================================

  /**
   * Ensure all skill directories exist
   */
  async ensureDirectories(): Promise<void> {
    await this.runtime.ensureDirectories();
  }

  // ==========================================================================
  // Scanning
  // ==========================================================================

  /**
   * Scan and load all skills from user and workspace directories
   */
  async scanSkills(): Promise<SkillScanResult> {
    return this.runtime.scanSkills();
  }

  /**
   * Scan skills lazily — only load frontmatter, defer content loading.
   * Returns LazySkill/LazyCommand objects with deferred loadContent().
   * Used by the tiered loading system to reduce startup overhead.
   */
  async scanSkillsLazy(): Promise<LazySkillScanResult> {
    return this.runtime.scanSkillsLazy();
  }

  /**
   * Get cached scan result or perform new scan
   */
  async getSkills(): Promise<SkillScanResult> {
    return this.runtime.getSkills();
  }

  /**
   * Force a rescan and emit onSkillsChanged.
   * Used by the neko.agent.rescanSkills command (called by neko-market after install).
   */
  async triggerRescan(): Promise<void> {
    const result = await this.scanSkills();
    this._onSkillsChanged.fire(result);
  }

  // ==========================================================================
  // File Creation
  // ==========================================================================

  /**
   * Create a new skill file
   * @param skillName - The name of the skill
   * @param source - 'personal' or 'project'
   * @param content - Optional initial content (defaults to template)
   * @returns The full path to the created file
   */
  async createSkillFile(
    skillName: string,
    source: 'personal' | 'project',
    content?: string,
    description?: string,
  ): Promise<string> {
    return this.runtime.createSkillFile({
      skillName,
      source,
      content,
      description,
    });
  }

  getSkillDirectory(skillName: string, source: 'personal' | 'project'): string | null {
    const baseDir = source === 'personal' ? this.getUserSkillsDir() : this.getWorkspaceSkillsDir();
    return baseDir ? path.join(baseDir, skillName) : null;
  }

  getSkillFilePath(skillName: string, source: 'personal' | 'project'): string | null {
    const skillDir = this.getSkillDirectory(skillName, source);
    return skillDir ? path.join(skillDir, 'SKILL.md') : null;
  }

  async writeSkillManifest(
    skillName: string,
    source: 'personal' | 'project',
    manifest: SkillManifest,
  ): Promise<string> {
    const skillDir = this.getSkillDirectory(skillName, source);
    if (!skillDir) {
      throw new Error('No workspace folder open for project skills');
    }
    await fs.mkdir(skillDir, { recursive: true });
    const manifestPath = path.join(skillDir, 'manifest.json');
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    return manifestPath;
  }

  /**
   * Duplicate an entire skill directory (including references, scripts, etc.)
   * @param sourceDir - The source skill directory path
   * @param newSkillName - The name for the duplicated skill
   * @param targetSource - 'personal' or 'project'
   * @returns The full path to the new skill directory
   */
  async duplicateSkillDirectory(
    sourceDir: string,
    newSkillName: string,
    targetSource: 'personal' | 'project',
  ): Promise<string> {
    return this.runtime.duplicateSkillDirectory({
      sourceDir,
      newSkillName,
      targetSource,
    });
  }

  /**
   * Delete a skill directory
   * @param skillName - The name of the skill to delete
   * @param source - 'personal' or 'project'
   * @returns true if deleted successfully
   */
  async deleteSkillDirectory(skillName: string, source: 'personal' | 'project'): Promise<boolean> {
    return this.runtime.deleteSkillDirectory({
      skillName,
      source,
    });
  }

  /**
   * Create a new command file
   * @param commandName - The name of the command (without leading /)
   * @param source - 'personal' or 'project'
   * @param content - Optional initial content (defaults to template)
   * @returns The full path to the created file
   */
  async createCommandFile(
    commandName: string,
    source: 'personal' | 'project',
    content?: string,
  ): Promise<string> {
    return this.runtime.createCommandFile({
      commandName,
      source,
      content,
    });
  }

  /**
   * Delete a command file
   * @param commandName - The name of the command to delete (without leading /)
   * @param source - 'personal' or 'project'
   * @returns true if deleted successfully
   */
  async deleteCommandFile(commandName: string, source: 'personal' | 'project'): Promise<boolean> {
    return this.runtime.deleteCommandFile({
      commandName,
      source,
    });
  }

  /**
   * Convert scan result to ConfiguredSkill/ConfiguredSlashCommand arrays
   * Includes builtin skills and commands with source='builtin'
   */
  toConfigured(result: SkillScanResult): {
    skills: ConfiguredSkill[];
    commands: ConfiguredSlashCommand[];
  } {
    return this.runtime.toConfigured(result);
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Setup file watchers for skill directories
   */
  private setupFileWatchers(): void {
    for (const entry of this.runtime.getWatchEntries()) {
      this.watchDirectory(entry.dirPath, entry.watchPattern);
    }
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(dirPath: string, pattern: string): void {
    try {
      const fullPattern = new vscode.RelativePattern(dirPath, pattern);
      const watcher = vscode.workspace.createFileSystemWatcher(fullPattern);

      // Debounce handler to avoid multiple rapid updates
      let debounceTimer: NodeJS.Timeout | null = null;
      const handleChange = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(async () => {
          const result = await this.scanSkills();
          this._onSkillsChanged.fire(result);
        }, SKILL_FILE_WATCH_DEBOUNCE_MS);
      };

      watcher.onDidCreate((_uri) => {
        handleChange();
      });

      watcher.onDidChange((_uri) => {
        handleChange();
      });

      watcher.onDidDelete((_uri) => {
        handleChange();
      });

      this.fileWatchers.push(watcher);
    } catch (err) {
      logger.warn(`Failed to watch directory: ${dirPath}`, err);
    }
  }

  /**
   * Dispose file watchers
   */
  private disposeWatchers(): void {
    for (const watcher of this.fileWatchers) {
      watcher.dispose();
    }
    this.fileWatchers = [];
  }

  // ==========================================================================
  // Path Triggers (Skill.paths matching on file save)
  // ==========================================================================

  /**
   * Watch for document saves and check against skill paths patterns.
   * When a saved file matches a skill's `paths` glob, emit onSkillPathTriggered.
   */
  private setupPathTriggers(): void {
    const handler = vscode.workspace.onDidSaveTextDocument((document) => {
      // Debounce rapid saves
      if (this.pathTriggerTimer) {
        clearTimeout(this.pathTriggerTimer);
      }

      this.pathTriggerTimer = setTimeout(() => {
        this.pathTriggerTimer = null;
        this.checkPathTriggers(document.uri.fsPath);
      }, SKILL_PATH_TRIGGER_DEBOUNCE_MS);
    });

    this.disposables.push(handler);
  }

  /**
   * Check if a file path matches any skill's paths patterns.
   */
  private checkPathTriggers(filePath: string): void {
    const matches = this.runtime.resolvePathTriggers(filePath);

    for (const match of matches) {
      logger.debug('Skill path triggered', {
        skillName: match.skillName,
        filePath: match.filePath,
      });
      this._onSkillPathTriggered.fire(match);
    }
  }

  // ==========================================================================
  // Dispose
  // ==========================================================================

  dispose(): void {
    if (this.pathTriggerTimer) {
      clearTimeout(this.pathTriggerTimer);
    }
    this.disposeWatchers();
    this._onSkillsChanged.dispose();
    this._onSkillPathTriggered.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: SkillFileService | null = null;

export function getSkillFileService(): SkillFileService {
  if (!instance) {
    instance = new SkillFileService();
  }
  return instance;
}

export function disposeSkillFileService(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
