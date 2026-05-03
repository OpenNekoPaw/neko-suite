/**
 * Hook Loader Module
 *
 * Provides two hook loading mechanisms:
 *
 * 1. **Settings-based hooks** (Claude Code compatible) - Recommended
 *    Load from .neko/settings.json with JSON configuration
 *
 * 2. **Directory-based hooks** (Legacy)
 *    Load from .hook/ directory with TypeScript/JavaScript files
 *
 * @example Settings-based hooks (recommended)
 * ```typescript
 * import { SettingsHookLoader } from '@neko/agent';
 *
 * const loader = new SettingsHookLoader({
 *   fs: nodeFileSystem,
 *   shell: shellExecutor,
 * });
 *
 * await loader.loadFromSettings('.neko', '~/.neko/settings.json');
 * const result = await loader.executePreToolUse('Bash', { command: 'ls' });
 * ```
 *
 * @example Directory-based hooks (legacy)
 * ```typescript
 * import { HookLoader } from '@neko/agent';
 *
 * const loader = new HookLoader({
 *   fs: nodeFileSystem,
 *   compiler: esbuildCompiler,
 * });
 *
 * const result = await loader.loadFromDirectory('.hook');
 * const hooks = result.hooks.map(h => h.hooks);
 * ```
 */

// Types - Legacy
export type {
  HookSource,
  HookMetadata,
  LoadedHook,
  HookLoadResult,
  HookLoadError,
  IHookFileSystem,
  IHookCompiler,
  HookLoaderOptions,
  CompileResult,
  HookModuleExports,
} from './types';

export type {
  HookCompilerOptions,
  HookRequireFn,
  HookSandboxModuleExecutorOptions,
  HookTransform,
  HookTransformOptions,
  HookTransformResult,
} from './hook-runtime';

export type {
  HookRuntimeDisposable,
  HookRuntimeLoader,
  HookRuntimeLogger,
  HookRuntimeManagerOptions,
  HookRuntimeReloadEvent,
  HookRuntimeReloadListener,
  ProjectHookRuntimeManagerOptions,
} from './hook-runtime-manager';

export type {
  HookFileRuntime,
  HookFileRuntimeDirentLike,
  HookFileRuntimeFs,
  HookFileRuntimeLogger,
  HookFileRuntimeOptions,
  HookFileRuntimePath,
  HookFileWatchEntry,
} from './hook-file-runtime';

// Types - Settings-based
export type {
  SettingsHookLoaderOptions,
  ISettingsFileSystem,
  IShellExecutor,
  LoadedSettingsHook,
  SettingsHookLoadResult,
  HookExecutionResult,
} from './settings-hook-loader';

// Constants
export { HOOK_DIRECTORIES, DEFAULT_HOOK_METADATA } from './types';

// Markdown hook file projection
export {
  HOOK_MARKDOWN_FILE_EXTENSION,
  buildHookDirectoryScanError,
  buildHookFileReadError,
  parseHookMarkdownFile,
  parseSimpleHookYaml,
  shouldScanHookFile,
  toConfiguredHookCatalog,
  type HookFileParseResult,
  type HookFileScanResult,
} from './hook-file-projector';
export { HOOK_FILE_WATCH_DEBOUNCE_MS, createHookFileRuntime } from './hook-file-runtime';

// Main classes
export { HookLoader, createHookLoader } from './hook-loader';
export {
  HookRuntimeManager,
  createHookRuntimeManager,
  createProjectHookRuntimeManager,
} from './hook-runtime-manager';
export { SettingsHookLoader, createSettingsHookLoader } from './settings-hook-loader';
export {
  DEFAULT_HOOK_ALLOWED_BUILTINS,
  DEFAULT_HOOK_PACKAGE_STUBS,
  DEFAULT_HOOK_SANDBOX_TIMEOUT_MS,
  buildHookTransformOptions,
  createHookCompiler,
  createHookSandboxModuleExecutor,
  createSafeHookRequire,
} from './hook-runtime';
