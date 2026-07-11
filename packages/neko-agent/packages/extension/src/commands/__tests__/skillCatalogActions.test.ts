import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateSkillInput, Skill } from '@neko/shared';
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
      '/workspace/.agents/skills/review/SKILL.md',
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
      expect.objectContaining({ fsPath: '/home/.agents/skills/review' }),
    );
  });

  it('forks built-in skills as portable packages without persisting Host catalog facts', async () => {
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
          content: '# legacy builtin body',
          portableDefinition: {
            name: 'comic-to-storyboard',
            description: 'Convert comics into storyboard guidance.',
            body: '# Portable builtin body',
            license: 'MIT',
            allowedTools: ['Read'],
          },
          nekoOverlay: {
            schemaVersion: 1,
            interface: {
              displayName: 'Comic to Storyboard',
            },
          },
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

    expect(deps.skillFileService.createSkill).toHaveBeenCalledWith({
      target: 'project',
      skill: {
        name: 'comic-to-storyboard',
        description: 'Convert comics into storyboard guidance.',
        body: '# Portable builtin body',
        license: 'MIT',
        allowedTools: ['Read'],
      },
      neko: {
        schemaVersion: 1,
        interface: {
          displayName: 'Comic to Storyboard',
        },
      },
    });
    expect(deps.skillFileService.createSkill).not.toHaveBeenCalledWith(
      expect.objectContaining({
        catalog: expect.anything(),
      }),
    );
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
      '/workspace/.agents/skills/comic-to-storyboard/SKILL.md',
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

    expect(deps.skillFileService.createSkill).toHaveBeenCalledWith({
      target: 'project',
      skill: {
        name: 'new-skill',
        description: 'Reusable guidance for new-skill.',
        body: '# new-skill\n\nAdd instructions here.\n',
      },
    });
    expect(deps.skillFileService.duplicateSkillDirectory).toHaveBeenCalledWith(
      '/workspace/.agents/skills/review',
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
          ? `/workspace/.agents/skills/${skillName}/SKILL.md`
          : `/home/.agents/skills/${skillName}/SKILL.md`,
      ),
      getSkillDirectory: vi.fn((skillName: string, source: 'project' | 'personal') =>
        source === 'project'
          ? `/workspace/.agents/skills/${skillName}`
          : `/home/.agents/skills/${skillName}`,
      ),
      createSkill: vi.fn(async (input: CreateSkillInput) => ({
        source: input.target,
        rootId: `${input.target}-agent-skills`,
        relativePath: input.skill.name,
        absolutePath: `${
          input.target === 'project' ? '/workspace/.agents/skills' : '/home/.agents/skills'
        }/${input.skill.name}`,
        fingerprint: `sha256:${input.skill.name}`,
        diagnostics: [],
      })),
      duplicateSkillDirectory: vi.fn(
        async (_sourceDir: string, skillName: string, source: 'project' | 'personal') =>
          `${source === 'project' ? '/workspace/.agents/skills' : '/home/.agents/skills'}/${skillName}`,
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
