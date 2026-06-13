/**
 * Hook Loader Module
 *
 * Provides current hook loading mechanisms:
 * - Settings-based shell hooks from .neko/settings.json
 * - Markdown hook catalog files from .neko/hooks/*.md
 *
 * @example Settings-based hooks
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
 */

export type { HookLoadError } from '@neko/shared';

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

// Settings hook execution
export { SettingsHookLoader, createSettingsHookLoader } from './settings-hook-loader';
