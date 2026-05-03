import { describe, expect, it, vi } from 'vitest';
import {
  SKILL_FILE_WATCH_DEBOUNCE_MS,
  SKILL_PATH_TRIGGER_DEBOUNCE_MS,
  createSkillFileRuntime,
  type SkillFileRuntimeFs,
} from '../skill-file-runtime';
import type { Skill, SkillSource, SlashCommand } from '@neko/shared';
import type { SkillFileRuntimeLoader } from '../skill-file-runtime';

const pathAdapter = {
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
};

describe('SkillFileRuntime', () => {
  it('resolves scan and watch entries from injected home/workspace roots', () => {
    const runtime = createSkillFileRuntime({
      fs: createFs({}),
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    expect(runtime.getUserSkillsDir()).toBe('/home/neko/.neko/skills');
    expect(runtime.getUserCommandsDir()).toBe('/home/neko/.neko/commands');
    expect(runtime.getWorkspaceSkillsDir()).toBe('/repo/.neko/skills');
    expect(runtime.getWorkspaceCommandsDir()).toBe('/repo/.neko/commands');
    expect(runtime.getWatchEntries().map((entry) => [entry.dirPath, entry.watchPattern])).toEqual([
      ['/home/neko/.neko/skills', '**/*.md'],
      ['/home/neko/.neko/commands', '*.md'],
      ['/repo/.neko/skills', '**/*.md'],
      ['/repo/.neko/commands', '*.md'],
    ]);
    expect(SKILL_FILE_WATCH_DEBOUNCE_MS).toBe(300);
    expect(SKILL_PATH_TRIGGER_DEBOUNCE_MS).toBe(300);
  });

  it('scans full skills into cache and resolves path triggers from cached skills', async () => {
    const loader = createLoader({
      loadFromDirectory: async (dirPath, source) => ({
        skills: dirPath.endsWith('/skills') ? [makeSkill(`${source}-skill`, source)] : [],
        commands: dirPath.endsWith('/commands') ? [makeCommand(`${source}-cmd`, source)] : [],
        errors: [],
      }),
    });
    const runtime = createSkillFileRuntime({
      fs: createFs({}),
      path: pathAdapter,
      loader,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    const result = await runtime.scanSkills();
    const cached = await runtime.getSkills();

    expect(result.personal.skills.map((skill) => skill.name)).toEqual(['personal-skill']);
    expect(result.project.commands.map((command) => command.command)).toEqual(['project-cmd']);
    expect(cached).toBe(result);
    expect(runtime.resolvePathTriggers('/repo/src/app.ts')).toEqual([
      { skillName: 'personal-skill', filePath: 'src/app.ts' },
      { skillName: 'project-skill', filePath: 'src/app.ts' },
    ]);
  });

  it('returns a lazy scan failure result when loader throws', async () => {
    const runtime = createSkillFileRuntime({
      fs: createFs({}),
      path: pathAdapter,
      loader: createLoader({
        loadLazyFromDirectory: async () => {
          throw new Error('denied');
        },
      }),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    const result = await runtime.scanSkillsLazy();

    expect(result.errors).toEqual([
      { file: '/home/neko/.neko/skills', message: 'Failed to lazy-load: denied' },
      { file: '/home/neko/.neko/commands', message: 'Failed to lazy-load: denied' },
    ]);
  });

  it('creates skill and command files idempotently', async () => {
    const fs = createFs({});
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    const skillPath = await runtime.createSkillFile({
      skillName: 'review',
      source: 'personal',
      description: 'Review helper.',
    });
    const commandPath = await runtime.createCommandFile({
      commandName: 'commit',
      source: 'personal',
      content: 'custom command',
    });

    expect(skillPath).toBe('/home/neko/.neko/skills/review/SKILL.md');
    expect(commandPath).toBe('/home/neko/.neko/commands/commit.md');
    expect(fs.readText(skillPath)).toContain('description: "Review helper."');
    expect(fs.readText(commandPath)).toBe('custom command');
    expect(await runtime.createSkillFile({ skillName: 'review', source: 'personal' })).toBe(
      skillPath,
    );
  });

  it('duplicates skill directories with support files and normalizes copied SKILL.md', async () => {
    const fs = createFs({
      '/source/SKILL.md': `---
name: "source"
enabled: false
description: "Copied"
---

Body`,
      '/source/references/ref.md': 'reference',
      '/source/node_modules/ignored.md': 'ignored',
    });
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    const copiedDir = await runtime.duplicateSkillDirectory({
      sourceDir: '/source',
      newSkillName: 'copy',
      targetSource: 'personal',
    });

    expect(copiedDir).toBe('/home/neko/.neko/skills/copy');
    expect(fs.readText('/home/neko/.neko/skills/copy/SKILL.md')).toContain('name: "copy"');
    expect(fs.readText('/home/neko/.neko/skills/copy/SKILL.md')).not.toContain('enabled: false');
    expect(fs.readText('/home/neko/.neko/skills/copy/references/ref.md')).toBe('reference');
    expect(fs.has('/home/neko/.neko/skills/copy/node_modules/ignored.md')).toBe(false);
  });

  it('deletes skill directories and command files through runtime fs operations', async () => {
    const fs = createFs({
      '/home/neko/.neko/skills/review/SKILL.md': 'skill',
      '/home/neko/.neko/commands/commit.md': 'command',
    });
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    expect(await runtime.deleteSkillDirectory({ skillName: 'review', source: 'personal' })).toBe(
      true,
    );
    expect(await runtime.deleteCommandFile({ commandName: 'commit', source: 'personal' })).toBe(
      true,
    );
    expect(await runtime.deleteSkillDirectory({ skillName: 'missing', source: 'personal' })).toBe(
      false,
    );
    expect(fs.has('/home/neko/.neko/skills/review/SKILL.md')).toBe(false);
    expect(fs.has('/home/neko/.neko/commands/commit.md')).toBe(false);
  });
});

interface TestFs extends SkillFileRuntimeFs {
  has(filePath: string): boolean;
  readText(filePath: string): string;
}

function createFs(initialFiles: Record<string, string>): TestFs {
  const files = new Map(Object.entries(initialFiles));
  const dirs = new Set<string>();

  for (const filePath of files.keys()) {
    addParentDirs(dirs, filePath);
  }

  const fs: TestFs = {
    mkdir: vi.fn(async (dirPath: string) => {
      addDirRecursive(dirs, dirPath);
    }),
    access: vi.fn(async (targetPath: string) => {
      if (!files.has(targetPath) && !dirs.has(targetPath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      addParentDirs(dirs, filePath);
      files.set(filePath, content);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return content;
    }),
    rm: vi.fn(async (dirPath: string) => {
      for (const filePath of [...files.keys()]) {
        if (filePath === dirPath || filePath.startsWith(`${dirPath}/`)) {
          files.delete(filePath);
        }
      }
      for (const knownDir of [...dirs]) {
        if (knownDir === dirPath || knownDir.startsWith(`${dirPath}/`)) {
          dirs.delete(knownDir);
        }
      }
    }),
    unlink: vi.fn(async (filePath: string) => {
      if (!files.delete(filePath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    }),
    readdir: vi.fn(async (dirPath: string) => {
      if (!dirs.has(dirPath)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }

      const childNames = new Set<string>();
      const prefix = `${dirPath}/`;
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        childNames.add(filePath.slice(prefix.length).split('/')[0] ?? '');
      }
      for (const knownDir of dirs) {
        if (!knownDir.startsWith(prefix)) continue;
        childNames.add(knownDir.slice(prefix.length).split('/')[0] ?? '');
      }

      return [...childNames].filter(Boolean).map((name) => ({
        name,
        isDirectory: () => dirs.has(`${dirPath}/${name}`),
      }));
    }),
    copyFile: vi.fn(async (src: string, dest: string) => {
      const content = files.get(src);
      if (content === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      addParentDirs(dirs, dest);
      files.set(dest, content);
    }),
    has: (filePath: string) => files.has(filePath) || dirs.has(filePath),
    readText: (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`Missing file: ${filePath}`);
      }
      return content;
    },
  };

  return fs;
}

function createLoader(overrides: Partial<SkillFileRuntimeLoader> = {}): SkillFileRuntimeLoader {
  return {
    loadFromDirectory: async () => ({ skills: [], commands: [], errors: [] }),
    loadLazyFromDirectory: async () => ({ skills: [], commands: [], errors: [] }),
    ...overrides,
  };
}

function makeSkill(name: string, source: SkillSource): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} content`,
    source,
    directoryPath: `/${name}`,
    paths: ['src/**/*.ts'],
    allowedTools: [],
    enabled: true,
  };
}

function makeCommand(command: string, source: SkillSource): SlashCommand {
  return {
    command,
    description: `${command} description`,
    content: `${command} content`,
    source,
    filePath: `/${command}.md`,
    allowedTools: [],
    enabled: true,
  };
}

function addParentDirs(dirs: Set<string>, filePath: string): void {
  const parent = filePath.slice(0, filePath.lastIndexOf('/'));
  addDirRecursive(dirs, parent);
}

function addDirRecursive(dirs: Set<string>, dirPath: string): void {
  if (!dirPath || dirPath === '/') {
    return;
  }
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    dirs.add(current);
  }
}
