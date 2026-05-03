import * as path from 'node:path';
import * as vm from 'node:vm';
import type { CompileResult, IHookCompiler } from './types';

export interface HookTransformOptions {
  loader: 'ts';
  format: 'cjs';
  target: 'node18';
  sourcemap: false;
  tsconfigRaw: {
    compilerOptions: {
      importsNotUsedAsValues: 'remove';
      verbatimModuleSyntax: false;
    };
  };
}

export interface HookTransformResult {
  code: string;
}

export type HookTransform = (
  content: string,
  options: HookTransformOptions,
) => Promise<HookTransformResult>;

export type HookRequireFn = ((id: string) => unknown) & {
  resolve?: (id: string) => string;
  cache?: unknown;
  extensions?: unknown;
  main?: unknown;
};

export interface HookSandboxModuleExecutorOptions {
  requireModule: HookRequireFn;
  allowedBuiltins?: readonly string[];
  packageStubs?: Readonly<Record<string, Record<string, unknown>>>;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: () => string;
  consoleRef?: Console;
  timers?: {
    setTimeout: typeof setTimeout;
    setInterval: typeof setInterval;
    clearTimeout: typeof clearTimeout;
    clearInterval: typeof clearInterval;
  };
}

export interface HookCompilerOptions extends HookSandboxModuleExecutorOptions {
  transform: HookTransform;
}

export const DEFAULT_HOOK_ALLOWED_BUILTINS = [
  'path',
  'util',
  'events',
  'stream',
  'buffer',
  'url',
  'querystring',
  'crypto',
] as const;

export const DEFAULT_HOOK_PACKAGE_STUBS: Readonly<Record<string, Record<string, unknown>>> = {
  '@neko/platform': {},
};

export const DEFAULT_HOOK_SANDBOX_TIMEOUT_MS = 5000;

export function buildHookTransformOptions(): HookTransformOptions {
  return {
    loader: 'ts',
    format: 'cjs',
    target: 'node18',
    sourcemap: false,
    tsconfigRaw: {
      compilerOptions: {
        importsNotUsedAsValues: 'remove',
        verbatimModuleSyntax: false,
      },
    },
  };
}

export function createHookCompiler(options: HookCompilerOptions): IHookCompiler {
  const executeModule = createHookSandboxModuleExecutor(options);

  return {
    compile: async (_filePath: string, content: string): Promise<CompileResult> => {
      try {
        const result = await options.transform(content, buildHookTransformOptions());
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
    },
    executeModule,
  };
}

export function createHookSandboxModuleExecutor(
  options: HookSandboxModuleExecutorOptions,
): IHookCompiler['executeModule'] {
  return (code: string, filename: string): Record<string, unknown> => {
    const exports: Record<string, unknown> = {};
    const module = { exports };
    const timers = options.timers ?? {
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
    };

    const sandbox = {
      exports,
      module,
      require: createSafeHookRequire(filename, options),
      console: options.consoleRef ?? console,
      setTimeout: timers.setTimeout,
      setInterval: timers.setInterval,
      clearTimeout: timers.clearTimeout,
      clearInterval: timers.clearInterval,
      __filename: filename,
      __dirname: path.dirname(filename),
      process: {
        env: options.env ?? process.env,
        cwd: options.cwd ?? (() => process.cwd()),
      },
    };

    try {
      vm.runInNewContext(code, sandbox, {
        filename,
        timeout: options.timeoutMs ?? DEFAULT_HOOK_SANDBOX_TIMEOUT_MS,
      });
    } catch (error) {
      throw new Error(`Failed to execute hook: ${formatHookRuntimeError(error)}`);
    }

    return module.exports as Record<string, unknown>;
  };
}

export function createSafeHookRequire(
  filename: string,
  options: HookSandboxModuleExecutorOptions,
): HookRequireFn {
  const hookDir = path.dirname(filename);
  const allowedBuiltins = new Set(options.allowedBuiltins ?? DEFAULT_HOOK_ALLOWED_BUILTINS);
  const packageStubs = options.packageStubs ?? DEFAULT_HOOK_PACKAGE_STUBS;

  const safeRequire = ((id: string): unknown => {
    if (id.startsWith('./') || id.startsWith('../')) {
      return options.requireModule(path.resolve(hookDir, id));
    }

    if (allowedBuiltins.has(id)) {
      return options.requireModule(id);
    }

    const stub = packageStubs[id];
    if (stub) {
      return stub;
    }

    throw new Error(
      `Module '${id}' is not allowed in hooks. Allowed: ${Array.from(allowedBuiltins).join(', ')}`,
    );
  }) as HookRequireFn;

  safeRequire.resolve = options.requireModule.resolve?.bind(options.requireModule);
  safeRequire.cache = options.requireModule.cache;
  safeRequire.extensions = options.requireModule.extensions;
  safeRequire.main = options.requireModule.main;

  return safeRequire;
}

function formatHookRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return String(error);
}
