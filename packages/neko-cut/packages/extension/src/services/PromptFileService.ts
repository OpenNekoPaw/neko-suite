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

// =============================================================================
// Types
// =============================================================================

export interface PromptFileInfo {
  id: string;
  name: string;
  filePath: string;
  source: PromptSource;
  content: string;
}

export interface ScanResult {
  personal: PromptFileInfo[];
  project: PromptFileInfo[];
}

// =============================================================================
// Constants
// =============================================================================

const PROMPT_DIR_NAME = 'prompts';
const NEKO_DIR_NAME = '.neko';
const PROMPT_FILE_EXT = '.md';
const AGENTS_FILE_NAME = 'AGENTS.md';

// Default template for new prompt files
const DEFAULT_PROMPT_TEMPLATE = `# {name}

<!-- 在此编写您的提示词内容 -->
<!-- Write your prompt content here -->

`;

// =============================================================================
// PromptFileService
// =============================================================================

export class PromptFileService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  constructor() {
    // Setup file watchers for prompt directories
    this.setupFileWatchers();
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  /**
   * Get user prompt directory path (~/.neko/prompt/)
   */
  getUserPromptDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, NEKO_DIR_NAME, PROMPT_DIR_NAME);
  }

  /**
   * Get workspace prompt directory path (.neko/prompt/)
   */
  getWorkspacePromptDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, NEKO_DIR_NAME, PROMPT_DIR_NAME);
  }

  // ==========================================================================
  // AGENTS.md Path Helpers
  // ==========================================================================

  /**
   * Get user AGENTS.md file path (~/.neko/AGENTS.md)
   */
  getUserAgentsFilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, NEKO_DIR_NAME, AGENTS_FILE_NAME);
  }

  /**
   * Get workspace AGENTS.md file path (.neko/AGENTS.md)
   */
  getWorkspaceAgentsFilePath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, NEKO_DIR_NAME, AGENTS_FILE_NAME);
  }

  /**
   * Get AGENTS.md file path by source
   */
  getAgentsFilePath(source: 'personal' | 'project'): string | null {
    return source === 'personal'
      ? this.getUserAgentsFilePath()
      : this.getWorkspaceAgentsFilePath();
  }

  /**
   * Get prompt file path
   */
  getPromptFilePath(source: PromptSource, fileName: string): string | null {
    const baseDir = source === 'personal' ? this.getUserPromptDir() : this.getWorkspacePromptDir();
    if (!baseDir) return null;

    // Ensure .md extension
    const normalizedFileName = fileName.endsWith(PROMPT_FILE_EXT) ? fileName : `${fileName}${PROMPT_FILE_EXT}`;
    return path.join(baseDir, normalizedFileName);
  }

  /**
   * Generate safe filename from prompt name
   */
  generateFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '-') // Keep Chinese characters
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + PROMPT_FILE_EXT;
  }

  // ==========================================================================
  // Scan & Load
  // ==========================================================================

  /**
   * Scan and load all prompt files from user and workspace directories
   */
  async scanPromptFiles(): Promise<ScanResult> {
    const result: ScanResult = {
      personal: [],
      project: [],
    };

    // Scan user prompts
    const userDir = this.getUserPromptDir();
    result.personal = await this.scanDirectory(userDir, 'personal');

    // Scan workspace prompts
    const workspaceDir = this.getWorkspacePromptDir();
    if (workspaceDir) {
      result.project = await this.scanDirectory(workspaceDir, 'project');
    }

    return result;
  }

  /**
   * Scan a directory for prompt files
   */
  private async scanDirectory(dirPath: string, source: PromptSource): Promise<PromptFileInfo[]> {
    const prompts: PromptFileInfo[] = [];

    try {
      // Check if directory exists
      await fs.promises.access(dirPath);

      // Read directory contents
      const files = await fs.promises.readdir(dirPath);

      for (const file of files) {
        if (!file.endsWith(PROMPT_FILE_EXT)) continue;

        const filePath = path.join(dirPath, file);
        try {
          const stat = await fs.promises.stat(filePath);
          if (!stat.isFile()) continue;

          const content = await fs.promises.readFile(filePath, 'utf-8');
          const name = this.extractNameFromContent(content) || path.basename(file, PROMPT_FILE_EXT);
          const id = this.generatePromptId(source, file);

          prompts.push({
            id,
            name,
            filePath,
            source,
            content,
          });
        } catch (err) {
          console.warn(`[PromptFileService] Failed to read file ${filePath}:`, err);
        }
      }
    } catch {
      // Directory doesn't exist, that's OK
    }

    return prompts;
  }

  /**
   * Extract prompt name from file content (first # heading)
   */
  private extractNameFromContent(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /**
   * Generate unique prompt ID from source and filename
   */
  private generatePromptId(source: PromptSource, fileName: string): string {
    const baseName = path.basename(fileName, PROMPT_FILE_EXT);
    return `${source}-prompt-${baseName}`;
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
    existingFileName?: string
  ): Promise<{ filePath: string; id: string }> {
    const fileName = existingFileName || this.generateFileName(name);
    const filePath = this.getPromptFilePath(source, fileName);

    if (!filePath) {
      throw new Error('Cannot determine prompt file path');
    }

    // Ensure directory exists
    const dirPath = path.dirname(filePath);
    await fs.promises.mkdir(dirPath, { recursive: true });

    // Write file
    await fs.promises.writeFile(filePath, content, 'utf-8');

    const id = this.generatePromptId(source, fileName);
    console.log('[PromptFileService] Saved prompt file:', { id, filePath });

    return { filePath, id };
  }

  /**
   * Create a new prompt file with default template
   */
  async createPromptFile(
    source: PromptSource,
    name: string
  ): Promise<{ filePath: string; id: string }> {
    const content = DEFAULT_PROMPT_TEMPLATE.replace('{name}', name);
    return this.savePromptFile(source, name, content);
  }

  /**
   * Read prompt file content
   */
  async readPromptFile(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Delete a prompt file
   */
  async deletePromptFile(filePath: string): Promise<boolean> {
    try {
      await fs.promises.unlink(filePath);
      console.log('[PromptFileService] Deleted prompt file:', filePath);
      return true;
    } catch (err) {
      console.error('[PromptFileService] Failed to delete file:', err);
      return false;
    }
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
    return {
      id: info.id,
      name: info.name,
      type: 'custom',
      description: '',
      systemPrompt: info.content,
      source: info.source,
      filePath: info.filePath,
      builtin: false,
      enabled: true,
    };
  }

  /**
   * Sync scanned files with ConfigManager
   * Returns prompts that need to be added to config
   */
  async syncWithConfig(
    scanResult: ScanResult,
    existingPrompts: PromptPresetConfig[]
  ): Promise<PromptPresetConfig[]> {
    const newPrompts: PromptPresetConfig[] = [];

    // Build lookup sets for existing prompts
    const existingIds = new Set(existingPrompts.map(p => p.id));
    const existingFilePaths = new Set<string>();
    // Track source + filename combinations to handle same filename in different sources
    const existingSourceFileNames = new Set<string>();

    for (const p of existingPrompts) {
      if (p.filePath) {
        existingFilePaths.add(p.filePath);
        // Add source + filename combination
        const fileName = path.basename(p.filePath);
        const source = p.source || 'personal';
        existingSourceFileNames.add(`${source}:${fileName}`);
      }
    }

    // Check personal prompts
    for (const fileInfo of scanResult.personal) {
      const fileName = path.basename(fileInfo.filePath);
      const sourceFileName = `personal:${fileName}`;
      // Skip if ID, full path, or source+filename already exists
      if (existingIds.has(fileInfo.id) ||
          existingFilePaths.has(fileInfo.filePath) ||
          existingSourceFileNames.has(sourceFileName)) {
        continue;
      }
      newPrompts.push(this.fileInfoToConfig(fileInfo));
    }

    // Check project prompts
    for (const fileInfo of scanResult.project) {
      const fileName = path.basename(fileInfo.filePath);
      const sourceFileName = `project:${fileName}`;
      // Skip if ID, full path, or source+filename already exists
      if (existingIds.has(fileInfo.id) ||
          existingFilePaths.has(fileInfo.filePath) ||
          existingSourceFileNames.has(sourceFileName)) {
        continue;
      }
      newPrompts.push(this.fileInfoToConfig(fileInfo));
    }

    return newPrompts;
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Setup file watchers for prompt directories
   */
  private setupFileWatchers(): void {
    // Watch user prompt directory
    const userDir = this.getUserPromptDir();
    this.watchDirectory(userDir);

    // Watch workspace prompt directory
    const workspaceDir = this.getWorkspacePromptDir();
    if (workspaceDir) {
      this.watchDirectory(workspaceDir);
    }

    // Watch for workspace folder changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        // Re-setup watchers when workspace changes
        this.disposeWatchers();
        this.setupFileWatchers();
      })
    );
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(dirPath: string): void {
    try {
      const pattern = new vscode.RelativePattern(dirPath, `*${PROMPT_FILE_EXT}`);
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
      console.warn('[PromptFileService] Failed to watch directory:', dirPath, err);
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
    // Try project-level first (higher priority)
    const projectPath = this.getWorkspaceAgentsFilePath();
    if (projectPath) {
      try {
        const content = await fs.promises.readFile(projectPath, 'utf-8');
        console.log('[PromptFileService] Loaded project AGENTS.md:', projectPath);
        return { content, source: 'project' };
      } catch {
        // File doesn't exist, continue to personal
      }
    }

    // Try personal-level
    const personalPath = this.getUserAgentsFilePath();
    try {
      const content = await fs.promises.readFile(personalPath, 'utf-8');
      console.log('[PromptFileService] Loaded personal AGENTS.md:', personalPath);
      return { content, source: 'personal' };
    } catch {
      // File doesn't exist
    }

    return null;
  }

  /**
   * Check if AGENTS.md exists at the given source
   */
  async agentsFileExists(source: 'personal' | 'project'): Promise<boolean> {
    const filePath = this.getAgentsFilePath(source);
    if (!filePath) return false;

    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create AGENTS.md file with default template
   */
  async createAgentsFile(
    source: 'personal' | 'project',
    content?: string
  ): Promise<string | null> {
    const filePath = this.getAgentsFilePath(source);
    if (!filePath) return null;

    const defaultContent = content || `# Global Agent Instructions

<!-- 全局 Agent 指令 -->
<!-- 此文件的内容会被注入到所有对话的系统提示词中 -->

## 语言规范
- 对话使用中文
- 代码注释使用英文

## 代码风格
- 遵循项目现有代码风格
- 保持代码简洁清晰
`;

    // Ensure directory exists
    const dirPath = path.dirname(filePath);
    await fs.promises.mkdir(dirPath, { recursive: true });

    await fs.promises.writeFile(filePath, defaultContent, 'utf-8');
    console.log('[PromptFileService] Created AGENTS.md:', filePath);

    return filePath;
  }

  /**
   * Open AGENTS.md file in VSCode editor
   */
  async openAgentsFile(source: 'personal' | 'project'): Promise<void> {
    const filePath = this.getAgentsFilePath(source);
    if (!filePath) {
      throw new Error('Cannot determine AGENTS.md file path');
    }

    // Create if not exists
    const exists = await this.agentsFileExists(source);
    if (!exists) {
      await this.createAgentsFile(source);
    }

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
