import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { createConversationSkillProvider } from '../skill-meta-provider';
import type { SkillService } from '../skill-service';

describe('createConversationSkillProvider', () => {
  it('lists enabled skills through the meta-tool provider shape', async () => {
    const skill = createSkill({
      name: 'review',
      description: 'Review code',
      domain: 'media',
      referencedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
      mediaWorkflow: {
        acceptedModalities: ['comic'],
        producedArtifacts: ['StoryboardTable'],
      },
    });
    const provider = createConversationSkillProvider({
      skillService: createSkillServiceMock({ skills: [skill] }),
      effects: createEffects(),
    });

    await expect(Promise.resolve(provider.listSkills())).resolves.toEqual([
      {
        name: 'review',
        description: 'Review code',
        domain: 'media',
        relatedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
        mediaWorkflow: {
          acceptedModalities: ['comic'],
          producedArtifacts: ['StoryboardTable'],
        },
      },
    ]);
  });

  it('activates a lazy-loaded skill and applies the injection to the owning conversation', async () => {
    const skill = createSkill({ name: 'commit', allowedTools: ['bash'] });
    const injection: SkillInjection = {
      name: 'commit',
      type: 'skill',
      systemPrompt: 'Commit instructions',
      allowedTools: ['bash'],
    };
    const effects = createEffects();
    const skillService = createSkillServiceMock({ skills: [skill], injection });
    const provider = createConversationSkillProvider({ skillService, effects });

    await expect(provider.activateSkill('commit')).resolves.toEqual({
      success: true,
      message: 'Activated skill "commit"',
      allowedTools: ['bash'],
    });
    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('commit');
    expect(skillService.apply).toHaveBeenCalledWith(skill);
    expect(effects.applySkillInjection).toHaveBeenCalledWith(injection, skill);
  });

  it('activates a related focused skill through the same lazy loading path without inheriting parent tools', async () => {
    const parent = createSkill({
      name: 'media-to-video',
      allowedTools: ['ReadDocument', 'GenerateVideo'],
      referencedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
    });
    const child = createSkill({
      name: 'comic-to-storyboard',
      allowedTools: ['ReadDocument', 'ReadImage'],
    });
    const injection: SkillInjection = {
      name: 'comic-to-storyboard',
      type: 'skill',
      systemPrompt: 'Comic storyboard instructions',
      allowedTools: ['ReadDocument', 'ReadImage'],
    };
    const effects = createEffects();
    const skillService = createSkillServiceMock({ skills: [parent, child], injection });
    const provider = createConversationSkillProvider({ skillService, effects });

    await expect(provider.activateSkill('comic-to-storyboard')).resolves.toEqual({
      success: true,
      message: 'Activated skill "comic-to-storyboard"',
      allowedTools: ['ReadDocument', 'ReadImage'],
    });

    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('comic-to-storyboard');
    expect(effects.applySkillInjection).toHaveBeenCalledWith(injection, child);
    expect(injection.allowedTools).not.toContain('GenerateVideo');
  });

  it('returns a failure when the requested skill cannot be loaded', async () => {
    const warn = vi.fn();
    const provider = createConversationSkillProvider({
      skillService: createSkillServiceMock({ skills: [] }),
      effects: createEffects(),
      logger: { warn },
    });

    await expect(provider.activateSkill('missing')).resolves.toEqual({
      success: false,
      message: 'Skill "missing" not found',
    });
    expect(warn).toHaveBeenCalledWith('Skill "missing" not found during activation');
  });

  it('reports and logs activation errors without applying partial state', async () => {
    const error = new Error('subpackage missing');
    const logger = { error: vi.fn() };
    const effects = createEffects();
    const provider = createConversationSkillProvider({
      skillService: createSkillServiceMock({
        skills: [createSkill({ name: 'video' })],
        applyError: error,
      }),
      effects,
      logger,
    });

    await expect(provider.activateSkill('video')).resolves.toEqual({
      success: false,
      message: 'subpackage missing',
    });
    expect(effects.applySkillInjection).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Failed to activate skill', {
      name: 'video',
      error,
    });
  });

  it('clears the active skill through the provided host effect', async () => {
    const effects = createEffects();
    const provider = createConversationSkillProvider({
      skillService: createSkillServiceMock({ skills: [] }),
      effects,
    });

    await expect(provider.deactivateSkill()).resolves.toEqual({
      success: true,
      message: 'Skill deactivated',
    });
    expect(effects.clearActiveSkill).toHaveBeenCalled();
  });
});

function createSkill(overrides: Partial<Skill>): Skill {
  return {
    name: overrides.name ?? 'skill',
    description: overrides.description ?? '',
    content: overrides.content ?? '',
    enabled: overrides.enabled ?? true,
    source: overrides.source ?? 'builtin',
    allowedTools: overrides.allowedTools,
    domain: overrides.domain,
    referencedSkills: overrides.referencedSkills,
    mediaWorkflow: overrides.mediaWorkflow,
  };
}

function createSkillServiceMock(input: {
  skills: Skill[];
  injection?: SkillInjection;
  applyError?: Error;
}): SkillService {
  const registry = {
    listSkills: vi.fn(() => input.skills),
    ensureLoaded: vi.fn(async (name: string) => input.skills.find((skill) => skill.name === name)),
  };
  const apply = input.applyError
    ? vi.fn(async () => {
        throw input.applyError;
      })
    : vi.fn(async (skill: Skill) => input.injection ?? createInjection(skill.name));

  return {
    registry,
    apply,
  } as unknown as SkillService;
}

function createEffects() {
  return {
    getActiveSkill: vi.fn(() => undefined),
    applySkillInjection: vi.fn(),
    clearActiveSkill: vi.fn(),
  };
}

function createInjection(skillName: string): SkillInjection {
  return {
    name: skillName,
    type: 'skill',
    systemPrompt: `${skillName} instructions`,
    allowedTools: [],
  };
}
