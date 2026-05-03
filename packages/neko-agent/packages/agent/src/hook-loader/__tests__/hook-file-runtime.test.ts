import { describe, expect, it, vi } from 'vitest';
import {
  HOOK_FILE_WATCH_DEBOUNCE_MS,
  createHookFileRuntime,
  type HookFileRuntimeFs,
} from '../hook-file-runtime';

function createFs(files: Record<string, string>): HookFileRuntimeFs {
  const dirs = new Set<string>();
  for (const filePath of Object.keys(files)) {
    const dirPath = filePath.slice(0, filePath.lastIndexOf('/'));
    dirs.add(dirPath);
  }

  return {
    mkdir: vi.fn(async (dirPath: string) => {
      dirs.add(dirPath);
    }),
    readdir: vi.fn(async (dirPath: string) => {
      if (!dirs.has(dirPath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      const prefix = `${dirPath}/`;
      return Object.keys(files)
        .filter((filePath) => filePath.startsWith(prefix))
        .map((filePath) => filePath.slice(prefix.length))
        .filter((name) => !name.includes('/'));
    }),
    stat: vi.fn(async (filePath: string) => ({
      isFile: () => Object.prototype.hasOwnProperty.call(files, filePath),
    })),
    readFile: vi.fn(async (filePath: string) => {
      const content = files[filePath];
      if (content === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return content;
    }),
  };
}

const pathAdapter = {
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
};

describe('HookFileRuntime', () => {
  it('resolves hook directories from injected home and workspace roots', () => {
    const runtime = createHookFileRuntime({
      fs: createFs({}),
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    expect(runtime.getUserHooksDir()).toBe('/home/neko/.neko/hooks');
    expect(runtime.getWorkspaceHooksDir()).toBe('/repo/.neko/hooks');
    expect(runtime.getWatchEntries()).toEqual([
      {
        dirPath: '/home/neko/.neko/hooks',
        watchPattern: '*.md',
        debounceMs: HOOK_FILE_WATCH_DEBOUNCE_MS,
      },
      {
        dirPath: '/repo/.neko/hooks',
        watchPattern: '*.md',
        debounceMs: HOOK_FILE_WATCH_DEBOUNCE_MS,
      },
    ]);
  });

  it('scans personal and project hook markdown files and caches the result', async () => {
    const fs = createFs({
      '/home/neko/.neko/hooks/personal.md': `---
name: personal
description: Personal hook
event: PreToolUse
---
echo personal`,
      '/repo/.neko/hooks/project.md': `---
name: project
description: Project hook
event: PostToolUse
enabled: false
---
echo project`,
      '/repo/.neko/hooks/ignore.txt': 'ignored',
    });
    const runtime = createHookFileRuntime({
      fs,
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    const result = await runtime.scanHooks();
    const cached = await runtime.getHooks();

    expect(result.personal.map((hook) => hook.name)).toEqual(['personal']);
    expect(result.project.map((hook) => hook.name)).toEqual(['project']);
    expect(result.errors).toEqual([]);
    expect(cached).toBe(result);
    expect(runtime.toConfigured(result).map((hook) => [hook.name, hook.enabled])).toEqual([
      ['personal', true],
      ['project', false],
    ]);
  });

  it('ignores missing hook directories but reports invalid hook files', async () => {
    const fs = createFs({
      '/home/neko/.neko/hooks/bad.md': 'not frontmatter',
    });
    const runtime = createHookFileRuntime({
      fs,
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    const result = await runtime.scanHooks();

    expect(result.personal).toEqual([]);
    expect(result.project).toEqual([]);
    expect(result.errors).toEqual([
      {
        file: '/home/neko/.neko/hooks/bad.md',
        message: 'Invalid format: missing YAML frontmatter',
      },
    ]);
  });

  it('logs non-EEXIST directory creation failures without failing scans', async () => {
    const fs = createFs({});
    vi.mocked(fs.mkdir).mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const logger = { warn: vi.fn() };
    const runtime = createHookFileRuntime({
      fs,
      path: pathAdapter,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
      logger,
    });

    await runtime.ensureDirectories();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to create directory: /home/neko/.neko/hooks',
      expect.any(Error),
    );
  });
});
