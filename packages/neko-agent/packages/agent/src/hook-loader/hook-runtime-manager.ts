import type { ExecutorHooks } from '@neko/shared';
import { HookLoader } from './hook-loader';
import { HOOK_DIRECTORIES } from './types';
import type {
  HookLoadError,
  HookLoadResult,
  IHookCompiler,
  IHookFileSystem,
  LoadedHook,
} from './types';

export interface HookRuntimeLogger {
  info(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface HookRuntimeReloadEvent {
  readonly hooks: readonly LoadedHook[];
  readonly errors: readonly HookLoadError[];
}

export interface HookRuntimeDisposable {
  dispose(): void;
}

export type HookRuntimeReloadListener = (event: HookRuntimeReloadEvent) => void;

export interface HookRuntimeLoader {
  loadFromDirectory(hookDir: string): Promise<HookLoadResult>;
  watchDirectory(
    hookDir: string,
    onReload: (hooks: LoadedHook[], errors: HookLoadError[]) => void,
  ): void;
  clearCache(): void;
  stopWatching(): void;
}

export interface HookRuntimeManagerOptions {
  readonly hookDirectory: string;
  readonly loader: HookRuntimeLoader;
  readonly logger?: HookRuntimeLogger;
}

export interface ProjectHookRuntimeManagerOptions {
  readonly workspaceRoot: string;
  readonly fs: IHookFileSystem;
  readonly compiler: IHookCompiler;
  readonly logger?: HookRuntimeLogger;
  readonly joinPath?: (base: string, child: string) => string;
}

export class HookRuntimeManager {
  private loadedHooks: LoadedHook[] = [];
  private loadErrors: HookLoadError[] = [];
  private initialized = false;
  private readonly listeners = new Set<HookRuntimeReloadListener>();

  constructor(private readonly options: HookRuntimeManagerOptions) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const result = await this.options.loader.loadFromDirectory(this.options.hookDirectory);
      this.applyLoadResult(result);
      this.logLoadResult(result);

      this.options.loader.watchDirectory(this.options.hookDirectory, (hooks, errors) => {
        this.loadedHooks = [...hooks];
        this.loadErrors = [...errors];
        this.options.logger?.info(`Reloaded ${hooks.length} hook(s)`);
        this.emitReload();
      });

      this.initialized = true;
    } catch (error) {
      this.options.logger?.error('Failed to initialize:', error);
    }
  }

  getHooks(): ExecutorHooks[] {
    return this.loadedHooks.map((hook) => hook.hooks);
  }

  getLoadedHooks(): LoadedHook[] {
    return [...this.loadedHooks];
  }

  getErrors(): HookLoadError[] {
    return [...this.loadErrors];
  }

  hasHooks(): boolean {
    return this.loadedHooks.length > 0;
  }

  async reload(): Promise<void> {
    this.options.loader.clearCache();
    const result = await this.options.loader.loadFromDirectory(this.options.hookDirectory);
    this.applyLoadResult(result);
    this.emitReload();
  }

  onDidReload(listener: HookRuntimeReloadListener): HookRuntimeDisposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  dispose(): void {
    this.options.loader.stopWatching();
    this.listeners.clear();
  }

  private applyLoadResult(result: HookLoadResult): void {
    this.loadedHooks = [...result.hooks];
    this.loadErrors = [...result.errors];
  }

  private logLoadResult(result: HookLoadResult): void {
    if (result.hooks.length > 0) {
      this.options.logger?.info(
        `Loaded ${result.hooks.length} hook(s): ${result.hooks.map((hook) => hook.metadata.name).join(', ')}`,
      );
    }

    for (const error of result.errors) {
      this.options.logger?.error(`Failed to load ${error.file}: ${error.message}`);
      if (error.details) {
        this.options.logger?.error(`  Details: ${error.details}`);
      }
    }
  }

  private emitReload(): void {
    const event: HookRuntimeReloadEvent = {
      hooks: this.getLoadedHooks(),
      errors: this.getErrors(),
    };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export function createHookRuntimeManager(options: HookRuntimeManagerOptions): HookRuntimeManager {
  return new HookRuntimeManager(options);
}

export function createProjectHookRuntimeManager(
  options: ProjectHookRuntimeManagerOptions,
): HookRuntimeManager {
  const joinPath = options.joinPath ?? joinPathWithSlash;
  return createHookRuntimeManager({
    hookDirectory: joinPath(options.workspaceRoot, HOOK_DIRECTORIES.project),
    loader: new HookLoader({
      fs: options.fs,
      compiler: options.compiler,
    }),
    logger: options.logger,
  });
}

function joinPathWithSlash(base: string, child: string): string {
  return `${base.replace(/\/+$/, '')}/${child}`;
}
