import { describe, expect, it, vi } from 'vitest';
import {
  buildHookTransformOptions,
  createHookCompiler,
  createHookSandboxModuleExecutor,
  createSafeHookRequire,
} from '../hook-runtime';

describe('hook-runtime', () => {
  it('builds the canonical TypeScript transform options', () => {
    expect(buildHookTransformOptions()).toEqual({
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
    });
  });

  it('compiles using the injected transform and reports transform errors', async () => {
    const transform = vi.fn(async () => ({ code: 'module.exports = {};' }));
    const compiler = createHookCompiler({
      transform,
      requireModule: createRequireStub(),
    });

    await expect(
      compiler.compile('/repo/.hook/a/HOOK.ts', 'export const metadata = {}'),
    ).resolves.toEqual({
      success: true,
      code: 'module.exports = {};',
    });
    expect(transform).toHaveBeenCalledWith(
      'export const metadata = {}',
      buildHookTransformOptions(),
    );

    const failing = createHookCompiler({
      transform: async () => {
        throw new Error('bad ts');
      },
      requireModule: createRequireStub(),
    });
    await expect(failing.compile('/repo/.hook/a/HOOK.ts', 'bad')).resolves.toEqual({
      success: false,
      error: 'bad ts',
    });
  });

  it('executes hook modules in a constrained sandbox', () => {
    const executeModule = createHookSandboxModuleExecutor({
      requireModule: createRequireStub({
        path: { basename: (value: string) => value.split('/').pop() },
        '/repo/.hook/demo/local': { value: 42 },
      }),
      env: { TEST_ENV: 'ok' },
      cwd: () => '/repo',
    });

    const exports = executeModule(
      `
      const path = require('path');
      const local = require('./local');
      const platform = require('@neko/platform');
      module.exports = {
        metadata: { name: path.basename(__dirname) },
        localValue: local.value,
        platformKeys: Object.keys(platform).length,
        env: process.env.TEST_ENV,
        cwd: process.cwd(),
      };
      `,
      '/repo/.hook/demo/HOOK.js',
    );

    expect(exports).toEqual({
      metadata: { name: 'demo' },
      localValue: 42,
      platformKeys: 0,
      env: 'ok',
      cwd: '/repo',
    });
  });

  it('rejects unknown modules before hook code can import them', () => {
    const safeRequire = createSafeHookRequire('/repo/.hook/demo/HOOK.js', {
      requireModule: createRequireStub(),
    });

    expect(() => safeRequire('fs')).toThrow(
      "Module 'fs' is not allowed in hooks. Allowed: path, util, events, stream, buffer, url, querystring, crypto",
    );
  });

  it('wraps sandbox execution errors with hook context', () => {
    const executeModule = createHookSandboxModuleExecutor({
      requireModule: createRequireStub(),
    });

    expect(() => executeModule('throw new Error("boom")', '/repo/.hook/demo/HOOK.js')).toThrow(
      'Failed to execute hook: boom',
    );
  });
});

function createRequireStub(modules: Record<string, unknown> = {}): NodeRequire {
  const requireModule = ((id: string): unknown => {
    if (id in modules) {
      return modules[id];
    }
    throw new Error(`missing module: ${id}`);
  }) as NodeRequire;

  requireModule.resolve = ((id: string) => id) as NodeRequire['resolve'];
  requireModule.cache = {};
  requireModule.extensions = {};
  requireModule.main = undefined;
  return requireModule;
}
