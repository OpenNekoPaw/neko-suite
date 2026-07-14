import { describe, expect, it } from 'vitest';
import type { Skill } from '@neko/shared';
import {
  applySkillSourcePrecedence,
  buildSkillDefs,
  createSkillCatalogProvider,
  toBuiltinSkillDef,
} from '../skillCatalogProvider';
import type { SkillScanResult } from '../SkillFileService';

describe('skillCatalogProvider', () => {
  it('projects canonical creative media skills without legacy stage identities', () => {
    const skills = buildSkillDefs({
      builtinSkills: [
        makeSkill('storyboard', 'Create storyboards.'),
        makeSkill('image', 'Create and edit images.'),
        makeSkill('video', 'Create video clips.'),
        makeSkill('media-production', 'Coordinate end-to-end media production.'),
        makeSkill('script-generation', 'Write scripts.'),
        makeSkill('script-to-timeline', 'Convert scripts.'),
        makeSkill('video-editing', 'Edit timelines.'),
        makeSkill('media-quality-review', 'Review media quality.'),
      ],
    });

    expect(skills.map((skill) => skill.id)).toEqual([
      'media-production',
      'script-generation',
      'image',
      'storyboard',
      'video',
      'media-quality-review',
      'video-editing',
      'script-to-timeline',
    ]);

    expect(findSkill(skills, 'media-production').catalog).toMatchObject({
      role: 'orchestrator',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'media-production',
      editable: false,
      actions: expect.arrayContaining([{ id: 'fork', targetSource: 'personal' }]),
    });
    for (const skillName of ['storyboard', 'image', 'video']) {
      expect(findSkill(skills, skillName).catalog).toMatchObject({
        role: 'standalone',
        source: 'builtin',
        visibility: 'primary',
        editable: false,
      });
    }
    expect(findSkill(skills, 'script-generation').catalog).toMatchObject({
      role: 'orchestrator',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'script-workflow',
    });
    expect(findSkill(skills, 'script-to-timeline').catalog).toMatchObject({
      role: 'focused-skill',
      source: 'builtin',
      visibility: 'advanced',
      groupId: 'script-workflow',
      parentSkillIds: ['script-generation'],
    });
    expect(findSkill(skills, 'video-editing').catalog).toMatchObject({
      role: 'quick-action',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'post-production',
    });
    expect(findSkill(skills, 'media-quality-review').catalog).toMatchObject({
      role: 'quick-action',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'post-production',
    });
  });

  it('does not give removed creative stage names canonical builtin catalog roles', () => {
    const removedNames = [
      'media-to-video',
      'comic-to-storyboard',
      'comic-to-animation',
      'image-to-shot',
      'storyboard-to-animation-plan',
      'animation-plan-to-cut',
      'generated-shot-assembly',
      'export-video-package',
      'ai-generate',
    ];
    const skills = buildSkillDefs({
      builtinSkills: removedNames.map((name) => makeSkill(name, 'Removed identity fixture.')),
    });

    for (const skill of skills) {
      expect(skill.catalog).toMatchObject({
        role: 'standalone',
        visibility: 'advanced',
      });
      expect(skill.catalog?.groupId).toBeUndefined();
      expect(skill.catalog?.parentSkillIds).toBeUndefined();
    }
  });

  it('keeps unknown built-in skills out of the primary catalog by default', () => {
    const skills = buildSkillDefs({
      builtinSkills: [makeSkill('experimental-helper', 'Experimental helper.')],
    });

    expect(findSkill(skills, 'experimental-helper').catalog).toMatchObject({
      role: 'standalone',
      source: 'builtin',
      visibility: 'advanced',
    });
  });

  it('includes project and personal file skills as editable catalog entries', () => {
    const skills = buildSkillDefs({
      builtinSkills: [],
      scan: makeScanResult({
        personal: [makeSkill('reference-check', 'Check references.', 'personal')],
        project: [makeSkill('review', 'Review workspace.', 'project')],
      }),
    });

    expect(findSkill(skills, 'reference-check').catalog).toMatchObject({
      source: 'personal',
      editable: true,
      actions: [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }],
    });
    expect(findSkill(skills, 'review').catalog).toMatchObject({
      source: 'project',
      editable: true,
    });
  });

  it('derives file catalog facts from the scan bucket and ignores poisoned runtime metadata', () => {
    const poisoned = makeSkill('portable-review', 'Portable description.', 'builtin');
    poisoned.catalog = {
      role: 'persona',
      source: 'builtin',
      visibility: 'hidden',
      editable: false,
      actions: [{ id: 'run' }],
    };
    poisoned.nekoOverlay = {
      schemaVersion: 1,
      interface: {
        displayName: 'Portable Review',
        shortDescription: 'Overlay description.',
        iconSmall: 'check-circle',
      },
    };

    const skills = buildSkillDefs({
      builtinSkills: [],
      scan: makeScanResult({ project: [poisoned] }),
    });

    expect(findSkill(skills, 'portable-review')).toMatchObject({
      name: 'Portable Review',
      description: 'Overlay description',
      icon: 'check-circle',
      catalog: {
        role: 'standalone',
        source: 'project',
        visibility: 'primary',
        editable: true,
        actions: [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }],
      },
    });
  });

  it('applies deterministic source precedence for duplicate ids', () => {
    const skills = buildSkillDefs({
      builtinSkills: [makeSkill('review', 'Builtin review.', 'builtin')],
      scan: makeScanResult({
        personal: [makeSkill('review', 'Personal review.', 'personal')],
        project: [makeSkill('review', 'Project review.', 'project')],
      }),
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: 'review',
      description: 'Project review',
      catalog: { source: 'project' },
    });
  });

  it('preserves locales and media workflow tags on built-in projections', () => {
    const skill = makeSkill('storyboard', 'Create canonical storyboards.');
    skill.mediaWorkflow = {
      tags: ['comic', 'storyboard'],
    };

    const def = toBuiltinSkillDef(skill, {
      'zh-cn': {
        name: '漫画转分镜表',
        description: '分析漫画。',
        tags: ['漫画', '分镜'],
      },
    });

    expect(def.tags).toEqual(['comic', 'storyboard']);
    expect(def.locales?.['zh-cn']).toEqual({
      name: '漫画转分镜表',
      description: '分析漫画。',
      tags: ['漫画', '分镜'],
    });
  });

  it('updates synchronous provider snapshot when file scans change', () => {
    const provider = createSkillCatalogProvider({
      builtinSkills: [makeSkill('media-quality-review', 'Review quality.')],
    });

    expect(provider.getSkills().map((skill) => skill.id)).toEqual(['media-quality-review']);

    provider.updateScanResult(
      makeScanResult({
        project: [makeSkill('project-skill', 'Workspace skill.', 'project')],
      }),
    );

    expect(provider.getSkills().map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['media-quality-review', 'project-skill']),
    );
  });

  it('lets project entries outrank plugins and plugins outrank builtins', () => {
    const skills = applySkillSourcePrecedence([
      {
        id: 'convert',
        name: 'Convert',
        description: 'Builtin convert.',
        command: 'run',
        catalog: makeCatalog('builtin'),
      },
      {
        id: 'convert',
        name: 'Convert',
        description: 'Plugin convert.',
        command: 'run',
        catalog: makeCatalog('plugin'),
      },
      {
        id: 'convert',
        name: 'Convert',
        description: 'Project convert.',
        command: 'run',
        catalog: makeCatalog('project'),
      },
    ]);

    expect(skills).toHaveLength(1);
    expect(skills[0]?.catalog.source).toBe('project');
  });
});

function findSkill(skills: readonly { readonly id: string }[], id: string) {
  const skill = skills.find((candidate) => candidate.id === id);
  expect(skill).toBeDefined();
  return skill as Exclude<typeof skill, undefined>;
}

function makeSkill(name: string, description: string, source: Skill['source'] = 'builtin'): Skill {
  return {
    name,
    description,
    content: `# ${name}`,
    source,
    enabled: true,
    icon: 'sparkle',
    portableDefinition: {
      name,
      description,
      body: `# ${name}`,
    },
  };
}

function makeScanResult(input: {
  readonly personal?: readonly Skill[];
  readonly project?: readonly Skill[];
}): SkillScanResult {
  return {
    personal: { skills: [...(input.personal ?? [])], commands: [] },
    project: { skills: [...(input.project ?? [])], commands: [] },
    errors: [],
  };
}

function makeCatalog(source: 'builtin' | 'project' | 'plugin') {
  return {
    role: 'standalone' as const,
    source,
    visibility: 'primary' as const,
    editable: source === 'project',
    actions: [{ id: 'run' as const }],
  };
}
