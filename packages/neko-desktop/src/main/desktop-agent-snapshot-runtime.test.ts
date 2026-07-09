import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopSkillFileSnapshotRuntime } from './desktop-agent-snapshot-runtime';

const tempRoots: string[] = [];

describe('Desktop Agent snapshot runtime', () => {
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('loads Agent skill and command summaries from user and workspace .neko directories', async () => {
    const root = await createTempRoot();
    const homeDir = join(root, 'home');
    const workspaceRoot = join(root, 'workspace');
    await mkdir(join(homeDir, '.neko', 'commands'), { recursive: true });
    await mkdir(join(workspaceRoot, '.neko', 'skills', 'storyboard'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.neko', 'skills', 'storyboard', 'SKILL.md'),
      `---
name: storyboard
description: Create a storyboard.
icon: storyboard
enabled: true
---

Storyboard instructions.
`,
      'utf-8',
    );
    await writeFile(
      join(homeDir, '.neko', 'commands', 'shot-list.md'),
      `---
command: shot-list
description: Draft a shot list.
argument-hint: "[scene]"
enabled: false
---

Shot list instructions.
`,
      'utf-8',
    );

    const runtime = createDesktopSkillFileSnapshotRuntime({ workspaceRoot, homeDir });

    await expect(runtime.getSkillsSnapshot()).resolves.toEqual({
      skills: [
        {
          name: 'shot-list',
          description: 'Draft a shot list.',
          source: 'personal',
          enabled: false,
          type: 'slash-command',
          command: 'shot-list',
          argumentHint: '[scene]',
        },
        {
          name: 'storyboard',
          description: 'Create a storyboard.',
          icon: 'storyboard',
          source: 'project',
          enabled: true,
          type: 'skill',
        },
      ],
      diagnostics: [],
    });
  });

  it('surfaces malformed skill catalog entries as Desktop diagnostics', async () => {
    const root = await createTempRoot();
    const homeDir = join(root, 'home');
    const workspaceRoot = join(root, 'workspace');
    await mkdir(join(workspaceRoot, '.neko', 'skills', 'broken'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.neko', 'skills', 'broken', 'SKILL.md'),
      `---
name: broken
---

Broken skill.
`,
      'utf-8',
    );

    const runtime = createDesktopSkillFileSnapshotRuntime({ workspaceRoot, homeDir });

    await expect(runtime.getSkillsSnapshot()).resolves.toEqual({
      skills: [],
      diagnostics: [
        `Desktop Agent skill catalog entry is missing description: ${join(
          workspaceRoot,
          '.neko',
          'skills',
          'broken',
          'SKILL.md',
        )}`,
      ],
    });
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'neko-desktop-agent-'));
  tempRoots.push(root);
  return root;
}
