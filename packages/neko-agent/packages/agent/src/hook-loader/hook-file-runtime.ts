import type {
  ConfiguredHook,
  Hook,
  HookLoadError,
  HookLoadResult,
  SkillSource,
} from '@neko/shared';
import {
  HOOK_MARKDOWN_FILE_EXTENSION,
  buildHookDirectoryScanError,
  buildHookFileReadError,
  parseHookMarkdownFile,
  shouldScanHookFile,
  toConfiguredHookCatalog,
  type HookFileScanResult,
} from './hook-file-projector';
import { resolvePersonalNekoContentDir, resolveProjectNekoContentDir } from '../workspace';

export const HOOK_FILE_WATCH_DEBOUNCE_MS = 300;

export interface HookFileWatchEntry {
  dirPath: string;
  watchPattern: string;
  debounceMs: number;
}

export interface HookFileRuntimeDirentLike {
  isFile(): boolean;
}

export interface HookFileRuntimeFs {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<HookFileRuntimeDirentLike>;
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

export interface HookFileRuntimePath {
  join(...parts: string[]): string;
}

export interface HookFileRuntimeLogger {
  warn(message: string, details?: unknown): void;
}

export interface HookFileRuntimeOptions {
  readonly fs: HookFileRuntimeFs;
  readonly path: HookFileRuntimePath;
  readonly homeDir: string;
  readonly getWorkspaceRoot?: () => string | null | undefined;
  readonly logger?: HookFileRuntimeLogger;
}

export interface HookFileRuntime {
  getUserHooksDir(): string;
  getWorkspaceHooksDir(): string | null;
  getWatchEntries(): readonly HookFileWatchEntry[];
  ensureDirectories(): Promise<void>;
  scanHooks(): Promise<HookFileScanResult>;
  getHooks(): Promise<HookFileScanResult>;
  toConfigured(result: HookFileScanResult): ConfiguredHook[];
}

export function createHookFileRuntime(options: HookFileRuntimeOptions): HookFileRuntime {
  return new DefaultHookFileRuntime(options);
}

class DefaultHookFileRuntime implements HookFileRuntime {
  private cachedResult: HookFileScanResult | null = null;

  constructor(private readonly options: HookFileRuntimeOptions) {}

  getUserHooksDir(): string {
    return resolvePersonalNekoContentDir(this.options.homeDir, 'hooks');
  }

  getWorkspaceHooksDir(): string | null {
    return resolveProjectNekoContentDir(this.getWorkspaceRoot(), 'hooks');
  }

  getWatchEntries(): readonly HookFileWatchEntry[] {
    const entries: HookFileWatchEntry[] = [
      {
        dirPath: this.getUserHooksDir(),
        watchPattern: `*${HOOK_MARKDOWN_FILE_EXTENSION}`,
        debounceMs: HOOK_FILE_WATCH_DEBOUNCE_MS,
      },
    ];

    const workspaceHooksDir = this.getWorkspaceHooksDir();
    if (workspaceHooksDir) {
      entries.push({
        dirPath: workspaceHooksDir,
        watchPattern: `*${HOOK_MARKDOWN_FILE_EXTENSION}`,
        debounceMs: HOOK_FILE_WATCH_DEBOUNCE_MS,
      });
    }

    return entries;
  }

  async ensureDirectories(): Promise<void> {
    await this.ensureDir(this.getUserHooksDir());

    const workspaceHooksDir = this.getWorkspaceHooksDir();
    if (workspaceHooksDir) {
      await this.ensureDir(workspaceHooksDir);
    }
  }

  async scanHooks(): Promise<HookFileScanResult> {
    const result: HookFileScanResult = {
      personal: [],
      project: [],
      errors: [],
    };

    await this.ensureDirectories();

    const personal = await this.loadFromDirectory(this.getUserHooksDir(), 'personal');
    result.personal = personal.hooks;
    result.errors.push(...personal.errors);

    const workspaceHooksDir = this.getWorkspaceHooksDir();
    if (workspaceHooksDir) {
      const project = await this.loadFromDirectory(workspaceHooksDir, 'project');
      result.project = project.hooks;
      result.errors.push(...project.errors);
    }

    this.cachedResult = result;
    return result;
  }

  async getHooks(): Promise<HookFileScanResult> {
    return this.cachedResult ?? this.scanHooks();
  }

  toConfigured(result: HookFileScanResult): ConfiguredHook[] {
    return toConfiguredHookCatalog(result);
  }

  private getWorkspaceRoot(): string | null {
    return this.options.getWorkspaceRoot?.() ?? null;
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await this.options.fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (getErrorCode(error) !== 'EEXIST') {
        this.options.logger?.warn(`Failed to create directory: ${dirPath}`, error);
      }
    }
  }

  private async loadFromDirectory(dirPath: string, source: SkillSource): Promise<HookLoadResult> {
    const hooks: Hook[] = [];
    const errors: HookLoadError[] = [];

    try {
      const files = await this.options.fs.readdir(dirPath);

      for (const file of files) {
        if (!shouldScanHookFile(file)) continue;

        const filePath = this.options.path.join(dirPath, file);
        try {
          const stat = await this.options.fs.stat(filePath);
          if (!stat.isFile()) continue;

          const parsed = parseHookMarkdownFile(
            await this.options.fs.readFile(filePath, 'utf-8'),
            source,
            filePath,
          );

          if (parsed.hook) {
            hooks.push(parsed.hook);
          }
          if (parsed.error) {
            errors.push(parsed.error);
          }
        } catch (error) {
          errors.push(buildHookFileReadError(filePath, error));
        }
      }
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        errors.push(buildHookDirectoryScanError(dirPath, error));
      }
    }

    return { hooks, errors };
  }
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}
