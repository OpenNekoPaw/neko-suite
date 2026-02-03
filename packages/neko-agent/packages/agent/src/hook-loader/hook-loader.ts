/**
 * Hook Loader
 *
 * Loads custom ExecutorHooks from .hook/ directory
 */

import type { ExecutorHooks } from '@neko/shared';
import type {
  HookSource,
  HookMetadata,
  LoadedHook,
  HookLoadResult,
  HookLoadError,
  IHookFileSystem,
  IHookCompiler,
  HookLoaderOptions,
  HookModuleExports,
} from './types';
import { DEFAULT_HOOK_METADATA } from './types';

/**
 * HookLoader - Loads and manages custom hooks from filesystem
 *
 * Features:
 * - Scans .hook/ directory for hook definitions
 * - Compiles TypeScript to JavaScript using injected compiler
 * - Caches loaded hooks for performance
 * - Supports hot reload via file watching
 *
 * @example
 * ```typescript
 * const loader = new HookLoader({
 *   fs: nodeFs,
 *   compiler: esbuildCompiler,
 * });
 *
 * const result = await loader.loadFromDirectory('.hook');
 * console.log(`Loaded ${result.hooks.length} hooks`);
 * ```
 */
export class HookLoader {
  private fs: IHookFileSystem;
  private compiler: IHookCompiler;
  private cache: Map<string, LoadedHook> = new Map();
  private watcher?: { close(): void };

  constructor(options: HookLoaderOptions) {
    this.fs = options.fs;
    this.compiler = options.compiler;
  }

  /**
   * Load all hooks from a directory
   *
   * @param hookDir Path to hooks directory (e.g., '.hook')
   * @param source Source type for loaded hooks
   */
  async loadFromDirectory(
    hookDir: string,
    source: HookSource = 'project'
  ): Promise<HookLoadResult> {
    const result: HookLoadResult = {
      hooks: [],
      errors: [],
    };

    // Check if directory exists
    const exists = await this.fs.exists(hookDir);
    if (!exists) {
      return result;
    }

    // Read directory contents
    let entries: string[];
    try {
      entries = await this.fs.readDir(hookDir);
    } catch (error) {
      result.errors.push({
        file: hookDir,
        message: 'Failed to read hooks directory',
        details: error instanceof Error ? error.message : String(error),
      });
      return result;
    }

    // Process each entry
    for (const entry of entries) {
      // Skip hidden files and README
      if (entry.startsWith('.') || entry === 'README.md') {
        continue;
      }

      const entryPath = `${hookDir}/${entry}`;

      try {
        const isDir = await this.fs.isDirectory(entryPath);
        if (!isDir) {
          continue;
        }

        // Look for HOOK.ts in the directory
        const hookFilePath = `${entryPath}/HOOK.ts`;
        const hookExists = await this.fs.exists(hookFilePath);

        if (!hookExists) {
          // Try HOOK.js as fallback
          const jsHookPath = `${entryPath}/HOOK.js`;
          const jsExists = await this.fs.exists(jsHookPath);
          if (!jsExists) {
            continue;
          }
          // Load JS hook (no compilation needed)
          const hook = await this.loadHook(jsHookPath, entryPath, source, false);
          if (hook) {
            result.hooks.push(hook);
            this.cache.set(entryPath, hook);
          }
        } else {
          // Load TS hook (needs compilation)
          const hook = await this.loadHook(hookFilePath, entryPath, source, true);
          if (hook) {
            result.hooks.push(hook);
            this.cache.set(entryPath, hook);
          }
        }
      } catch (error) {
        result.errors.push({
          file: entryPath,
          message: 'Failed to load hook',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Sort by priority (lower numbers first)
    result.hooks.sort(
      (a, b) =>
        (a.metadata.priority ?? DEFAULT_HOOK_METADATA.priority) -
        (b.metadata.priority ?? DEFAULT_HOOK_METADATA.priority)
    );

    return result;
  }

  /**
   * Load a single hook from file
   *
   * @param filePath Path to HOOK.ts or HOOK.js file
   * @param directoryPath Parent directory path
   * @param source Source type
   * @param needsCompilation Whether to compile TypeScript
   */
  async loadHook(
    filePath: string,
    directoryPath: string,
    source: HookSource,
    needsCompilation: boolean
  ): Promise<LoadedHook | null> {
    // Read file content
    const content = await this.fs.readFile(filePath);

    let code: string;

    if (needsCompilation) {
      // Compile TypeScript
      const compileResult = await this.compiler.compile(filePath, content);
      if (!compileResult.success || !compileResult.code) {
        throw new Error(`Compilation failed: ${compileResult.error}`);
      }
      code = compileResult.code;
    } else {
      // Use JavaScript directly
      code = content;
    }

    // Execute and get exports
    const exports = this.compiler.executeModule(
      code,
      filePath
    ) as HookModuleExports;

    // Validate exports
    const metadata = exports.metadata;
    const createHook = exports.createHook;
    const defaultExport = exports.default;

    if (!metadata?.name) {
      throw new Error(
        'Hook must export metadata with name. Example: export const metadata = { name: "my-hook" };'
      );
    }

    // Get hook instance
    let hooks: ExecutorHooks;

    if (typeof createHook === 'function') {
      // Preferred: factory function
      hooks = createHook();
    } else if (defaultExport && typeof (defaultExport as ExecutorHooks).name === 'string') {
      // Alternative: default export
      hooks = defaultExport as ExecutorHooks;
    } else {
      throw new Error(
        'Hook must export createHook() function or default ExecutorHooks instance'
      );
    }

    // Ensure hook has a name property
    if (!hooks.name) {
      hooks.name = metadata.name;
    }

    // Check if enabled
    if (metadata.enabled === false) {
      return null;
    }

    return {
      metadata: {
        ...DEFAULT_HOOK_METADATA,
        ...metadata,
      },
      hooks,
      source,
      directoryPath,
      loadedAt: Date.now(),
    };
  }

  /**
   * Watch directory for changes and reload hooks
   *
   * @param hookDir Directory to watch
   * @param onReload Callback when hooks are reloaded
   */
  watchDirectory(
    hookDir: string,
    onReload: (hooks: LoadedHook[], errors: HookLoadError[]) => void
  ): void {
    if (!this.fs.watch) {
      console.warn('[HookLoader] File watching not supported by filesystem implementation');
      return;
    }

    // Debounce reload to avoid multiple reloads for batch changes
    let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
    const debounceMs = 300;

    this.watcher = this.fs.watch(hookDir, async (event, filename) => {
      // Only reload for .ts or .js file changes
      if (filename && (filename.endsWith('.ts') || filename.endsWith('.js'))) {
        // Clear existing timeout
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }

        // Schedule reload
        reloadTimeout = setTimeout(async () => {
          try {
            // Clear cache before reload
            this.cache.clear();

            // Reload all hooks
            const result = await this.loadFromDirectory(hookDir);
            onReload(result.hooks, result.errors);
          } catch (error) {
            console.error('[HookLoader] Failed to reload hooks:', error);
            onReload([], [
              {
                file: hookDir,
                message: 'Failed to reload hooks',
                details: error instanceof Error ? error.message : String(error),
              },
            ]);
          }
        }, debounceMs);
      }
    });
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * Get all cached hooks
   */
  getCachedHooks(): LoadedHook[] {
    return Array.from(this.cache.values());
  }

  /**
   * Clear hook cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get ExecutorHooks instances from loaded hooks
   */
  getExecutorHooks(): ExecutorHooks[] {
    return this.getCachedHooks().map((h) => h.hooks);
  }
}

/**
 * Create a HookLoader with provided options
 */
export function createHookLoader(options: HookLoaderOptions): HookLoader {
  return new HookLoader(options);
}
