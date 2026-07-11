import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillSource } from '@neko/shared';
import { createNodeSkillLoader, resolveSlashCommandCatalogEntry } from '@neko/agent';
import type { CLIConfig } from '../types';
import {
  createTuiSessionSkillRuntime,
  loadTuiSessionSkills,
  type TuiSessionSkillLoader,
} from '../tui-session-skills';

let tempRoot: string | undefined;

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe('loadTuiSessionSkills', () => {
  it('loads standard user/workspace Skill and command directories through shared runtime', async () => {
    const fixture = await createFixture();
    await fs.mkdir(path.join(fixture.workDir, '.codex', 'skills', 'ignored'), {
      recursive: true,
    });
    const loadFromDirectory = vi.fn(async (dirPath: string, source: SkillSource) => {
      if (dirPath.endsWith('/skills')) {
        return {
          skills: [
            {
              name: `${source}-skill`,
              description: `${source} skill`,
              content: 'Skill body',
              source,
              enabled: true,
              directoryPath: path.join(dirPath, `${source}-skill`),
              entryPointKind: 'skill' as const,
            },
          ],
          commands: [],
          errors: [],
        };
      }

      if (dirPath.endsWith('/commands')) {
        return {
          skills: [],
          commands: [
            {
              command: `${source}-command`,
              description: `${source} command`,
              content: 'Use $ARGUMENTS',
              source,
              filePath: path.join(dirPath, `${source}-command.md`),
              enabled: true,
            },
          ],
          errors: [],
        };
      }

      throw new Error(`Unexpected Skill scan dir: ${dirPath}`);
    });
    const skillLoader: TuiSessionSkillLoader = {
      loadFromDirectory,
      loadLazyFromDirectory: vi.fn(),
    };

    const skills = await loadTuiSessionSkills({
      skillLoader,
      config: createConfig(fixture.workDir),
      homeDir: fixture.homeDir,
      locale: 'en',
    });

    expect(loadFromDirectory).toHaveBeenCalledWith(
      path.join(fixture.homeDir, '.agents', 'skills'),
      'personal',
    );
    expect(loadFromDirectory).toHaveBeenCalledWith(
      path.join(fixture.homeDir, '.neko', 'commands'),
      'personal',
    );
    expect(loadFromDirectory).toHaveBeenCalledWith(
      path.join(fixture.workDir, '.agents', 'skills'),
      'project',
    );
    expect(loadFromDirectory).toHaveBeenCalledWith(
      path.join(fixture.workDir, '.neko', 'commands'),
      'project',
    );
    expect(loadFromDirectory.mock.calls.map(([dirPath]) => dirPath)).not.toContain(
      path.join(fixture.workDir, '.codex', 'skills'),
    );
    expect(loadFromDirectory.mock.calls.map(([dirPath]) => dirPath)).not.toContain(
      path.join(fixture.workDir, 'custom-skills'),
    );
    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'personal-skill', source: 'personal' }),
        expect.objectContaining({
          name: 'personal-command',
          command: 'personal-command',
          entryPointKind: 'command-artifact',
          source: 'personal',
        }),
        expect.objectContaining({ name: 'project-skill', source: 'project' }),
        expect.objectContaining({
          name: 'project-command',
          command: 'project-command',
          entryPointKind: 'command-artifact',
          source: 'project',
        }),
      ]),
    );
    expect(
      resolveSlashCommandCatalogEntry('project-command', {
        surface: 'tui',
        skills,
      }),
    ).toEqual(expect.objectContaining({ source: 'command-artifact' }));
    expect(
      resolveSlashCommandCatalogEntry('project-command', {
        surface: 'extension',
        skills,
      }),
    ).toEqual(expect.objectContaining({ source: 'command-artifact' }));
  });

  it('creates through the shared runtime, refreshes discovery, and keeps lifecycle roots separate', async () => {
    const fixture = await createFixture();
    const runtime = createTuiSessionSkillRuntime({
      skillLoader: createNodeSkillLoader(fs, path),
      config: createConfig(fixture.workDir),
      homeDir: fixture.homeDir,
      locale: 'en',
    });

    const creation = await runtime.createSkill({
      target: 'project',
      skill: {
        name: 'portable-story',
        description: 'Portable story guidance.',
        body: '# Portable story\n\nFollow the story structure.',
      },
      resources: [
        {
          path: 'references/example.md',
          encoding: 'utf8',
          content: '# Example',
        },
      ],
    });

    expect(creation.created).toMatchObject({
      source: 'project',
      rootId: 'project-agent-skills',
      relativePath: 'portable-story',
      absolutePath: path.join(fixture.workDir, '.agents', 'skills', 'portable-story'),
    });
    await expect(
      fs.readFile(
        path.join(fixture.workDir, '.agents', 'skills', 'portable-story', 'SKILL.md'),
        'utf8',
      ),
    ).resolves.toContain('name: portable-story');
    expect(creation.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'portable-story',
          source: 'project',
          enabled: true,
        }),
      ]),
    );
    await expect(fs.stat(path.join(fixture.workDir, '.neko', 'commands'))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });
    await expect(fs.access(path.join(fixture.workDir, '.neko', 'skills'))).rejects.toThrow();
  });
});

async function createFixture(): Promise<{ readonly homeDir: string; readonly workDir: string }> {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-session-skills-'));
  return {
    homeDir: path.join(tempRoot, 'home'),
    workDir: path.join(tempRoot, 'workspace'),
  };
}

function createConfig(workDir: string): CLIConfig {
  return {
    provider: 'test',
    providerType: 'openai',
    providerRequiresApiKey: false,
    model: 'test-model',
    mediaModels: [],
    maxTokens: 1024,
    temperature: 0.1,
    verbose: false,
    workDir,
    mcpServers: [],
    outputFormat: 'text',
    thinkingBudget: 0,
  };
}
