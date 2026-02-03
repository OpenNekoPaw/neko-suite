/**
 * Hook Manager
 *
 * Manages custom hooks from .hook/ directory in VSCode extension context.
 * Provides esbuild-based TypeScript compilation and file watching.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as vm from 'vm';
import {
  HookLoader,
  type IHookFileSystem,
  type IHookCompiler,
  type CompileResult,
  type LoadedHook,
  type HookLoadError,
  type ExecutorHooks,
  HOOK_DIRECTORIES,
} from '@uniedit/agent';

// =============================================================================
// esbuild Compiler Implementation
// =============================================================================

/**
 * esbuild-based TypeScript compiler for hooks
 */
class EsbuildHookCompiler implements IHookCompiler {
  private esbuild: typeof import('esbuild') | null = null;
  private loadError: Error | null = null;

  /**
   * Lazily load esbuild module
   */
  private async loadEsbuild(): Promise<typeof import('esbuild')> {
    if (this.loadError) {
      throw this.loadError;
    }

    if (!this.esbuild) {
      try {
        // Dynamic import esbuild
        this.esbuild = await import('esbuild');
      } catch (error) {
        this.loadError = new Error(
          `Failed to load esbuild: ${error instanceof Error ? error.message : String(error)}`
        );
        throw this.loadError;
      }
    }

    return this.esbuild;
  }

  /**
   * Compile TypeScript content to JavaScript
   */
  async compile(filePath: string, content: string): Promise<CompileResult> {
    try {
      const esbuild = await this.loadEsbuild();

      const result = await esbuild.transform(content, {
        loader: 'ts',
        format: 'cjs',
        target: 'node18',
        sourcemap: false,
        // Strip type imports since we can't resolve them at runtime
        tsconfigRaw: {
          compilerOptions: {
            importsNotUsedAsValues: 'remove',
            verbatimModuleSyntax: false,
          },
        },
      });

      return {
        success: true,
        code: result.code,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute compiled JavaScript and return module exports
   */
  executeModule(code: string, filename: string): Record<string, unknown> {
    const exports: Record<string, unknown> = {};
    const module = { exports };

    // Create a sandbox context for execution
    const sandbox = {
      exports,
      module,
      require: this.createSafeRequire(filename),
      console,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      __filename: filename,
      __dirname: path.dirname(filename),
      process: {
        env: process.env,
        cwd: () => process.cwd(),
      },
    };

    try {
      vm.runInNewContext(code, sandbox, {
        filename,
        timeout: 5000, // 5 second timeout for hook initialization
      });
    } catch (error) {
      throw new Error(
        `Failed to execute hook: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return module.exports as Record<string, unknown>;
  }

  /**
   * Create a safe require function that allows specific modules
   */
  private createSafeRequire(filename: string): NodeRequire {
    const baseRequire = require;
    const hookDir = path.dirname(filename);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeRequire = (id: string): any => {
      // Allow relative imports within the hook directory
      if (id.startsWith('./') || id.startsWith('../')) {
        const resolvedPath = path.resolve(hookDir, id);
        return baseRequire(resolvedPath);
      }

      // Allow specific Node.js built-ins
      const allowedBuiltins = [
        'path',
        'util',
        'events',
        'stream',
        'buffer',
        'url',
        'querystring',
        'crypto',
      ];

      if (allowedBuiltins.includes(id)) {
        return baseRequire(id);
      }

      // Allow @uniedit/platform types (they're stripped at runtime anyway)
      if (id === '@uniedit/platform') {
        // Return empty object - types are compile-time only
        return {};
      }

      // Block other requires for security
      throw new Error(
        `Module '${id}' is not allowed in hooks. Allowed: ${allowedBuiltins.join(', ')}`
      );
    };

    // Copy require properties
    safeRequire.resolve = baseRequire.resolve;
    safeRequire.cache = baseRequire.cache;
    safeRequire.extensions = baseRequire.extensions;
    safeRequire.main = baseRequire.main;

    return safeRequire as NodeRequire;
  }
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
  private loader: HookLoader;
  private loadedHooks: LoadedHook[] = [];
  private loadErrors: HookLoadError[] = [];
  private workspaceRoot: string;
  private initialized = false;

  private readonly _onDidReload = new vscode.EventEmitter<{
    hooks: LoadedHook[];
    errors: HookLoadError[];
  }>();

  /** Event fired when hooks are reloaded */
  readonly onDidReload = this._onDidReload.event;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;

    // Create HookLoader with Node.js implementations
    this.loader = new HookLoader({
      fs: createNodeFileSystem(workspaceRoot),
      compiler: new EsbuildHookCompiler(),
    });
  }

  /**
   * Initialize and load hooks
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const hookDir = path.join(this.workspaceRoot, HOOK_DIRECTORIES.project);

    try {
      const result = await this.loader.loadFromDirectory(hookDir);

      this.loadedHooks = result.hooks;
      this.loadErrors = result.errors;

      // Log results
      if (result.hooks.length > 0) {
        console.log(
          `[HookManager] Loaded ${result.hooks.length} hook(s):`,
          result.hooks.map((h) => h.metadata.name).join(', ')
        );
      }

      // Report errors
      for (const error of result.errors) {
        console.error(`[HookManager] Failed to load ${error.file}: ${error.message}`);
        if (error.details) {
          console.error(`  Details: ${error.details}`);
        }
      }

      // Start watching for changes
      this.loader.watchDirectory(hookDir, (hooks, errors) => {
        this.loadedHooks = hooks;
        this.loadErrors = errors;

        console.log(`[HookManager] Reloaded ${hooks.length} hook(s)`);

        // Fire reload event
        this._onDidReload.fire({ hooks, errors });
      });

      this.initialized = true;
    } catch (error) {
      console.error('[HookManager] Failed to initialize:', error);
      // Don't throw - allow extension to continue without custom hooks
    }
  }

  /**
   * Get all loaded ExecutorHooks instances
   */
  getHooks(): ExecutorHooks[] {
    return this.loadedHooks.map((h) => h.hooks);
  }

  /**
   * Get loaded hook metadata
   */
  getLoadedHooks(): LoadedHook[] {
    return [...this.loadedHooks];
  }

  /**
   * Get load errors
   */
  getErrors(): HookLoadError[] {
    return [...this.loadErrors];
  }

  /**
   * Check if any hooks are loaded
   */
  hasHooks(): boolean {
    return this.loadedHooks.length > 0;
  }

  /**
   * Manually reload hooks
   */
  async reload(): Promise<void> {
    const hookDir = path.join(this.workspaceRoot, HOOK_DIRECTORIES.project);

    this.loader.clearCache();
    const result = await this.loader.loadFromDirectory(hookDir);

    this.loadedHooks = result.hooks;
    this.loadErrors = result.errors;

    this._onDidReload.fire({ hooks: result.hooks, errors: result.errors });
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.loader.stopWatching();
    this._onDidReload.dispose();
  }
}

/**
 * Create a HookManager instance
 */
export function createHookManager(workspaceRoot: string): HookManager {
  return new HookManager(workspaceRoot);
}
