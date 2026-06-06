import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '@neko/shared';
import { executeSkillCatalogAction } from '../skillCatalogActions';

describe('skillCatalogActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({} as never);
    vi.mocked(vscode.window.showTextDocument).mockResolvedValue({} as never);
  });

  it('runs skills through the Agent chat without requiring file paths', async () => {
    const deps = createDeps({
      catalog: [makeSkillDef('comic-to-storyboard', 'builtin', ['run', 'fork'])],
      builtins: [makeSkill('comic-to-storyboard')],
    });

    await executeSkillCatalogAction(
      {
        action: 'run',
        skillRef: {
          extensionId: 'neko.neko-agent',
          id: 'comic-to-storyboard',
          source: 'builtin',
        },
      },
      deps,
    );

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('neko.aiAssistant.focus');
    expect(deps.chatViewProvider.sendMessageToAssistant).toHaveBeenCalledWith(
      '/comic-to-storyboard',
      true,
    );
  });

  it('opens editable project skill files resolved by the host service', async () => {
    const deps = createDeps({
      catalog: [makeSkillDef('review', 'project', ['run', 'edit', 'reveal'])],
    });

    await executeSkillCatalogAction(
      {
        action: 'edit',
        skillRef: {
          extensionId: 'neko.neko-agent',
          id: 'review',
          source: 'project',
        },
      },
      deps,
    );

    expect(deps.skillFileService.getSkillFilePath).toHaveBeenCalledWith('review', 'project');
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
      '/workspace/.neko/skills/review/SKILL.md',
    );
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith({}, { preview: false });
  });

  it('reveals editable skill directories resolved by the host service', async () => {
    const deps = createDeps({
      catalog: [makeSkillDef('review', 'personal', ['run', 'reveal'])],
    });

    await executeSkillCatalogAction(
      {
        action: 'reveal',
        skillRef: {
          extensionId: 'neko.neko-agent',
          id: 'review',
          source: 'personal',
        },
      },
      deps,
    );

    expect(deps.skillFileService.getSkillDirectory).toHaveBeenCalledWith('review', 'personal');
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'revealFileInOS',
      expect.objectContaining({ fsPath: '/home/.neko/skills/review' }),
    );
  });

  it('forks built-in skills into project skills and preserves manifest catalog metadata', async () => {
    const deps = createDeps({
      catalog: [
        {
          ...makeSkillDef('comic-to-storyboard', 'builtin', ['run', 'fork']),
          catalog: {
            role: 'focused-skill',
            source: 'builtin',
            visibility: 'advanced',
            editable: false,
            groupId: 'media-to-video',
            parentSkillIds: ['media-to-video'],
            actions: [{ id: 'run' }, { id: 'fork' }],
          },
        },
      ],
      builtins: [
        {
          ...makeSkill('comic-to-storyboard'),
          content: '# builtin body',
          version: '1.0.0',
          domain: 'media',
        },
      ],
    });

    await executeSkillCatalogAction(
      {
        action: 'fork',
        skillRef: {
          extensionId: 'neko.neko-agent',
          id: 'comic-to-storyboard',
          source: 'builtin',
        },
        targetSource: 'project',
      },
      deps,
    );

    expect(deps.skillFileService.createSkillFile).toHaveBeenCalledWith(
      'comic-to-storyboard',
      'project',
      '# builtin body',
      expect.any(String),
    );
    expect(deps.skillFileService.writeSkillManifest).toHaveBeenCalledWith(
      'comic-to-storyboard',
      'project',
      expect.objectContaining({
        version: '1.0.0',
        domain: 'media',
        catalog: expect.objectContaining({
          role: 'focused-skill',
          editable: true,
          groupId: 'media-to-video',
          parentSkillIds: ['media-to-video'],
        }),
      }),
    );
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
      '/workspace/.neko/skills/comic-to-storyboard/SKILL.md',
    );
  });

  it('creates and duplicates editable skills by typed source and skill name only', async () => {
    const deps = createDeps({
      catalog: [makeSkillDef('review', 'project', ['run', 'duplicate'])],
    });

    await executeSkillCatalogAction(
      { action: 'create', targetSource: 'project', skillName: 'new-skill' },
      deps,
    );
    await executeSkillCatalogAction(
      {
        action: 'duplicate',
        skillRef: {
          extensionId: 'neko.neko-agent',
          id: 'review',
          source: 'project',
        },
        targetSource: 'personal',
        skillName: 'review-copy',
      },
      deps,
    );

    expect(deps.skillFileService.createSkillFile).toHaveBeenCalledWith('new-skill', 'project');
    expect(deps.skillFileService.duplicateSkillDirectory).toHaveBeenCalledWith(
      '/workspace/.neko/skills/review',
      'review-copy',
      'personal',
    );
  });

  it('rejects unknown ids, cross-extension refs and path-like payloads', async () => {
    const deps = createDeps({
      catalog: [makeSkillDef('review', 'project', ['run', 'edit'])],
    });

    await expect(
      executeSkillCatalogAction(
        {
          action: 'edit',
          skillRef: {
            extensionId: 'neko.neko-agent',
            id: '../review',
            source: 'project',
          },
        },
        deps,
      ),
    ).rejects.toThrow('Invalid skill id');

    await expect(
      executeSkillCatalogAction(
        {
          action: 'edit',
          skillRef: {
            extensionId: 'neko.other',
            id: 'review',
            source: 'project',
          },
        },
        deps,
      ),
    ).rejects.toThrow('Unsupported skill provider');

    await expect(
      executeSkillCatalogAction(
        {
          action: 'edit',
          skillRef: {
            extensionId: 'neko.neko-agent',
            id: 'review',
            source: 'project',
          },
          path: '/tmp/review/SKILL.md',
        },
        deps,
      ),
    ).rejects.toThrow('Invalid skill action request');
  });
});

function createDeps(input: {
  readonly catalog: readonly ReturnType<typeof makeSkillDef>[];
  readonly builtins?: readonly Skill[];
}) {
  return {
    chatViewProvider: {
      sendMessageToAssistant: vi.fn(),
    },
    skillFileService: {
      getSkillFilePath: vi.fn((skillName: string, source: 'project' | 'personal') =>
        source === 'project'
          ? `/workspace/.neko/skills/${skillName}/SKILL.md`
          : `/home/.neko/skills/${skillName}/SKILL.md`,
      ),
      getSkillDirectory: vi.fn((skillName: string, source: 'project' | 'personal') =>
        source === 'project'
          ? `/workspace/.neko/skills/${skillName}`
          : `/home/.neko/skills/${skillName}`,
      ),
      createSkillFile: vi.fn(
        async (skillName: string, source: 'project' | 'personal') =>
          `${source === 'project' ? '/workspace/.neko/skills' : '/home/.neko/skills'}/${skillName}/SKILL.md`,
      ),
      writeSkillManifest: vi.fn(async () => '/workspace/.neko/skills/skill/manifest.json'),
      duplicateSkillDirectory: vi.fn(
        async (_sourceDir: string, skillName: string, source: 'project' | 'personal') =>
          `${source === 'project' ? '/workspace/.neko/skills' : '/home/.neko/skills'}/${skillName}`,
      ),
      triggerRescan: vi.fn(async () => undefined),
      getSkills: vi.fn(async () => ({
        personal: { skills: [], commands: [] },
        project: { skills: [], commands: [] },
        errors: [],
      })),
    },
    skillCatalogProvider: {
      getSkills: vi.fn(() => [...input.catalog]),
      updateScanResult: vi.fn(),
      getSnapshot: vi.fn(() => ({ skills: [...input.catalog] })),
    },
    builtinSkills: input.builtins ?? [],
  } as never;
}

function makeSkillDef(
  id: string,
  source: 'builtin' | 'project' | 'personal',
  actions: readonly ('run' | 'edit' | 'reveal' | 'fork' | 'duplicate')[],
) {
  return {
    id,
    name: id,
    description: `${id} description`,
    command: 'neko.agent.invokeSkill',
    catalog: {
      role: source === 'builtin' ? 'standalone' : 'standalone',
      source,
      visibility: 'primary',
      editable: source === 'project' || source === 'personal',
      actions: actions.map((id) => ({ id })),
    },
  };
}

function makeSkill(name: string): Skill {
  return {
    name,
    description: `${name} description`,
    content: `# ${name}`,
    source: 'builtin',
    enabled: true,
  };
}
