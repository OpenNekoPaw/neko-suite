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
  it('classifies media orchestrators and focused skills', () => {
    const skills = buildSkillDefs({
      builtinSkills: [
        makeSkill('media-to-video', 'Coordinate media to video.'),
        makeSkill('comic-to-storyboard', 'Analyze comics.'),
        makeSkill('comic-to-animation', 'Animate comics.'),
        makeSkill('script-generation', 'Write scripts.'),
        makeSkill('script-to-timeline', 'Convert scripts.'),
        makeSkill('video-editing', 'Edit timelines.'),
      ],
    });

    const media = findSkill(skills, 'media-to-video');
    const comic = findSkill(skills, 'comic-to-storyboard');
    const comicAnimation = findSkill(skills, 'comic-to-animation');
    const script = findSkill(skills, 'script-generation');
    const scriptToTimeline = findSkill(skills, 'script-to-timeline');
    const videoEditing = findSkill(skills, 'video-editing');

    expect(media.catalog).toMatchObject({
      role: 'orchestrator',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'media-to-video',
      editable: false,
    });
    expect(comic.catalog).toMatchObject({
      role: 'focused-skill',
      source: 'builtin',
      visibility: 'advanced',
      groupId: 'media-to-video',
      parentSkillIds: ['media-to-video'],
    });
    expect(comicAnimation.catalog).toMatchObject({
      role: 'focused-skill',
      source: 'builtin',
      visibility: 'advanced',
      groupId: 'media-to-video',
      parentSkillIds: ['media-to-video'],
    });
    expect(script.catalog).toMatchObject({
      role: 'orchestrator',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'script-workflow',
    });
    expect(scriptToTimeline.catalog).toMatchObject({
      role: 'focused-skill',
      source: 'builtin',
      visibility: 'advanced',
      groupId: 'script-workflow',
      parentSkillIds: ['script-generation'],
    });
    expect(videoEditing.catalog).toMatchObject({
      role: 'quick-action',
      source: 'builtin',
      visibility: 'primary',
      groupId: 'post-production',
    });
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

  it('keeps persona skills out of the primary catalog', () => {
    const skills = buildSkillDefs({
      builtinSkills: [
        makeSkill('creation-persona', 'Specify persona.'),
        makeSkill('execution-persona', 'Execute persona.'),
        makeSkill('iteration-persona', 'Iterate persona.'),
        makeSkill('quality-assessment', 'Review quality.'),
      ],
    });

    expect(skills.map((skill) => skill.id)).toEqual(['quality-assessment']);
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
    const skill = makeSkill('comic-to-storyboard', 'Analyze comics.');
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
      builtinSkills: [makeSkill('quality-assessment', 'Review quality.')],
    });

    expect(provider.getSkills().map((skill) => skill.id)).toEqual(['quality-assessment']);

    provider.updateScanResult(
      makeScanResult({
        project: [makeSkill('project-skill', 'Workspace skill.', 'project')],
      }),
    );

    expect(provider.getSkills().map((skill) => skill.id)).toEqual(
      expect.arrayContaining(['quality-assessment', 'project-skill']),
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
