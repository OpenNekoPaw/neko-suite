import type { Skill, SkillSource, SlashCommand } from '@neko/shared';
import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  CreateSkillError,
  SKILL_FILE_WATCH_DEBOUNCE_MS,
  SKILL_PATH_TRIGGER_DEBOUNCE_MS,
  createSkillFileRuntime,
  type SkillFileRuntimeFs,
  type SkillFileRuntimeLoader,
} from '../skill-file-runtime';

const pathAdapter = {
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
  dirname: (filePath: string) => {
    const index = filePath.lastIndexOf('/');
    return index <= 0 ? '/' : filePath.slice(0, index);
  },
};

describe('SkillFileRuntime', () => {
  it('uses canonical Agent Skill roots while keeping command roots under .neko', () => {
    const runtime = createSkillFileRuntime({
      fs: createFs(),
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    expect(runtime.getUserSkillsDir()).toBe('/home/neko/.agents/skills');
    expect(runtime.getUserCommandsDir()).toBe('/home/neko/.neko/commands');
    expect(runtime.getWorkspaceSkillsDir()).toBe('/repo/.agents/skills');
    expect(runtime.getWorkspaceCommandsDir()).toBe('/repo/.neko/commands');
    expect(runtime.getWatchEntries().map((entry) => [entry.dirPath, entry.watchPattern])).toEqual([
      ['/home/neko/.agents/skills', '**/*'],
      ['/home/neko/.neko/commands', '*.md'],
      ['/repo/.agents/skills', '**/*'],
      ['/repo/.neko/commands', '*.md'],
    ]);
    expect(SKILL_FILE_WATCH_DEBOUNCE_MS).toBe(300);
    expect(SKILL_PATH_TRIGGER_DEBOUNCE_MS).toBe(300);
  });

  it('never sends a poisoned legacy Skill root to the normal loader', async () => {
    const loadedDirectories: string[] = [];
    const runtime = createSkillFileRuntime({
      fs: createFs({
        '/home/neko/.neko/skills/poison/SKILL.md': 'legacy poison',
      }),
      path: pathAdapter,
      loader: createLoader({
        loadFromDirectory: async (dirPath) => {
          loadedDirectories.push(dirPath);
          if (dirPath.includes('/.neko/skills')) {
            throw new Error('legacy root was reached');
          }
          return { skills: [], commands: [], errors: [] };
        },
      }),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    await expect(runtime.scanSkills()).resolves.toMatchObject({ errors: [] });
    expect(loadedDirectories).toEqual(['/home/neko/.agents/skills', '/home/neko/.neko/commands']);
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
      fs: createFs(),
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

  it('returns canonical lazy scan failures without consulting legacy Skill roots', async () => {
    const runtime = createSkillFileRuntime({
      fs: createFs(),
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
      { file: '/home/neko/.agents/skills', message: 'Failed to lazy-load: denied' },
      { file: '/home/neko/.neko/commands', message: 'Failed to lazy-load: denied' },
    ]);
  });

  it('atomically creates a complete Skill package and rescans the shared runtime', async () => {
    const fs = createFs();
    const loader = createLoader();
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader,
      homeDir: '/home/neko',
      getWorkspaceRoot: () => '/repo',
    });

    const result = await runtime.createSkill({
      target: 'project',
      skill: {
        name: 'review-pr',
        description: 'Review pull requests when correctness evidence is required.',
        body: '# Review pull requests\n\nUse repository evidence.',
        license: 'MIT',
        compatibility: 'Requires a readable Git workspace.',
        metadata: { owner: 'team' },
        allowedTools: ['Read', 'Search'],
      },
      resources: [
        { path: 'references/checklist.md', encoding: 'utf8', content: '# Checklist' },
        { path: 'assets/icon.bin', encoding: 'base64', content: 'AQID' },
        { path: 'agents/openai.yaml', encoding: 'utf8', content: 'interface: {}\n' },
      ],
      neko: {
        schemaVersion: 1,
        interface: { displayName: 'Review PR' },
      },
    });

    expect(result).toMatchObject({
      source: 'project',
      rootId: 'project-agent-skills',
      relativePath: 'review-pr',
      absolutePath: '/repo/.agents/skills/review-pr',
      diagnostics: [],
    });
    expect(result.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fs.readText('/repo/.agents/skills/review-pr/SKILL.md')).toContain('name: review-pr');
    expect(fs.readText('/repo/.agents/skills/review-pr/SKILL.md')).toContain(
      'Use repository evidence.',
    );
    expect(fs.readText('/repo/.agents/skills/review-pr/references/checklist.md')).toBe(
      '# Checklist',
    );
    expect(fs.readBytes('/repo/.agents/skills/review-pr/assets/icon.bin')).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fs.readText('/repo/.agents/skills/review-pr/agents/openai.yaml')).toBe(
      'interface: {}\n',
    );
    expect(fs.readText('/repo/.agents/skills/review-pr/agents/neko.yaml')).toContain(
      'schema_version: 1',
    );
    expect(fs.has('/repo/.agents/skills/review-pr/manifest.json')).toBe(false);
    expect(fs.listPaths().some((filePath) => filePath.includes('.review-pr.tmp-'))).toBe(false);
    expect(loader.loadFromDirectory).toHaveBeenCalledWith('/repo/.agents/skills', 'project');
  });

  it('does not write empty overlays, manifests, or placeholder directories', async () => {
    const fs = createFs();
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
      getWorkspaceRoot: () => null,
    });

    await runtime.createSkill({
      target: 'personal',
      skill: {
        name: 'minimal-skill',
        description: 'Use this Skill for focused minimal tasks.',
        body: 'Follow the requested task.',
      },
      neko: { schemaVersion: 1 },
    });

    const root = '/home/neko/.agents/skills/minimal-skill';
    expect(fs.has(`${root}/SKILL.md`)).toBe(true);
    expect(fs.has(`${root}/agents/neko.yaml`)).toBe(false);
    expect(fs.has(`${root}/manifest.json`)).toBe(false);
    expect(fs.has(`${root}/scripts`)).toBe(false);
    expect(fs.has(`${root}/references`)).toBe(false);
    expect(fs.has(`${root}/assets`)).toBe(false);
  });

  it.each([
    ['../escape.md', 'invalid-resource-path'],
    ['/tmp/escape.md', 'invalid-resource-path'],
    ['SKILL.md', 'reserved-resource-path'],
    ['manifest.json', 'reserved-resource-path'],
    ['agents/neko.yaml', 'reserved-resource-path'],
  ] as const)(
    'rejects resource path %s before creating temporary state',
    async (resourcePath, code) => {
      const fs = createFs();
      const runtime = createSkillFileRuntime({
        fs,
        path: pathAdapter,
        loader: createLoader(),
        homeDir: '/home/neko',
      });

      const creation = runtime.createSkill({
        target: 'personal',
        skill: validSkill('unsafe-skill'),
        resources: [{ path: resourcePath, encoding: 'utf8', content: 'unsafe' }],
      });

      await expect(creation).rejects.toMatchObject({ code });
      expect(fs.listPaths().some((filePath) => filePath.includes('unsafe-skill'))).toBe(false);
    },
  );

  it('rejects parent and child resource file collisions before creating temporary state', async () => {
    const fs = createFs();
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    const creation = runtime.createSkill({
      target: 'personal',
      skill: validSkill('conflicting-resources'),
      resources: [
        { path: 'assets', encoding: 'utf8', content: 'file' },
        { path: 'assets/icon.svg', encoding: 'utf8', content: '<svg />' },
      ],
    });

    await expect(creation).rejects.toMatchObject({
      code: 'invalid-resource-path',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'skill-resource-path-conflict' }),
      ]),
    });
    expect(fs.listPaths().some((filePath) => filePath.includes('conflicting-resources'))).toBe(
      false,
    );
  });

  it('fails visibly when the final target already exists', async () => {
    const fs = createFs({
      '/home/neko/.agents/skills/existing/SKILL.md': 'winner',
    });
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    await expect(
      runtime.createSkill({
        target: 'personal',
        skill: validSkill('existing'),
      }),
    ).rejects.toMatchObject({ code: 'skill-already-exists' });
    expect(fs.readText('/home/neko/.agents/skills/existing/SKILL.md')).toBe('winner');
    expect(fs.listPaths().some((filePath) => filePath.includes('.existing.tmp-'))).toBe(false);
  });

  it('cleans sibling temporary state after a package write fails', async () => {
    const fs = createFs();
    fs.failWritesMatching((filePath) => filePath.endsWith('/references/fail.md'));
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    await expect(
      runtime.createSkill({
        target: 'personal',
        skill: validSkill('write-failure'),
        resources: [{ path: 'references/fail.md', encoding: 'utf8', content: 'fail' }],
      }),
    ).rejects.toMatchObject({ code: 'filesystem-error' });

    expect(fs.has('/home/neko/.agents/skills/write-failure')).toBe(false);
    expect(fs.listPaths().some((filePath) => filePath.includes('.write-failure.tmp-'))).toBe(false);
  });

  it('fails a concurrent final-directory race without overwriting the winner', async () => {
    const fs = createFs();
    fs.beforeNextRename((_oldPath, newPath) => {
      fs.seedText(`${newPath}/SKILL.md`, 'winner');
    });
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    const creation = runtime.createSkill({
      target: 'personal',
      skill: validSkill('racing-skill'),
    });

    await expect(creation).rejects.toMatchObject({ code: 'atomic-commit-conflict' });
    expect(fs.readText('/home/neko/.agents/skills/racing-skill/SKILL.md')).toBe('winner');
    expect(fs.listPaths().some((filePath) => filePath.includes('.racing-skill.tmp-'))).toBe(false);
  });

  it('duplicates canonical directories, preserves unknown Host overlays, and drops root manifest.json', async () => {
    const fs = createFs({
      '/source/SKILL.md': `---\nname: source\ndescription: Copy this Skill when a variant is needed.\n---\n\nBody`,
      '/source/manifest.json': '{"legacy":true}',
      '/source/agents/openai.yaml': 'interface: {}\n',
      '/source/references/ref.md': 'reference',
      '/source/node_modules/ignored.md': 'ignored',
    });
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    const copiedDir = await runtime.duplicateSkillDirectory({
      sourceDir: '/source',
      newSkillName: 'copied-skill',
      targetSource: 'personal',
    });

    expect(copiedDir).toBe('/home/neko/.agents/skills/copied-skill');
    expect(fs.readText(`${copiedDir}/SKILL.md`)).toContain('name: copied-skill');
    expect(fs.readText(`${copiedDir}/agents/openai.yaml`)).toBe('interface: {}\n');
    expect(fs.readText(`${copiedDir}/references/ref.md`)).toBe('reference');
    expect(fs.has(`${copiedDir}/manifest.json`)).toBe(false);
    expect(fs.has(`${copiedDir}/node_modules/ignored.md`)).toBe(false);
  });

  it('deletes Skills from canonical roots while commands remain under .neko', async () => {
    const fs = createFs({
      '/home/neko/.agents/skills/review/SKILL.md': 'skill',
      '/home/neko/.neko/commands/commit.md': 'command',
    });
    const runtime = createSkillFileRuntime({
      fs,
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    expect(await runtime.deleteSkillDirectory({ skillName: 'review', source: 'personal' })).toBe(
      true,
    );
    expect(await runtime.deleteCommandFile({ commandName: 'commit', source: 'personal' })).toBe(
      true,
    );
    expect(fs.has('/home/neko/.agents/skills/review/SKILL.md')).toBe(false);
    expect(fs.has('/home/neko/.neko/commands/commit.md')).toBe(false);
  });

  it('returns typed CreateSkillError diagnostics', async () => {
    const runtime = createSkillFileRuntime({
      fs: createFs(),
      path: pathAdapter,
      loader: createLoader(),
      homeDir: '/home/neko',
    });

    try {
      await runtime.createSkill({ target: 'personal', skill: validSkill('-invalid') });
      throw new Error('Expected creation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CreateSkillError);
      expect(error).toMatchObject({ code: 'invalid-skill' });
    }
  });
});

interface TestFs extends SkillFileRuntimeFs {
  has(filePath: string): boolean;
  readText(filePath: string): string;
  readBytes(filePath: string): Uint8Array;
  listPaths(): string[];
  seedText(filePath: string, content: string): void;
  failWritesMatching(predicate: (filePath: string) => boolean): void;
  beforeNextRename(callback: (oldPath: string, newPath: string) => void): void;
}

function createFs(initialFiles: Record<string, string | Uint8Array> = {}): TestFs {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  let writeFailure: ((filePath: string) => boolean) | undefined;
  let renameHook: ((oldPath: string, newPath: string) => void) | undefined;

  const seed = (filePath: string, content: string | Uint8Array): void => {
    addParentDirs(dirs, filePath);
    files.set(filePath, toBytes(content));
  };
  for (const [filePath, content] of Object.entries(initialFiles)) {
    seed(filePath, content);
  }

  const fs: TestFs = {
    mkdir: vi.fn(async (dirPath: string) => {
      addDirRecursive(dirs, dirPath);
    }),
    access: vi.fn(async (targetPath: string) => {
      if (!files.has(targetPath) && !dirs.has(targetPath)) {
        throw fsError('ENOENT', `Missing path: ${targetPath}`);
      }
    }),
    writeFile: vi.fn(async (filePath: string, content: string | Uint8Array) => {
      if (writeFailure?.(filePath)) {
        throw fsError('EIO', `Injected write failure: ${filePath}`);
      }
      seed(filePath, content);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw fsError('ENOENT', `Missing file: ${filePath}`);
      }
      return Buffer.from(content).toString('utf8');
    }),
    rm: vi.fn(async (dirPath: string) => {
      removeTree(files, dirs, dirPath);
    }),
    rename: vi.fn(async (oldPath: string, newPath: string) => {
      const hook = renameHook;
      renameHook = undefined;
      hook?.(oldPath, newPath);
      if (files.has(newPath) || dirs.has(newPath)) {
        throw fsError('EEXIST', `Target exists: ${newPath}`);
      }
      if (!dirs.has(oldPath)) {
        throw fsError('ENOENT', `Source does not exist: ${oldPath}`);
      }

      const movedDirs = [...dirs].filter(
        (dirPath) => dirPath === oldPath || dirPath.startsWith(`${oldPath}/`),
      );
      const movedFiles = [...files.entries()].filter(([filePath]) =>
        filePath.startsWith(`${oldPath}/`),
      );
      for (const dirPath of movedDirs) dirs.delete(dirPath);
      for (const [filePath] of movedFiles) files.delete(filePath);
      for (const dirPath of movedDirs) dirs.add(`${newPath}${dirPath.slice(oldPath.length)}`);
      for (const [filePath, content] of movedFiles) {
        files.set(`${newPath}${filePath.slice(oldPath.length)}`, content);
      }
      addParentDirs(dirs, `${newPath}/placeholder`);
    }),
    unlink: vi.fn(async (filePath: string) => {
      if (!files.delete(filePath)) {
        throw fsError('ENOENT', `Missing file: ${filePath}`);
      }
    }),
    readdir: vi.fn(async (dirPath: string) => {
      if (!dirs.has(dirPath)) {
        throw fsError('ENOENT', `Missing directory: ${dirPath}`);
      }
      const childNames = new Set<string>();
      const prefix = `${dirPath}/`;
      for (const filePath of files.keys()) {
        if (filePath.startsWith(prefix))
          childNames.add(filePath.slice(prefix.length).split('/')[0] ?? '');
      }
      for (const knownDir of dirs) {
        if (knownDir.startsWith(prefix))
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
        throw fsError('ENOENT', `Missing file: ${src}`);
      }
      seed(dest, content);
    }),
    has: (filePath: string) => files.has(filePath) || dirs.has(filePath),
    readText: (filePath: string) => Buffer.from(readBytes(files, filePath)).toString('utf8'),
    readBytes: (filePath: string) => new Uint8Array(readBytes(files, filePath)),
    listPaths: () => [...dirs, ...files.keys()].sort(),
    seedText: (filePath: string, content: string) => seed(filePath, content),
    failWritesMatching: (predicate) => {
      writeFailure = predicate;
    },
    beforeNextRename: (callback) => {
      renameHook = callback;
    },
  };

  return fs;
}

function createLoader(overrides: Partial<SkillFileRuntimeLoader> = {}): SkillFileRuntimeLoader {
  return {
    loadFromDirectory: vi.fn(async () => ({ skills: [], commands: [], errors: [] })),
    loadLazyFromDirectory: vi.fn(async () => ({ skills: [], commands: [], errors: [] })),
    ...overrides,
  };
}

function validSkill(name: string) {
  return {
    name,
    description: 'Use this Skill when a focused workflow is required.',
    body: 'Follow the complete workflow.',
  } as const;
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

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
}

function readBytes(files: ReadonlyMap<string, Uint8Array>, filePath: string): Uint8Array {
  const content = files.get(filePath);
  if (content === undefined) throw new Error(`Missing file: ${filePath}`);
  return content;
}

function removeTree(files: Map<string, Uint8Array>, dirs: Set<string>, root: string): void {
  for (const filePath of [...files.keys()]) {
    if (filePath === root || filePath.startsWith(`${root}/`)) files.delete(filePath);
  }
  for (const dirPath of [...dirs]) {
    if (dirPath === root || dirPath.startsWith(`${root}/`)) dirs.delete(dirPath);
  }
}

function addParentDirs(dirs: Set<string>, filePath: string): void {
  const parent = filePath.slice(0, filePath.lastIndexOf('/'));
  addDirRecursive(dirs, parent);
}

function addDirRecursive(dirs: Set<string>, dirPath: string): void {
  if (!dirPath || dirPath === '/') return;
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    dirs.add(current);
  }
}

function fsError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
