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

// Main classes
export { HookLoader, createHookLoader } from './hook-loader';
export { SettingsHookLoader, createSettingsHookLoader } from './settings-hook-loader';
