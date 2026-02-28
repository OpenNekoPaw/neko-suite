/**
 * HookFileService - Hook 文件加载与监听服务
 *
 * 职责：
 * 1. 启动时加载用户/工作区的 hook 目录
 * 2. 监听 hook 文件变更，自动更新
 * 3. 提供事件接口通知 UI 更新
 *
 * 目录结构：
 * - 用户 Hooks: ~/.neko/hooks/<name>.md
 * - 工作区 Hooks: .neko/hooks/<name>.md
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  Hook,
  HookFrontmatter,
  HookLoadResult,
  HookLoadError,
  ConfiguredHook,
  SkillSource,
} from '@neko/shared';
import { createHook, parseHookEvent } from '@neko/shared';
import { getLogger } from '../base';

const logger = getLogger('HookFileService');

// =============================================================================
// Types
// =============================================================================

export interface HookScanResult {
  personal: Hook[];
  project: Hook[];
  errors: HookLoadError[];
}

// =============================================================================
// Constants
// =============================================================================

const NEKO_DIR_NAME = '.neko';
const HOOKS_DIR_NAME = 'hooks';
const HOOK_FILE_EXT = '.md';

// =============================================================================
// HookFileService
// =============================================================================

export class HookFileService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  // Event emitter for hook changes
  private readonly _onHooksChanged = new vscode.EventEmitter<HookScanResult>();
  readonly onHooksChanged = this._onHooksChanged.event;

  // Cache of loaded hooks
  private cachedResult: HookScanResult | null = null;

  constructor() {
    this.setupFileWatchers();
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  /**
   * Get user hooks directory path (~/.neko/hooks/)
   */
  getUserHooksDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, NEKO_DIR_NAME, HOOKS_DIR_NAME);
  }

  /**
   * Get workspace hooks directory path (.neko/hooks/)
   */
  getWorkspaceHooksDir(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return path.join(workspaceFolders[0].uri.fsPath, NEKO_DIR_NAME, HOOKS_DIR_NAME);
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
        logger.warn(`Failed to create directory: ${dirPath}`, err);
      }
    }
  }

  /**
   * Ensure all hook directories exist
   */
  async ensureDirectories(): Promise<void> {
    // User directory
    await this.ensureDir(this.getUserHooksDir());

    // Workspace directory (if workspace is open)
    const workspaceHooksDir = this.getWorkspaceHooksDir();
    if (workspaceHooksDir) {
      await this.ensureDir(workspaceHooksDir);
    }
  }

  // ==========================================================================
  // Scanning
  // ==========================================================================

  /**
   * Scan and load all hooks from user and workspace directories
   */
  async scanHooks(): Promise<HookScanResult> {
    const result: HookScanResult = {
      personal: [],
      project: [],
      errors: [],
    };

    // Ensure directories exist
    await this.ensureDirectories();

    // Load personal hooks
    const userHooksDir = this.getUserHooksDir();
    const personalResult = await this.loadFromDirectory(userHooksDir, 'personal');
    result.personal = personalResult.hooks;
    result.errors.push(...personalResult.errors);

    // Load project hooks
    const workspaceHooksDir = this.getWorkspaceHooksDir();
    if (workspaceHooksDir) {
      const projectResult = await this.loadFromDirectory(workspaceHooksDir, 'project');
      result.project = projectResult.hooks;
      result.errors.push(...projectResult.errors);
    }

    // Cache and emit
    this.cachedResult = result;

    return result;
  }

  /**
   * Load hooks from a directory
   */
  private async loadFromDirectory(dirPath: string, source: SkillSource): Promise<HookLoadResult> {
    const hooks: Hook[] = [];
    const errors: HookLoadError[] = [];

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        if (!file.endsWith(HOOK_FILE_EXT)) continue;

        const filePath = path.join(dirPath, file);
        try {
          const stat = await fs.stat(filePath);
          if (!stat.isFile()) continue;

          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parseHookFile(content, source, filePath);

          if (parsed.hook) {
            hooks.push(parsed.hook);
          }
          if (parsed.error) {
            errors.push(parsed.error);
          }
        } catch (err) {
          errors.push({
            file: filePath,
            message: `Failed to read: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    } catch (err) {
      // Directory doesn't exist, that's OK
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push({
          file: dirPath,
          message: `Failed to scan directory: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return { hooks, errors };
  }

  /**
   * Parse a hook markdown file
   */
  private parseHookFile(
    content: string,
    source: SkillSource,
    filePath: string
  ): { hook?: Hook; error?: HookLoadError } {
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      return {
        error: {
          file: filePath,
          message: 'Invalid format: missing YAML frontmatter',
        },
      };
    }

    const yamlContent = frontmatterMatch[1];
    const bodyContent = frontmatterMatch[2].trim();

    try {
      const frontmatter = this.parseYaml(yamlContent);

      // Validate required fields
      if (!frontmatter.name) {
        return {
          error: { file: filePath, message: 'Missing required field: name' },
        };
      }
      if (!frontmatter.description) {
        return {
          error: { file: filePath, message: 'Missing required field: description' },
        };
      }
      if (!frontmatter.event) {
        return {
          error: { file: filePath, message: 'Missing required field: event' },
        };
      }

      const event = parseHookEvent(frontmatter.event as string);
      if (!event) {
        return {
          error: { file: filePath, message: `Invalid event type: ${frontmatter.event}` },
        };
      }

      const hookFrontmatter: HookFrontmatter = {
        name: frontmatter.name as string,
        description: frontmatter.description as string,
        event,
        condition: frontmatter.condition as string | undefined,
        priority: frontmatter.priority as number | undefined,
        enabled: frontmatter.enabled as boolean | undefined,
      };

      const hook = createHook(hookFrontmatter, bodyContent, source, filePath);
      return { hook };
    } catch (err) {
      return {
        error: {
          file: filePath,
          message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  }

  /**
   * Simple YAML parser for frontmatter
   */
  private parseYaml(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;

      const key = trimmed.slice(0, colonIndex).trim();
      let value: string | boolean | number = trimmed.slice(colonIndex + 1).trim();

      // Remove quotes if present
      if (
        (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) ||
        (typeof value === 'string' && value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Parse booleans and numbers
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (typeof value === 'string' && !isNaN(Number(value))) {
        value = Number(value);
      }

      result[key] = value;
    }

    return result;
  }

  /**
   * Get cached scan result or perform new scan
   */
  async getHooks(): Promise<HookScanResult> {
    if (this.cachedResult) {
      return this.cachedResult;
    }
    return this.scanHooks();
  }

  /**
   * Convert scan result to ConfiguredHook arrays
   */
  toConfigured(result: HookScanResult): ConfiguredHook[] {
    return [
      ...result.personal.map(h => ({ ...h, enabled: h.enabled ?? true })),
      ...result.project.map(h => ({ ...h, enabled: h.enabled ?? true })),
    ];
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Setup file watchers for hook directories
   */
  private setupFileWatchers(): void {
    // Watch user hooks directory
    this.watchDirectory(this.getUserHooksDir());

    // Watch workspace hooks directory
    const workspaceHooksDir = this.getWorkspaceHooksDir();
    if (workspaceHooksDir) {
      this.watchDirectory(workspaceHooksDir);
    }

    // Watch for workspace folder changes
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        // Re-setup watchers when workspace changes
        this.disposeWatchers();
        this.setupFileWatchers();
        // Rescan hooks
        this.scanHooks().then(result => {
          this._onHooksChanged.fire(result);
        });
      })
    );
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(dirPath: string): void {
    try {
      const pattern = new vscode.RelativePattern(dirPath, `*${HOOK_FILE_EXT}`);
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Debounce handler to avoid multiple rapid updates
      let debounceTimer: NodeJS.Timeout | null = null;
      const handleChange = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(async () => {
          const result = await this.scanHooks();
          this._onHooksChanged.fire(result);
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
  // Dispose
  // ==========================================================================

  dispose(): void {
    this.disposeWatchers();
    this._onHooksChanged.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: HookFileService | null = null;

export function getHookFileService(): HookFileService {
  if (!instance) {
    instance = new HookFileService();
  }
  return instance;
}

export function disposeHookFileService(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
