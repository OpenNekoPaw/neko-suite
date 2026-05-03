import { describe, expect, it } from 'vitest';
import {
  appendSkillFileScanLoadResult,
  buildSkillDirectoryLoadFailureResult,
  buildCommandFileContent,
  buildCommandFileCreationPlan,
  buildCommandFileDeletionPlan,
  buildCommandFileOpenPlan,
  buildSkillFileScanPlan,
  buildSkillDirectoryDeletionPlan,
  buildSkillDirectoryDuplicationPlan,
  buildSkillFileCreationPlan,
  buildSkillFileContent,
  buildSkillSupportFileOpenPlan,
  createEmptySkillFileScanResult,
  normalizeDuplicatedSkillContent,
  resolveSkillPathTriggers,
  shouldCopySkillDirectoryEntry,
  toConfiguredSkillFileCatalog,
} from '../skill-file-projector';
import type { Skill, SkillSource, SlashCommand } from '@neko/shared';

describe('skill-file-projector', () => {
  describe('scan plans', () => {
    it('builds personal and project scan entries with watcher patterns', () => {
      expect(buildSkillFileScanPlan({ homeDir: '/home/me', workspaceRoot: '/repo' })).toEqual({
        entries: [
          {
            source: 'personal',
            kind: 'skills',
            dirPath: '/home/me/.neko/skills',
            watchPattern: '**/*.md',
          },
          {
            source: 'personal',
            kind: 'commands',
            dirPath: '/home/me/.neko/commands',
            watchPattern: '*.md',
          },
          {
            source: 'project',
            kind: 'skills',
            dirPath: '/repo/.neko/skills',
            watchPattern: '**/*.md',
          },
          {
            source: 'project',
            kind: 'commands',
            dirPath: '/repo/.neko/commands',
            watchPattern: '*.md',
          },
        ],
      });

      expect(buildSkillFileScanPlan({ homeDir: '/home/me' }).entries).toEqual([
        {
          source: 'personal',
          kind: 'skills',
          dirPath: '/home/me/.neko/skills',
          watchPattern: '**/*.md',
        },
        {
          source: 'personal',
          kind: 'commands',
          dirPath: '/home/me/.neko/commands',
          watchPattern: '*.md',
        },
      ]);
    });

    it('accumulates scan loads by directory kind and source', () => {
      const result = createEmptySkillFileScanResult<Skill, SlashCommand>();

      appendSkillFileScanLoadResult(
        result,
        { source: 'personal', kind: 'skills' },
        {
          skills: [makeSkill('skill', 'personal')],
          commands: [makeCommand('ignored-from-skills-dir', 'personal')],
          errors: [{ file: '/skill', message: 'bad skill' }],
        },
      );
      appendSkillFileScanLoadResult(
        result,
        { source: 'project', kind: 'commands' },
        {
          skills: [makeSkill('ignored-from-commands-dir', 'project')],
          commands: [makeCommand('cmd', 'project')],
          errors: [],
        },
      );

      expect(result.personal.skills.map((skill) => skill.name)).toEqual(['skill']);
      expect(result.personal.commands).toEqual([]);
      expect(result.project.skills).toEqual([]);
      expect(result.project.commands.map((command) => command.command)).toEqual(['cmd']);
      expect(result.errors).toEqual([{ file: '/skill', message: 'bad skill' }]);
    });

    it('projects directory load failures', () => {
      expect(
        buildSkillDirectoryLoadFailureResult<Skill, SlashCommand>({
          dirPath: '/repo/.neko/skills',
          operation: 'lazy-load',
          error: new Error('denied'),
        }),
      ).toEqual({
        skills: [],
        commands: [],
        errors: [{ file: '/repo/.neko/skills', message: 'Failed to lazy-load: denied' }],
      });
    });
  });

  describe('buildSkillFileContent', () => {
    it('builds default SKILL.md content', () => {
      const content = buildSkillFileContent({ skillName: 'review-pr' });

      expect(content).toContain('name: "review-pr"');
      expect(content).toContain('description: "A custom skill."');
      expect(content).toContain('# review-pr');
    });

    it('adds frontmatter when provided content has none', () => {
      const content = buildSkillFileContent({
        skillName: 'storyboard',
        description: 'Storyboard helper.',
        content: 'Use panels and shots.',
      });

      expect(content).toBe(`---
name: "storyboard"
description: "Storyboard helper."
---

Use panels and shots.`);
    });

    it('updates an existing frontmatter name', () => {
      const content = buildSkillFileContent({
        skillName: 'new-name',
        content: `---
name: "old-name"
description: "Keep me"
---

Body`,
      });

      expect(content).toContain('name: "new-name"');
      expect(content).toContain('description: "Keep me"');
      expect(content).toContain('Body');
    });

    it('inserts name into existing frontmatter that has no name', () => {
      const content = buildSkillFileContent({
        skillName: 'inserted',
        content: `---
description: "Only description"
---

Body`,
      });

      expect(content).toContain('name: "inserted"\ndescription: "Only description"');
    });
  });

  describe('normalizeDuplicatedSkillContent', () => {
    it('renames copied skill and removes disabled false', () => {
      const content = normalizeDuplicatedSkillContent(
        `---
name: "source"
enabled: false
description: "Copied"
---

Body`,
        'copy',
      );

      expect(content).toContain('name: "copy"');
      expect(content).not.toContain('enabled: false');
      expect(content).toContain('description: "Copied"');
    });
  });

  describe('buildCommandFileContent', () => {
    it('returns caller content when provided', () => {
      expect(buildCommandFileContent('commit', 'custom')).toBe('custom');
    });

    it('builds default command content', () => {
      const content = buildCommandFileContent('commit');

      expect(content).toContain('# /commit');
      expect(content).toContain('A custom command.');
    });
  });

  describe('file operation plans', () => {
    it('builds skill creation, duplication, and deletion plans', () => {
      expect(
        buildSkillFileCreationPlan({
          basePath: '/repo/.neko/skills',
          skillName: 'review',
          unavailableError: 'no workspace',
        }),
      ).toEqual({
        ok: true,
        skillDir: '/repo/.neko/skills/review',
        filePath: '/repo/.neko/skills/review/SKILL.md',
        fileContent: expect.stringContaining('name: "review"'),
      });

      expect(
        buildSkillDirectoryDuplicationPlan({
          basePath: '/repo/.neko/skills',
          newSkillName: 'copy',
          unavailableError: 'no workspace',
        }),
      ).toEqual({
        ok: true,
        newSkillDir: '/repo/.neko/skills/copy',
        skillFilePath: '/repo/.neko/skills/copy/SKILL.md',
      });

      expect(
        buildSkillDirectoryDeletionPlan({
          basePath: '/repo/.neko/skills',
          skillName: 'review',
          unavailableError: 'no workspace',
        }),
      ).toEqual({
        ok: true,
        skillDir: '/repo/.neko/skills/review',
      });
    });

    it('builds command creation and deletion plans', () => {
      expect(
        buildCommandFileCreationPlan({
          basePath: '/repo/.neko/commands',
          commandName: 'commit',
          unavailableError: 'no workspace',
        }),
      ).toEqual({
        ok: true,
        dirPath: '/repo/.neko/commands',
        filePath: '/repo/.neko/commands/commit.md',
        fileContent: expect.stringContaining('# /commit'),
      });

      expect(
        buildCommandFileDeletionPlan({
          basePath: null,
          commandName: 'commit',
          unavailableError: 'No workspace folder open for project commands',
        }),
      ).toEqual({
        ok: false,
        error: 'No workspace folder open for project commands',
      });
    });

    it('builds skill and command open plans from content layout', () => {
      expect(
        buildSkillSupportFileOpenPlan({
          source: 'project',
          homeDir: '/home/me',
          workspaceRoot: '/repo',
          skillName: 'review',
          fileType: 'skill',
        }),
      ).toEqual({
        ok: true,
        filePath: '/repo/.neko/skills/review/SKILL.md',
      });

      expect(
        buildSkillSupportFileOpenPlan({
          source: 'personal',
          homeDir: '/home/me',
          skillName: 'review',
          fileType: 'reference',
          filePath: 'guide.md',
        }),
      ).toEqual({
        ok: true,
        filePath: '/home/me/.neko/skills/review/references/guide.md',
      });

      expect(
        buildCommandFileOpenPlan({
          source: 'project',
          homeDir: '/home/me',
          workspaceRoot: '/repo',
          commandName: 'commit',
        }),
      ).toEqual({
        ok: true,
        filePath: '/repo/.neko/commands/commit.md',
      });
    });

    it('returns open-plan failures for missing workspace and support file paths', () => {
      expect(
        buildSkillSupportFileOpenPlan({
          source: 'project',
          homeDir: '/home/me',
          skillName: 'review',
          fileType: 'skill',
        }),
      ).toEqual({ ok: false, error: 'No workspace folder open for project skills' });

      expect(
        buildSkillSupportFileOpenPlan({
          source: 'personal',
          homeDir: '/home/me',
          skillName: 'review',
          fileType: 'script',
        }),
      ).toEqual({ ok: false, error: 'No file path provided for script' });

      expect(
        buildCommandFileOpenPlan({
          source: 'project',
          homeDir: '/home/me',
          commandName: 'commit',
        }),
      ).toEqual({ ok: false, error: 'No workspace folder open for project commands' });
    });

    it('filters copied skill directory entries', () => {
      expect(shouldCopySkillDirectoryEntry('references')).toBe(true);
      expect(shouldCopySkillDirectoryEntry('__pycache__')).toBe(false);
      expect(shouldCopySkillDirectoryEntry('node_modules')).toBe(false);
      expect(shouldCopySkillDirectoryEntry('.git')).toBe(false);
    });
  });

  describe('toConfiguredSkillFileCatalog', () => {
    it('merges builtin, personal, and project skills with enabled true', () => {
      const catalog = toConfiguredSkillFileCatalog({
        personal: {
          skills: [makeSkill('personal', 'personal')],
          commands: [makeCommand('cmd', 'personal')],
        },
        project: {
          skills: [makeSkill('project', 'project')],
          commands: [],
        },
        errors: [],
      });

      expect(catalog.skills.some((skill) => skill.source === 'builtin')).toBe(true);
      expect(catalog.skills.find((skill) => skill.name === 'personal')?.enabled).toBe(true);
      expect(catalog.skills.find((skill) => skill.name === 'project')?.enabled).toBe(true);
      expect(catalog.commands[0]?.enabled).toBe(true);
    });
  });

  describe('resolveSkillPathTriggers', () => {
    it('returns workspace-relative path matches', () => {
      const matches = resolveSkillPathTriggers({
        filePath: '/repo/src/main.ts',
        workspaceRoot: '/repo',
        skills: [
          makeSkill('typescript', 'project', ['src/**/*.ts']),
          makeSkill('screenplay', 'project', ['scripts/**/*.fountain']),
        ],
      });

      expect(matches).toEqual([{ skillName: 'typescript', filePath: 'src/main.ts' }]);
    });

    it('returns no matches when skills have no path triggers', () => {
      expect(
        resolveSkillPathTriggers({
          filePath: '/repo/src/main.ts',
          workspaceRoot: '/repo',
          skills: [makeSkill('typescript', 'project')],
        }),
      ).toEqual([]);
    });
  });
});

function makeSkill(name: string, source: SkillSource, paths?: string[]): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} content`,
    source,
    enabled: false,
    paths,
  };
}

function makeCommand(command: string, source: SkillSource): SlashCommand {
  return {
    command,
    description: `${command} description`,
    content: `${command} content`,
    source,
    enabled: false,
  };
}
