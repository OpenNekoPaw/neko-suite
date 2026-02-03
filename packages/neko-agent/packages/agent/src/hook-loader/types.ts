/**
 * Hook Loader Types
 *
 * Type definitions for custom hook loading system
 */

import type { ExecutorHooks } from '@uniedit/shared';

// =============================================================================
// Source Types
// =============================================================================

/**
 * Where the hook comes from
 */
export type HookSource = 'builtin' | 'project';

/**
 * Hook directory locations
 */
export const HOOK_DIRECTORIES = {
  /** Project-level hooks: .hook/ in project root */
  project: '.hook',
} as const;

// =============================================================================
// Hook Metadata
// =============================================================================

/**
 * Hook metadata (exported from HOOK.ts)
 *
 * @example
 * ```typescript
 * export const metadata: HookMetadata = {
 *   name: 'my-logging-hook',
 *   description: 'Logs all agent steps',
 *   enabled: true,
 *   priority: 50,
 * };
 * ```
 */
export interface HookMetadata {
  /** Hook name (required) */
  name: string;
  /** Description of what the hook does */
  description?: string;
  /** Whether the hook is enabled, defaults to true */
  enabled?: boolean;
  /** Execution priority, lower numbers execute first, defaults to 100 */
  priority?: number;
}

/**
 * Default hook metadata values
 */
export const DEFAULT_HOOK_METADATA: Required<Omit<HookMetadata, 'name'>> = {
  description: '',
  enabled: true,
  priority: 100,
};

// =============================================================================
// Loaded Hook
// =============================================================================

/**
 * A loaded and validated hook
 */
export interface LoadedHook {
  /** Hook metadata */
  metadata: HookMetadata;
  /** ExecutorHooks instance */
  hooks: ExecutorHooks;
  /** Source of the hook */
  source: HookSource;
  /** Directory path where hook was loaded from */
  directoryPath: string;
  /** Timestamp when hook was loaded */
  loadedAt: number;
}

// =============================================================================
// Loading Results
// =============================================================================

/**
 * Result of loading hooks from a directory
 */
export interface HookLoadResult {
  /** Successfully loaded hooks */
  hooks: LoadedHook[];
  /** Errors encountered during loading */
  errors: HookLoadError[];
}

/**
 * Error encountered while loading a hook
 */
export interface HookLoadError {
  /** File or directory path */
  file: string;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: string;
}

// =============================================================================
// File System Interface
// =============================================================================

/**
 * File system interface for hook loading
 * Allows dependency injection for testing and different environments
 */
export interface IHookFileSystem {
  /** Check if path exists */
  exists(path: string): Promise<boolean>;
  /** Read directory contents */
  readDir(path: string): Promise<string[]>;
  /** Read file contents as UTF-8 string */
  readFile(path: string): Promise<string>;
  /** Check if path is a directory */
  isDirectory(path: string): Promise<boolean>;
  /** Watch directory for changes (optional) */
  watch?(
    path: string,
    callback: (event: string, filename: string) => void
  ): { close(): void };
}

// =============================================================================
// Compilation Types
// =============================================================================

/**
 * Result of TypeScript compilation
 */
export interface CompileResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** Compiled JavaScript code */
  code?: string;
  /** Error message if compilation failed */
  error?: string;
}

/**
 * TypeScript compiler interface
 * Allows injection of different compilers (esbuild, swc, ts-node, etc.)
 */
export interface IHookCompiler {
  /**
   * Compile TypeScript content to JavaScript
   * @param filePath Original file path (for error reporting)
   * @param content TypeScript source code
   */
  compile(filePath: string, content: string): Promise<CompileResult>;

  /**
   * Execute compiled JavaScript and return module exports
   * @param code Compiled JavaScript code
   * @param filename Filename for error stack traces
   */
  executeModule(code: string, filename: string): Record<string, unknown>;
}

/**
 * Module exports from a compiled hook file
 */
export interface HookModuleExports {
  /** Hook metadata (required) */
  metadata?: HookMetadata;
  /** Factory function to create hook instance (recommended) */
  createHook?: () => ExecutorHooks;
  /** Default export as hook instance (alternative) */
  default?: ExecutorHooks;
}

// =============================================================================
// Hook Loader Options
// =============================================================================

/**
 * Options for HookLoader
 */
export interface HookLoaderOptions {
  /** File system implementation */
  fs: IHookFileSystem;
  /** TypeScript compiler implementation */
  compiler: IHookCompiler;
}
