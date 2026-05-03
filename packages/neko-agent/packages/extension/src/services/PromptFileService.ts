/**
 * PromptFileService - 提示词文件持久化服务
 *
 * 职责：
 * 1. 扫描并加载用户/工作区的提示词文件
 * 2. 创建/更新/删除提示词文件
 * 3. 同步文件系统与配置管理器
 *
 * 文件路径规范：
 * - 用户提示词: ~/.neko/prompts/<name>.md
 * - 工作区提示词: .neko/prompts/<name>.md
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PromptPresetConfig, PromptSource } from '@neko/shared';
import {
  PROMPT_FILE_EXTENSION,
  createPromptFileRuntime,
  type PromptFileInfo,
  type PromptFileRuntime,
  type PromptFileScanResult,
} from '@neko/agent';
import { getLogger } from '../base';

const logger = getLogger('PromptFileService');

// =============================================================================
// Types
// =============================================================================

export type { PromptFileInfo };
export type ScanResult = PromptFileScanResult;

// =============================================================================
// PromptFileService
// =============================================================================

export class PromptFileService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private readonly runtime: PromptFileRuntime;

  constructor() {
    this.runtime = createPromptFileRuntime({
      fs: fs.promises,
      path,
      homeDir: os.homedir(),
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      logger,
    });
    this.setupFileWatchers();
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.disposeWatchers();
        this.setupFileWatchers();
      }),
    );
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  /**
   * Get user prompt directory path (~/.neko/prompt/)
   */
  getUserPromptDir(): string {
    return this.runtime.getUserPromptDir();
  }

  /**
   * Get workspace prompt directory path (.neko/prompt/)
   */
  getWorkspacePromptDir(): string | null {
    return this.runtime.getWorkspacePromptDir();
  }

  // ==========================================================================
  // AGENTS.md Path Helpers
  // ==========================================================================

  /**
   * Get user AGENTS.md file path (~/.neko/AGENTS.md)
   */
  getUserAgentsFilePath(): string {
    return this.runtime.getUserAgentsFilePath();
  }

  /**
   * Get workspace AGENTS.md file path (.neko/AGENTS.md)
   */
  getWorkspaceAgentsFilePath(): string | null {
    return this.runtime.getWorkspaceAgentsFilePath();
  }

  /**
   * Get AGENTS.md file path by source
   */
  getAgentsFilePath(source: 'personal' | 'project'): string | null {
    return this.runtime.getAgentsFilePath(source);
  }

  /**
   * Get prompt file path
   */
  getPromptFilePath(source: PromptSource, fileName: string): string | null {
    return this.runtime.getPromptFilePath(source, fileName);
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  /**
   * Generate safe filename from prompt name
   */
  generateFileName(name: string): string {
    return this.runtime.generateFileName(name);
  }

  // ==========================================================================
  // Scan & Load
  // ==========================================================================

  /**
   * Scan and load all prompt files from user and workspace directories
   */
  async scanPromptFiles(): Promise<ScanResult> {
    return this.runtime.scanPromptFiles();
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Create or update a prompt file
   */
  async savePromptFile(
    source: PromptSource,
    name: string,
    content: string,
    existingFileName?: string,
  ): Promise<{ filePath: string; id: string }> {
    return this.runtime.savePromptFile({ source, name, content, existingFileName });
  }

  /**
   * Create a new prompt file with default template
   */
  async createPromptFile(
    source: PromptSource,
    name: string,
  ): Promise<{ filePath: string; id: string }> {
    return this.runtime.createPromptFile(source, name);
  }

  /**
   * Read prompt file content
   */
  async readPromptFile(filePath: string): Promise<string | null> {
    return this.runtime.readPromptFile(filePath);
  }

  /**
   * Delete a prompt file
   */
  async deletePromptFile(filePath: string): Promise<boolean> {
    return this.runtime.deletePromptFile(filePath);
  }

  /**
   * Open prompt file in VSCode editor
   */
  async openPromptFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  // ==========================================================================
  // Sync with ConfigManager
  // ==========================================================================

  /**
   * Convert PromptFileInfo to PromptPresetConfig
   */
  fileInfoToConfig(info: PromptFileInfo): PromptPresetConfig {
    return this.runtime.fileInfoToConfig(info);
  }

  /**
   * Sync scanned files with ConfigManager
   * Returns prompts that need to be added to config
   */
  async syncWithConfig(
    scanResult: ScanResult,
    existingPrompts: PromptPresetConfig[],
  ): Promise<PromptPresetConfig[]> {
    return this.runtime.syncWithConfig(scanResult, existingPrompts);
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Setup file watchers for prompt directories
   */
  private setupFileWatchers(): void {
    for (const dirPath of this.runtime.getPromptWatchDirs()) {
      this.watchDirectory(dirPath);
    }
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(dirPath: string): void {
    try {
      const pattern = new vscode.RelativePattern(dirPath, `*${PROMPT_FILE_EXTENSION}`);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidCreate((_uri) => {
        // Emit event for external handling
      });

      watcher.onDidChange((_uri) => {
        // Emit event for external handling
      });

      watcher.onDidDelete((_uri) => {
        // Emit event for external handling
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
  // AGENTS.md Operations
  // ==========================================================================

  /**
   * Load AGENTS.md content with priority: project > personal
   * Returns merged content or null if no AGENTS.md exists
   */
  async loadAgentsFile(): Promise<{ content: string; source: 'personal' | 'project' } | null> {
    return this.runtime.loadAgentsFile();
  }

  /**
   * Check if AGENTS.md exists at the given source
   */
  async agentsFileExists(source: 'personal' | 'project'): Promise<boolean> {
    return this.runtime.agentsFileExists(source);
  }

  /**
   * Create AGENTS.md file with default template
   */
  async createAgentsFile(source: 'personal' | 'project', content?: string): Promise<string | null> {
    return this.runtime.createAgentsFile(source, content);
  }

  /**
   * Open AGENTS.md file in VSCode editor
   */
  async openAgentsFile(source: 'personal' | 'project'): Promise<void> {
    const filePath = await this.runtime.ensureAgentsFile(source);
    const uri = vscode.Uri.file(filePath);
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  // ==========================================================================
  // Dispose
  // ==========================================================================

  dispose(): void {
    this.disposeWatchers();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: PromptFileService | null = null;

export function getPromptFileService(): PromptFileService {
  if (!instance) {
    instance = new PromptFileService();
  }
  return instance;
}

export function disposePromptFileService(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
