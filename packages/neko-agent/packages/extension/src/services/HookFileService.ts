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
import {
  createHookFileRuntime,
  type HookFileRuntime,
  type HookFileScanResult,
  type HookFileWatchEntry,
} from '@neko/agent';
import { getLogger } from '../base';

const logger = getLogger('HookFileService');

// =============================================================================
// Types
// =============================================================================

export type HookScanResult = HookFileScanResult;

// =============================================================================
// HookFileService
// =============================================================================

export class HookFileService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private readonly runtime: HookFileRuntime;

  // Event emitter for hook changes
  private readonly _onHooksChanged = new vscode.EventEmitter<HookScanResult>();
  readonly onHooksChanged = this._onHooksChanged.event;

  constructor() {
    this.runtime = createHookFileRuntime({
      fs,
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
        this.scanHooks().then((result) => {
          this._onHooksChanged.fire(result);
        });
      }),
    );
  }

  // ==========================================================================
  // Path Helpers
  // ==========================================================================

  /**
   * Get user hooks directory path (~/.neko/hooks/)
   */
  getUserHooksDir(): string {
    return this.runtime.getUserHooksDir();
  }

  /**
   * Get workspace hooks directory path (.neko/hooks/)
   */
  getWorkspaceHooksDir(): string | null {
    return this.runtime.getWorkspaceHooksDir();
  }

  private getWorkspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
  }

  // ==========================================================================
  // Directory Creation
  // ==========================================================================

  /**
   * Ensure all hook directories exist
   */
  async ensureDirectories(): Promise<void> {
    await this.runtime.ensureDirectories();
  }

  // ==========================================================================
  // Scanning
  // ==========================================================================

  /**
   * Scan and load all hooks from user and workspace directories
   */
  async scanHooks(): Promise<HookScanResult> {
    return this.runtime.scanHooks();
  }

  /**
   * Get cached scan result or perform new scan
   */
  async getHooks(): Promise<HookScanResult> {
    return this.runtime.getHooks();
  }

  /**
   * Convert scan result to ConfiguredHook arrays
   */
  toConfigured(result: HookScanResult) {
    return this.runtime.toConfigured(result);
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Setup file watchers for hook directories
   */
  private setupFileWatchers(): void {
    for (const entry of this.runtime.getWatchEntries()) {
      this.watchDirectory(entry);
    }
  }

  /**
   * Watch a directory for changes
   */
  private watchDirectory(entry: HookFileWatchEntry): void {
    try {
      const pattern = new vscode.RelativePattern(entry.dirPath, entry.watchPattern);
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
        }, entry.debounceMs);
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
      logger.warn(`Failed to watch directory: ${entry.dirPath}`, err);
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
