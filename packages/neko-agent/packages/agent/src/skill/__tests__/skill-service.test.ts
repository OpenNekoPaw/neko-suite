/**
 * SkillService & SkillInjector Tests
 *
 * Tests for service orchestration (discovery, application, tool guard)
 * and injector (prompt injection, argument interpolation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillService, createSkillService } from '../skill-service';
import { SkillInjector } from '../skill-injector';
import { KeywordSkillMatcher } from '../skill-matcher';
import type { Skill, ISkillRegistry } from '@neko/shared';

// =============================================================================
// Test Helpers
// =============================================================================

function makeSkill(overrides?: Partial<Skill>): Skill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    content: '# Test Skill\nDo something',
    keywords: ['test'],
    allowedTools: ['Read', 'Write'],
    enabled: true,
    source: 'test',
    ...overrides,
  } as Skill;
}

function makeMockRegistry(): ISkillRegistry {
  const skills: Skill[] = [];
  return {
    registerSkill: vi.fn((s: Skill) => {
      skills.push(s);
    }),
    unregisterSkill: vi.fn((name: string) => {
      const idx = skills.findIndex((s) => s.name === name);
      if (idx >= 0) skills.splice(idx, 1);
    }),
    getSkill: vi.fn((name: string) => skills.find((s) => s.name === name)),
    listSkills: vi.fn(() => skills.filter((s) => s.enabled)),
    listAllSkills: vi.fn(() => [...skills]),
    getSkillByCommand: vi.fn(() => undefined),
    searchSkills: vi.fn(() => []),
    ensureLoaded: vi.fn(async (name: string) => skills.find((s) => s.name === name)),
    get skillCount() {
      return skills.length;
    },
    clear: vi.fn(() => {
      skills.length = 0;
    }),
  } as unknown as ISkillRegistry;
}

// =============================================================================
// SkillInjector Tests
// =============================================================================

describe('SkillInjector', () => {
  let injector: SkillInjector;

  beforeEach(() => {
    injector = new SkillInjector();
  });

  // --- injectSkill ---

  it('injectSkill returns injection with skill content', async () => {
    const skill = makeSkill({ content: '# My Skill\nDo the thing' });
    const injection = await injector.injectSkill(skill);

    expect(injection.systemPrompt).toBe('# My Skill\nDo the thing');
  });

  it('injectSkill adds support files hint when directoryPath and supportFileRefs exist', async () => {
    const skill = makeSkill({
      directoryPath: '/path/to/skill',
      supportFileRefs: ['ref.md'],
      content: '# Skill with refs',
    });
    const injection = await injector.injectSkill(skill);

    expect(injection.systemPrompt).toContain('Support files available in');
    expect(injection.systemPrompt).toContain('/path/to/skill');
  });

  it('injectSkill does not add hint when no supportFileRefs', async () => {
    const skill = makeSkill({
      directoryPath: '/path/to/skill',
      supportFileRefs: undefined,
      content: '# No refs',
    });
    const injection = await injector.injectSkill(skill);

    expect(injection.systemPrompt).toBe('# No refs');
    expect(injection.systemPrompt).not.toContain('Support files');
  });

  it('injectSkill returns correct allowedTools and name', async () => {
    const skill = makeSkill({
      name: 'my-skill',
      allowedTools: ['Read', 'Grep'],
    });
    const injection = await injector.injectSkill(skill);

    expect(injection.allowedTools).toEqual(['Read', 'Grep']);
    expect(injection.name).toBe('my-skill');
    expect(injection.type).toBe('skill');
  });

  it('injectSkill passes model from skill', async () => {
    const skill = makeSkill({ model: 'claude-3' });
    const injection = await injector.injectSkill(skill);

    expect(injection.model).toBe('claude-3');
  });

  // --- argument interpolation via supportsArguments ---

  it('injectSkill interpolates $ARGUMENTS when supportsArguments is true', async () => {
    const skill = makeSkill({ content: 'Run with $ARGUMENTS', supportsArguments: true });
    const injection = await injector.injectSkill(skill, 'foo bar');

    expect(injection.systemPrompt).toBe('Run with foo bar');
  });

  it('injectSkill interpolates positional $1 $2 when supportsArguments is true', async () => {
    const skill = makeSkill({
      content: 'Review PR $1 with priority $2',
      supportsArguments: true,
    });
    const injection = await injector.injectSkill(skill, '123 high');

    expect(injection.systemPrompt).toBe('Review PR 123 with priority high');
  });

  it('injectSkill handles quoted arguments', async () => {
    const skill = makeSkill({ content: 'A=$1 B=$2 C=$3', supportsArguments: true });
    const injection = await injector.injectSkill(skill, 'foo "bar baz" qux');

    expect(injection.systemPrompt).toBe('A=foo B=bar baz C=qux');
  });

  it('injectSkill cleans placeholders when no args and supportsArguments', async () => {
    const skill = makeSkill({
      content: 'Review PR $1 with priority $2',
      supportsArguments: true,
    });
    const injection = await injector.injectSkill(skill);

    expect(injection.systemPrompt).toBe('Review PR  with priority ');
  });

  it('injectSkill returns type slash-command when skill has command field', async () => {
    const skill = makeSkill({ command: 'test', supportsArguments: true });
    const injection = await injector.injectSkill(skill, '123 high');

    expect(injection.type).toBe('slash-command');
  });
});

// =============================================================================
// SkillService Tests
// =============================================================================

describe('SkillService', () => {
  // --- constructor ---

  it('constructor uses defaults when no config', () => {
    const service = createSkillService();
    expect(service.skillCount).toBe(0);
  });

  // --- discover ---

  it('discover returns matches without applying skills', () => {
    const skill = makeSkill({
      name: 'commit-helper',
      description: 'Help with git commits',
      mediaWorkflow: {
        useCases: ['write git commit messages'],
        operations: ['commit'],
        tags: ['git'],
      },
    });
    const registry = makeMockRegistry();

    registry.registerSkill(skill);

    const matcher = { match: vi.fn(() => [{ skill, relevance: 0.95, reason: 'test match' }]) };
    const service = new SkillService({ registry, matcher });
    const result = service.discover('commit my changes');

    expect(matcher.match).toHaveBeenCalledWith('commit my changes', [skill]);
    expect(result).toEqual({
      found: true,
      matches: [{ skill, relevance: 0.95, reason: 'test match' }],
      topMatch: { skill, relevance: 0.95, reason: 'test match' },
      requiresConfirmation: false,
    });
  });

  // --- apply ---

  it('apply returns injection payload', async () => {
    const service = createSkillService();
    const skill = makeSkill({ name: 'active-skill' });

    const injection = await service.apply(skill);

    expect(injection).toBeDefined();
    expect(injection.name).toBe('active-skill');
  });

  it('apply returns injection with allowedTools', async () => {
    const service = createSkillService();
    const skill = makeSkill({ allowedTools: ['Read', 'Write'] });

    const injection = await service.apply(skill);

    expect(injection.allowedTools).toEqual(['Read', 'Write']);
  });

  // --- discover ---

  it('discover returns found:false when no matches', () => {
    const service = new SkillService();

    const result = service.discover('something random');

    expect(result.found).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  // --- discoverAndApply ---

  it('discoverAndApply returns null when no match', async () => {
    const service = new SkillService();

    const result = await service.discoverAndApply('nothing here');

    expect(result).toBeNull();
  });

  it('discoverAndApply does not activate natural-language matches', async () => {
    const skill = makeSkill({ name: 'needs-confirm' });
    const registry = makeMockRegistry();
    registry.registerSkill(skill);
    const service = new SkillService({ registry });
    const applySpy = vi.spyOn(service, 'apply');

    const confirmCallback = vi.fn().mockResolvedValue(true);
    const result = await service.discoverAndApply('test', confirmCallback);

    expect(result).toBeNull();
    expect(confirmCallback).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('discoverAndApply ignores decline callbacks because natural-language apply is removed', async () => {
    const skill = makeSkill({ name: 'declined-skill' });
    const registry = makeMockRegistry();
    registry.registerSkill(skill);
    const service = new SkillService({ registry });

    const confirmCallback = vi.fn().mockResolvedValue(false);
    const result = await service.discoverAndApply('test', confirmCallback);

    expect(result).toBeNull();
    expect(confirmCallback).not.toHaveBeenCalled();
  });
});

describe('KeywordSkillMatcher', () => {
  function makeMediaWorkflowSkills(): Skill[] {
    return [
      makeSkill({
        name: 'storyboard',
        description:
          'Create canonical storyboards from prompts, scripts, documents, comics, or image sequences. Use only for storyboard or shot breakdown requests, not content-only analysis.',
        mediaWorkflow: {
          acceptedModalities: ['text', 'document', 'comic', 'image-sequence'],
          producedArtifacts: ['CreativeTable'],
          tags: ['storyboard', 'comic', 'manga'],
        },
      }),
      makeSkill({
        name: 'media-production',
        description:
          'Coordinate explicit source-to-video and source-to-animation production, not content-only document or comic analysis.',
        mediaWorkflow: {
          acceptedModalities: ['text', 'document', 'comic', 'image-sequence'],
          producedArtifacts: [
            'StoryboardTable',
            'storyboard-plan-overlay',
            'cut-storyboard-payload',
            'generated-media-ref',
            'workflow-execution-summary',
          ],
          tags: ['orchestration', 'storyboard', 'animation', 'video'],
        },
      }),
    ];
  }

  it('matches Chinese storyboard-table requests through produced artifacts', () => {
    const matcher = new KeywordSkillMatcher();
    const storyboardSkill = makeSkill({
      name: 'storyboard',
      description: 'Convert manga/comic pages into reviewable CreativeTable storyboards.',
      mediaWorkflow: {
        producedArtifacts: ['CreativeTable'],
        tags: ['comic', 'manga', 'storyboard'],
      },
    });

    const matches = matcher.match('生成分镜表', [storyboardSkill]);

    expect(matches[0]).toEqual(
      expect.objectContaining({
        skill: storyboardSkill,
        relevance: 0.95,
        reason: expect.stringContaining("Candidate artifact 'CreativeTable'"),
      }),
    );
  });

  it('prioritizes focused storyboard producers over broad media orchestrators', () => {
    const matcher = new KeywordSkillMatcher();
    const broadSkill = makeSkill({
      name: 'media-production',
      description: 'Coordinate source-to-video production workflows.',
      mediaWorkflow: {
        producedArtifacts: ['StoryboardTable', 'storyboard-plan-overlay', 'cut-storyboard-payload'],
        tags: ['orchestration', 'storyboard', 'video'],
      },
    });
    const focusedSkill = makeSkill({
      name: 'storyboard',
      description: 'Convert manga/comic pages into reviewable CreativeTable storyboards.',
      mediaWorkflow: {
        producedArtifacts: ['CreativeTable'],
        tags: ['comic', 'manga', 'storyboard'],
      },
    });

    const matches = matcher.match('生成分镜表', [broadSkill, focusedSkill]);

    expect(matches.map((match) => match.skill.name)).toEqual(['storyboard', 'media-production']);
  });

  it('does not auto-match production/storyboard skills for content-only EPUB analysis', () => {
    const matcher = new KeywordSkillMatcher();

    const matches = matcher.match('分析这个 EPUB 前10页', makeMediaWorkflowSkills());

    expect(matches.map((match) => match.skill.name)).toEqual([]);
  });

  it('does not auto-match production/storyboard skills for content-only comic page analysis', () => {
    const matcher = new KeywordSkillMatcher();

    const matches = matcher.match('请分析漫画前 10 页的人物和剧情', makeMediaWorkflowSkills());

    expect(matches.map((match) => match.skill.name)).toEqual([]);
  });

  it('does not auto-match production/storyboard skills for conceptual planning questions', () => {
    const matcher = new KeywordSkillMatcher();

    const matches = matcher.match('为什么不直接生成 AnimationPlan？是否应该用分镜表代替？', [
      ...makeMediaWorkflowSkills(),
      makeSkill({
        name: 'video',
        description:
          'Convert existing CompositeArtifact StoryboardTable domain blocks into animation plan overlays when the user asks for animation/video planning.',
        mediaWorkflow: {
          inputArtifacts: ['StoryboardTable'],
          producedArtifacts: ['storyboard-plan-overlay'],
          tags: ['storyboard', 'storyboard-plan-overlay', 'motion'],
        },
      }),
    ]);

    expect(matches.map((match) => match.skill.name)).toEqual([]);
  });

  it('routes explicit EPUB storyboard requests to storyboard', () => {
    const matcher = new KeywordSkillMatcher();

    const matches = matcher.match('把这个 EPUB 前10页生成分镜表', makeMediaWorkflowSkills());

    expect(matches[0]?.skill.name).toBe('storyboard');
    expect(matches[0]?.reason).toContain("Candidate artifact 'CreativeTable'");
  });

  it('routes explicit EPUB animation requests to media-production', () => {
    const matcher = new KeywordSkillMatcher();

    const matches = matcher.match('把这个 EPUB 前10页转动画并生成视频', makeMediaWorkflowSkills());

    expect(matches.map((match) => match.skill.name)).toContain('media-production');
  });

  it('routes explicit EPUB animation requests from workflow metadata without concrete skill names', () => {
    const matcher = new KeywordSkillMatcher();
    const broadCoordinator = makeSkill({
      name: 'broad-production-coordinator',
      description: 'Coordinate explicit media production across several artifact handoff steps.',
      mediaWorkflow: {
        acceptedModalities: ['document'],
        producedArtifacts: ['CreativeTable', 'AnimationPlan', 'workflow-execution-summary'],
        tags: ['orchestration', 'animation'],
        operations: ['coordinate-media-production', 'select-focused-skill'],
      },
    });
    const focusedComicProducer = makeSkill({
      name: 'focused-source-animation',
      description: 'Create animation planning artifacts from comic or manga document input.',
      mediaWorkflow: {
        acceptedModalities: ['comic', 'manga', 'document'],
        producedArtifacts: ['AnimationPlan', 'generated-media-ref'],
        artifactProfiles: ['storyboard', 'shot-asset-prep'],
        tags: ['comic', 'manga', 'animation'],
        operations: ['create-animation-plan', 'prepare-shot-images'],
      },
    });

    const matches = matcher.match('把这个 EPUB 前10页转动画并生成视频', [
      broadCoordinator,
      focusedComicProducer,
    ]);

    expect(matches.map((match) => match.skill.name).slice(0, 2)).toEqual([
      'focused-source-animation',
      'broad-production-coordinator',
    ]);
  });
});
