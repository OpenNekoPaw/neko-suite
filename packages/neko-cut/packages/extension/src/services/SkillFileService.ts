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
import type {
  Skill,
  SlashCommand,
  SkillSource,
  SkillLoadResult,
  ConfiguredSkill,
  ConfiguredSlashCommand,
} from '@neko/shared';
import { SkillLoader, createNodeSkillLoader } from '@neko/agent/skill/skill-loader.ts';
import { builtinSkills, builtinCommands } from '@neko/agent';

// =============================================================================
// Types
// =============================================================================

export interface SkillScanResult {
  personal: {
    skills: Skill[];
    commands: SlashCommand[];
  };
  project: {
    skills: Skill[];
    commands: SlashCommand[];
  };
  errors: Array<{ file: string; message: string }>;
}

export interface SkillFileServiceEvents {
  onSkillsChanged: vscode.Event<SkillScanResult>;
}

// =============================================================================
// Constants
// =============================================================================

const NEKO_DIR_NAME = '.neko';
const SKILLS_DIR_NAME = 'skills';
const COMMANDS_DIR_NAME = 'commands';

// =============================================================================
// SkillFileService
// =============================================================================

export class SkillFileService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private skillLoader: SkillLoader;

  // Event emitter for skill changes
  private readonly _onSkillsChanged = new vscode.EventEmitter<SkillScanResult>();
  readonly onSkillsChanged = this._onSkillsChanged.event;

  // Cache of loaded skills
  private cachedResult: SkillScanResult | null = null;

  constructor() {
    this.skillLoader = createNodeSkillLoader(fs, path);
    this.setupFileWatchers();
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  /**
   * Get user skills directory path (~/.neko/skills/)
   */
  getUserSkillsDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, NEKO_DIR_NAME, SKILLS_DIR_NAME);
  }

  /**
   * Get user commands directory path (~/.neko/commands/)
   */
  getUserCommandsDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, NEKO_DIR_NAME, COMMANDS_DIR_NAME);
  }

  /**
   * Get workspace skills directory path (.neko/skills/)
   */
  getWorkspaceSkillsDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, NEKO_DIR_NAME, SKILLS_DIR_NAME);
  }

  /**
   * Get workspace commands directory path (.neko/commands/)
   */
  getWorkspaceCommandsDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, NEKO_DIR_NAME, COMMANDS_DIR_NAME);
  }

  // ==========================================================================
  // Directory Creation
  // ==========================================================================

  /**
   * Ensure directory exists
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      // Ignore if already exists
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.warn('[SkillFileService] Failed to create directory:', dirPath, err);
      }
    }
  }

  /**
   * Ensure all skill directories exist
   */
  async ensureDirectories(): Promise<void> {
    // User directories
    await this.ensureDir(this.getUserSkillsDir());
    await this.ensureDir(this.getUserCommandsDir());

    // Workspace directories (if workspace is open)
    const workspaceSkillsDir = this.getWorkspaceSkillsDir();
    const workspaceCommandsDir = this.getWorkspaceCommandsDir();
    if (workspaceSkillsDir) {
      await this.ensureDir(workspaceSkillsDir);
    }
    if (workspaceCommandsDir) {
      await this.ensureDir(workspaceCommandsDir);
    }
  }

  // ==========================================================================
  // Scanning
  // ==========================================================================

  /**
   * Scan and load all skills from user and workspace directories
   */
  async scanSkills(): Promise<SkillScanResult> {
    const result: SkillScanResult = {
      personal: { skills: [], commands: [] },
      project: { skills: [], commands: [] },
      errors: [],
    };

    // Ensure directories exist
    await this.ensureDirectories();

    // Load personal skills
    const userSkillsDir = this.getUserSkillsDir();
    const userCommandsDir = this.getUserCommandsDir();

    const personalSkillsResult = await this.loadFromDirectory(userSkillsDir, 'personal');
    result.personal.skills = personalSkillsResult.skills;
    result.errors.push(...personalSkillsResult.errors.map(e => ({ file: e.file, message: e.message })));

    const personalCommandsResult = await this.loadFromDirectory(userCommandsDir, 'personal');
    result.personal.commands = personalCommandsResult.commands;
    result.errors.push(...personalCommandsResult.errors.map(e => ({ file: e.file, message: e.message })));

    // Load project skills
    const workspaceSkillsDir = this.getWorkspaceSkillsDir();
    const workspaceCommandsDir = this.getWorkspaceCommandsDir();

    if (workspaceSkillsDir) {
      const projectSkillsResult = await this.loadFromDirectory(workspaceSkillsDir, 'project');
      result.project.skills = projectSkillsResult.skills;
      result.errors.push(...projectSkillsResult.errors.map(e => ({ file: e.file, message: e.message })));
    }

    if (workspaceCommandsDir) {
      const projectCommandsResult = await this.loadFromDirectory(workspaceCommandsDir, 'project');
      result.project.commands = projectCommandsResult.commands;
      result.errors.push(...projectCommandsResult.errors.map(e => ({ file: e.file, message: e.message })));
    }

    // Cache and emit
    this.cachedResult = result;

    return result;
  }

  /**
   * Load skills and commands from a directory
   */
  private async loadFromDirectory(dirPath: string, source: SkillSource): Promise<SkillLoadResult> {
    try {
      return await this.skillLoader.loadFromDirectory(dirPath, source);
    } catch (err) {
      console.warn('[SkillFileService] Failed to load from directory:', dirPath, err);
      return {
        skills: [],
        commands: [],
        errors: [{
          file: dirPath,
          message: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
  }

  /**
   * Get cached scan result or perform new scan
   */
  async getSkills(): Promise<SkillScanResult> {
    if (this.cachedResult) {
      return this.cachedResult;
    }
    return this.scanSkills();
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
    description?: string
  ): Promise<string> {
    const basePath = source === 'personal'
      ? this.getUserSkillsDir()
      : this.getWorkspaceSkillsDir();

    if (!basePath) {
      throw new Error('No workspace folder open for project skills');
    }

    // Create skill directory
    const skillDir = path.join(basePath, skillName);
    await this.ensureDir(skillDir);

    // Create SKILL.md file
    const filePath = path.join(skillDir, 'SKILL.md');

    // Check if file already exists
    try {
      await fs.access(filePath);
      // File exists, return path without overwriting
      console.log('[SkillFileService] Skill file already exists:', filePath);
      return filePath;
    } catch {
      // File doesn't exist, create it
    }

    // Build SKILL.md content with proper frontmatter
    let fileContent: string;
    if (content) {
      // If content is provided, check if it already has frontmatter
      if (content.trim().startsWith('---')) {
        // Content already has frontmatter, use as-is but update name
        fileContent = content.replace(
          /^(---\s*\n(?:.*\n)*?)(name:\s*)[^\n]+/m,
          `$1$2"${skillName}"`
        );
        // If no name field exists, add it
        if (!fileContent.includes('name:')) {
          fileContent = content.replace(
            /^---\s*\n/,
            `---\nname: "${skillName}"\n`
          );
        }
      } else {
        // Content doesn't have frontmatter, add it
        const desc = description || 'A custom skill.';
        fileContent = `---
name: "${skillName}"
description: "${desc}"
---

${content}`;
      }
    } else {
      // Default content template
      fileContent = `---
name: "${skillName}"
description: "A custom skill."
---

# ${skillName}

## Instructions

Add your skill instructions here.
`;
    }

    await fs.writeFile(filePath, fileContent, 'utf-8');
    console.log('[SkillFileService] Created skill file:', filePath);

    return filePath;
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
    targetSource: 'personal' | 'project'
  ): Promise<string> {
    const basePath = targetSource === 'personal'
      ? this.getUserSkillsDir()
      : this.getWorkspaceSkillsDir();

    if (!basePath) {
      throw new Error('No workspace folder open for project skills');
    }

    // Create new skill directory
    const newSkillDir = path.join(basePath, newSkillName);

    // Check if target directory already exists
    try {
      await fs.access(newSkillDir);
      throw new Error(`Skill directory already exists: ${newSkillDir}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // Directory doesn't exist, proceed with copy
    }

    // Recursively copy the entire directory
    await this.copyDirectory(sourceDir, newSkillDir);

    // Update the skill name in SKILL.md and ensure enabled is true
    const skillMdPath = path.join(newSkillDir, 'SKILL.md');
    try {
      let content = await fs.readFile(skillMdPath, 'utf-8');

      // Update the name in frontmatter if present
      content = content.replace(
        /^(name:\s*)["']?[^"'\n]+["']?/m,
        `$1"${newSkillName}"`
      );

      // Remove any enabled: false to ensure the copied skill is enabled
      content = content.replace(/^enabled:\s*false\s*$/m, '');

      await fs.writeFile(skillMdPath, content, 'utf-8');
    } catch {
      // SKILL.md might not exist or have different format, ignore
    }

    console.log('[SkillFileService] Duplicated skill directory:', sourceDir, '->', newSkillDir);
    return newSkillDir;
  }


  /**
   * Delete a skill directory
   * @param skillName - The name of the skill to delete
   * @param source - 'personal' or 'project'
   * @returns true if deleted successfully
   */
  async deleteSkillDirectory(
    skillName: string,
    source: 'personal' | 'project'
  ): Promise<boolean> {
    const basePath = source === 'personal'
      ? this.getUserSkillsDir()
      : this.getWorkspaceSkillsDir();

    if (!basePath) {
      console.warn('[SkillFileService] No workspace folder open for project skills');
      return false;
    }

    const skillDir = path.join(basePath, skillName);

    // Check if directory exists
    try {
      await fs.access(skillDir);
    } catch {
      console.warn('[SkillFileService] Skill directory does not exist:', skillDir);
      return false;
    }

    // Recursively delete the directory
    try {
      await fs.rm(skillDir, { recursive: true, force: true });
      console.log('[SkillFileService] Deleted skill directory:', skillDir);
      return true;
    } catch (err) {
      console.error('[SkillFileService] Failed to delete skill directory:', skillDir, err);
      return false;
    }
  }

  /**
   * Recursively copy a directory
   * @param src - Source directory path
   * @param dest - Destination directory path
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await this.ensureDir(dest);

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Skip __pycache__ and other cache directories
        if (entry.name === '__pycache__' || entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
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
    content?: string
  ): Promise<string> {
    const basePath = source === 'personal'
      ? this.getUserCommandsDir()
      : this.getWorkspaceCommandsDir();

    if (!basePath) {
      throw new Error('No workspace folder open for project commands');
    }

    // Ensure commands directory exists
    await this.ensureDir(basePath);

    // Create command file
    const filePath = path.join(basePath, `${commandName}.md`);

    // Check if file already exists
    try {
      await fs.access(filePath);
      // File exists, return path without overwriting
      console.log('[SkillFileService] Command file already exists:', filePath);
      return filePath;
    } catch {
      // File doesn't exist, create it
    }

    // Default content template
    const defaultContent = content ?? `# /${commandName}

<!-- Command configuration -->

## Description

A custom command.

## Instructions

Add your command instructions here.
`;

    await fs.writeFile(filePath, defaultContent, 'utf-8');
    console.log('[SkillFileService] Created command file:', filePath);

    return filePath;
  }


  /**
   * Delete a command file
   * @param commandName - The name of the command to delete (without leading /)
   * @param source - 'personal' or 'project'
   * @returns true if deleted successfully
   */
  async deleteCommandFile(
    commandName: string,
    source: 'personal' | 'project'
  ): Promise<boolean> {
    const basePath = source === 'personal'
      ? this.getUserCommandsDir()
      : this.getWorkspaceCommandsDir();

    if (!basePath) {
      console.warn('[SkillFileService] No workspace folder open for project commands');
      return false;
    }

    const filePath = path.join(basePath, `${commandName}.md`);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      console.warn('[SkillFileService] Command file does not exist:', filePath);
      return false;
    }

    // Delete the file
    try {
      await fs.unlink(filePath);
      console.log('[SkillFileService] Deleted command file:', filePath);
      return true;
    } catch (err) {
      console.error('[SkillFileService] Failed to delete command file:', filePath, err);
      return false;
    }
  }

  /**
   * Convert scan result to ConfiguredSkill/ConfiguredSlashCommand arrays
   * Includes builtin skills and commands with source='builtin'
   */
  toConfigured(result: SkillScanResult): {
    skills: ConfiguredSkill[];
    commands: ConfiguredSlashCommand[];
  } {
    // Builtin skills (from agent package)
    const builtinSkillConfigs: ConfiguredSkill[] = builtinSkills.map(s => ({
      ...s,
      source: 'builtin' as SkillSource,
      enabled: true,
    }));

    // Builtin commands (from agent package)
    const builtinCommandConfigs: ConfiguredSlashCommand[] = builtinCommands.map(c => ({
      ...c,
      source: 'builtin' as SkillSource,
      enabled: true,
    }));

    // Personal and project skills
    const skills: ConfiguredSkill[] = [
      ...builtinSkillConfigs,
      ...result.personal.skills.map(s => ({ ...s, enabled: true })),
      ...result.project.skills.map(s => ({ ...s, enabled: true })),
    ];

    // Personal and project commands
    const commands: ConfiguredSlashCommand[] = [
      ...builtinCommandConfigs,
      ...result.personal.commands.map(c => ({ ...c, enabled: true })),
      ...result.project.commands.map(c => ({ ...c, enabled: true })),
    ];

    return { skills, commands };
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Setup file watchers for skill directories
   */
  private setupFileWatchers(): void {
    // Watch user skill directories
    this.watchDirectory(this.getUserSkillsDir(), '**/*.md');
    this.watchDirectory(this.getUserCommandsDir(), '*.md');

    // Watch workspace skill directories
    const workspaceSkillsDir = this.getWorkspaceSkillsDir();
    const workspaceCommandsDir = this.getWorkspaceCommandsDir();

    if (workspaceSkillsDir) {
      this.watchDirectory(workspaceSkillsDir, '**/*.md');
    }
    if (workspaceCommandsDir) {
      this.watchDirectory(workspaceCommandsDir, '*.md');
    }

    // Watch for workspace folder changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        // Re-setup watchers when workspace changes
        this.disposeWatchers();
        this.setupFileWatchers();
        // Rescan skills
        this.scanSkills().then(result => {
          this._onSkillsChanged.fire(result);
        });
      })
    );
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
        }, 300);
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
      console.warn('[SkillFileService] Failed to watch directory:', dirPath, err);
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
  // Dispose
  // ==========================================================================

  dispose(): void {
    this.disposeWatchers();
    this._onSkillsChanged.dispose();
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
