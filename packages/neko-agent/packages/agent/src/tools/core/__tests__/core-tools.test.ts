import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Tool } from '@neko/shared';
import { createCoreTools } from '../core-tools';

describe('createCoreTools', () => {
  const fixtureRoot = path.resolve(
    process.cwd(),
    '.test-workspaces',
    `core-tools-policy-${process.pid}`,
  );
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const outsideRoot = path.join(fixtureRoot, 'outside');

  beforeEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', '.cache', 'resources'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, '.neko', 'logs'), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, 'ignored'), { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, 'src', 'story.txt'), 'hello neko\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, '.neko', 'memory.md'), '# Memory\n', 'utf-8');
    await fs.writeFile(
      path.join(workspaceRoot, '.neko', '.cache', 'resources', 'page.txt'),
      'cache\n',
      'utf-8',
    );
    await fs.writeFile(path.join(workspaceRoot, '.neko', 'logs', 'events.jsonl'), '{}\n', 'utf-8');
    await fs.writeFile(path.join(workspaceRoot, 'ignored', 'secret.txt'), 'ignored\n', 'utf-8');
    await fs.writeFile(path.join(outsideRoot, 'secret.txt'), 'outside\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it('does not include arbitrary shell execution by default', () => {
    const tools = createCoreTools();

    expect(tools.map((tool) => tool.name)).toEqual(['Read', 'Write', 'ListDirectory', 'Grep']);
  });

  it('keeps Bash opt-in for explicit Developer Mode or migration callers', () => {
    const tools = createCoreTools({ includeShell: true });

    expect(tools.map((tool) => tool.name)).toContain('Bash');
  });

  it('fails closed for file tools when no workspace root is available', async () => {
    const tools = createCoreTools();
    const read = getTool(tools, 'Read');

    await expect(
      read.execute({ file_path: path.join(workspaceRoot, 'src', 'story.txt') }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('no authorized workspace root'),
    });
  });

  it('allows workspace-relative file reads through the shared file access policy', async () => {
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    await expect(read.execute({ file_path: 'src/story.txt' })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('hello neko'),
      }),
    });
  });

  it('blocks reads, listings, and searches outside the workspace root', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });
    const outsideFile = path.join(outsideRoot, 'secret.txt');
    const outsideDir = outsideRoot;

    await expect(getTool(tools, 'Read').execute({ file_path: outsideFile })).resolves.toMatchObject(
      {
        success: false,
        error: expect.stringContaining('outside authorized read roots'),
      },
    );
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: outsideDir }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized read roots'),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'outside', path: outsideDir }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized read roots'),
    });
  });

  it('allows reads, listings, and searches from additional authorized read roots', async () => {
    const tools = createCoreTools({
      defaultCwd: workspaceRoot,
      authorizedReadRoots: [outsideRoot],
    });
    const outsideFile = path.join(outsideRoot, 'secret.txt');

    await expect(getTool(tools, 'Read').execute({ file_path: outsideFile })).resolves.toMatchObject(
      {
        success: true,
        data: expect.objectContaining({
          content: expect.stringContaining('outside'),
        }),
      },
    );
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: outsideRoot }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('secret.txt'),
      }),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'outside', path: outsideRoot }),
    ).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('secret.txt'),
      }),
    });
  });

  it('blocks writes outside workspace and rejects system temp paths', async () => {
    const write = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Write');

    await expect(
      write.execute({ file_path: path.join(outsideRoot, 'new.txt'), content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized write roots'),
    });
    await expect(
      write.execute({ file_path: '/tmp/neko-agent-denied.txt', content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('system temp'),
    });
  });

  it('keeps additional authorized read roots read-only', async () => {
    const write = getTool(
      createCoreTools({ defaultCwd: workspaceRoot, authorizedReadRoots: [outsideRoot] }),
      'Write',
    );

    await expect(
      write.execute({ file_path: path.join(outsideRoot, 'new.txt'), content: 'nope' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('outside authorized write roots'),
    });
  });

  it('blocks generic file tools from managed workspace runtime and cache directories', async () => {
    const tools = createCoreTools({ defaultCwd: workspaceRoot });

    await expect(
      getTool(tools, 'Read').execute({ file_path: '.neko/.cache/resources/page.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: '.neko/logs' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Grep').execute({ pattern: 'cache', path: '.neko/.cache' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
    await expect(
      getTool(tools, 'Write').execute({ file_path: '.neko/logs/new.jsonl', content: '{}\n' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('managed workspace runtime or cache directory'),
    });
  });

  it('keeps project memory reachable while hiding managed .neko runtime subtrees', async () => {
    const read = getTool(createCoreTools({ defaultCwd: workspaceRoot }), 'Read');

    await expect(read.execute({ file_path: '.neko/memory.md' })).resolves.toMatchObject({
      success: true,
      data: expect.objectContaining({
        content: expect.stringContaining('# Memory'),
      }),
    });
  });

  it('blocks generic file tools from workspace .gitignore matches', async () => {
    const tools = createCoreTools({
      defaultCwd: workspaceRoot,
      workspaceIgnoreRules: {
        gitignoreRules: ['ignored/'],
      },
    });

    await expect(
      getTool(tools, 'Read').execute({ file_path: 'ignored/secret.txt' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('.gitignore rule "ignored/"'),
    });
    await expect(
      getTool(tools, 'ListDirectory').execute({ path: 'ignored' }),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('.gitignore rule "ignored/"'),
    });
  });
});

function getTool(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Missing tool: ${name}`);
  }
  return tool;
}
