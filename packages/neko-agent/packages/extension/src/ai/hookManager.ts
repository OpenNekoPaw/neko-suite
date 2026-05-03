/**
 * Hook Manager
 *
 * Manages custom hooks from .hook/ directory in VSCode extension context.
 * Provides esbuild-based TypeScript compilation and file watching.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  type IHookFileSystem,
  type LoadedHook,
  type HookLoadError,
  type ExecutorHooks,
  createHookCompiler,
  createProjectHookRuntimeManager,
  type HookRuntimeDisposable,
  type HookRuntimeManager,
} from '@neko/agent';
import { getLogger } from '../base';

const logger = getLogger('HookManager');

function createEsbuildHookCompiler() {
  let esbuild: typeof import('esbuild') | null = null;
  let loadError: Error | null = null;

  const loadEsbuild = async (): Promise<typeof import('esbuild')> => {
    if (loadError) {
      throw loadError;
    }

    if (!esbuild) {
      try {
        esbuild = await import('esbuild');
      } catch (error) {
        loadError = new Error(
          `Failed to load esbuild: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw loadError;
      }
    }

    return esbuild;
  };

  return createHookCompiler({
    transform: async (content, options) => {
      const loadedEsbuild = await loadEsbuild();
      const result = await loadedEsbuild.transform(content, options);
      return { code: result.code };
    },
    requireModule: require,
  });
}

// =============================================================================
// Node.js File System Implementation
// =============================================================================

/**
 * Create Node.js file system adapter for HookLoader
 */
function createNodeFileSystem(workspaceRoot: string): IHookFileSystem {
  return {
    exists: async (p: string): Promise<boolean> => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    },

    readDir: (p: string): Promise<string[]> => fs.readdir(p),

    readFile: (p: string): Promise<string> => fs.readFile(p, 'utf-8'),

    isDirectory: async (p: string): Promise<boolean> => {
      try {
        const stat = await fs.stat(p);
        return stat.isDirectory();
      } catch {
        return false;
      }
    },

    watch: (p: string, callback: (event: string, filename: string) => void) => {
      // Use VSCode's file system watcher for better performance
      const pattern = new vscode.RelativePattern(p, '**/*.{ts,js}');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      const handleChange = (uri: vscode.Uri) => {
        const relativePath = path.relative(p, uri.fsPath);
        callback('change', relativePath);
      };

      watcher.onDidChange(handleChange);
      watcher.onDidCreate(handleChange);
      watcher.onDidDelete(handleChange);

      return {
        close: () => watcher.dispose(),
      };
    },
  };
}

// =============================================================================
// Hook Manager
// =============================================================================

/**
 * Hook Manager - Manages custom hooks in VSCode extension
 *
 * Features:
 * - Loads hooks from .hook/ directory
 * - esbuild-based TypeScript compilation
 * - File watching with hot reload
 * - Error reporting
 *
 * @example
 * ```typescript
 * const manager = new HookManager(workspaceRoot);
 * await manager.initialize();
 *
 * const hooks = manager.getHooks();
 * // Use hooks with AgentExecutor
 * ```
 */
export class HookManager implements vscode.Disposable {
  private readonly runtime: HookRuntimeManager;
  private readonly runtimeReloadDisposable: HookRuntimeDisposable;

  private readonly _onDidReload = new vscode.EventEmitter<{
    hooks: LoadedHook[];
    errors: HookLoadError[];
  }>();

  /** Event fired when hooks are reloaded */
  readonly onDidReload = this._onDidReload.event;

  constructor(workspaceRoot: string) {
    this.runtime = createProjectHookRuntimeManager({
      workspaceRoot,
      fs: createNodeFileSystem(workspaceRoot),
      compiler: createEsbuildHookCompiler(),
      joinPath: path.join,
      logger,
    });
    this.runtimeReloadDisposable = this.runtime.onDidReload((event) => {
      this._onDidReload.fire({
        hooks: [...event.hooks],
        errors: [...event.errors],
      });
    });
  }

  /**
   * Initialize and load hooks
   */
  async initialize(): Promise<void> {
    await this.runtime.initialize();
  }

  /**
   * Get all loaded ExecutorHooks instances
   */
  getHooks(): ExecutorHooks[] {
    return this.runtime.getHooks();
  }

  /**
   * Get loaded hook metadata
   */
  getLoadedHooks(): LoadedHook[] {
    return this.runtime.getLoadedHooks();
  }

  /**
   * Get load errors
   */
  getErrors(): HookLoadError[] {
    return this.runtime.getErrors();
  }

  /**
   * Check if any hooks are loaded
   */
  hasHooks(): boolean {
    return this.runtime.hasHooks();
  }

  /**
   * Manually reload hooks
   */
  async reload(): Promise<void> {
    await this.runtime.reload();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.runtimeReloadDisposable.dispose();
    this.runtime.dispose();
    this._onDidReload.dispose();
  }
}

/**
 * Create a HookManager instance
 */
export function createHookManager(workspaceRoot: string): HookManager {
  return new HookManager(workspaceRoot);
}
