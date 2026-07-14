import { describe, expect, it, vi } from 'vitest';
import type { Skill, SkillInjection } from '@neko/shared';
import { ConversationSkillRuntime } from '../conversation-skill-runtime';
import { createConversationSkillProvider } from '../skill-meta-provider';
import { SkillInjectionCoordinator } from '../skill-injection-coordinator';
import type { SkillInjectionCoordinatorDeps } from '../skill-injection-coordinator';
import { SkillInjectionModule } from '../../prompt/modules/skill/skill-injection-module';
import type { SkillService } from '../skill-service';

describe('current single-Skill lifecycle characterization', () => {
  it('explicit skill invocation stores one active Skill per conversation and bridges injection', async () => {
    const review = createSkill('review');
    const storyboard = createSkill('storyboard');
    const skillService = createSkillService([review, storyboard]);
    const bridge = {
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as unknown as SkillService,
      agentBridge: bridge,
      now: () => 100,
    });

    await expect(
      runtime.applySkillInvocation({
        conversationId: 'conv-1',
        skillName: 'review',
        args: 'changed files',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        applied: true,
        skill: review,
        injection: expect.objectContaining({
          name: 'review',
          systemPrompt: 'review instructions: changed files',
        }),
      }),
    );

    expect(runtime.getActiveSkill('conv-1')).toEqual({
      skill: expect.objectContaining({
        name: 'review',
        content: 'review instructions: changed files',
      }),
      injection: expect.objectContaining({ name: 'review' }),
      appliedAt: 100,
    });
    expect(runtime.getActiveSkill('conv-2')).toBeUndefined();
    expect(bridge.applySkillInjection).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ name: 'review' }),
      review,
    );
  });

  it('second explicit Skill invocation replaces the conversation active Skill state', async () => {
    const review = createSkill('review');
    const storyboard = createSkill('storyboard');
    const skillService = createSkillService([review, storyboard]);
    const runtime = new ConversationSkillRuntime({
      skillService: skillService as unknown as SkillService,
      now: () => 200,
    });

    await runtime.applySkillInvocation({ conversationId: 'conv-1', skillName: 'review' });
    await runtime.applySkillInvocation({ conversationId: 'conv-1', skillName: 'storyboard' });

    expect(runtime.getActiveSkill('conv-1')).toEqual({
      skill: storyboard,
      injection: expect.objectContaining({ name: 'storyboard' }),
      appliedAt: 200,
    });
  });

  it('meta-tool provider ActivateSkill applies through the same host effect', async () => {
    const review = createSkill('review', { allowedTools: ['ReadDocument'] });
    const injection = createInjection('review', {
      allowedTools: ['ReadDocument'],
      systemPrompt: 'Review instructions',
    });
    const skillService = createSkillService([review], injection);
    const effects = {
      getActiveSkill: vi.fn(() => undefined),
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const provider = createConversationSkillProvider({
      skillService: skillService as unknown as SkillService,
      effects,
    });

    await expect(
      provider.activateSkill({ name: 'review', reason: 'Agent selected review workflow' }),
    ).resolves.toEqual({
      success: true,
      skillName: 'review',
      allowedTools: ['ReadDocument'],
    });
    expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('review');
    expect(skillService.apply).toHaveBeenCalledWith(review);
    expect(effects.applySkillInjection).toHaveBeenCalledWith(injection, review);
  });

  it('meta-tool provider DeactivateSkill always delegates clearActiveSkill', async () => {
    const effects = {
      getActiveSkill: vi.fn(() => undefined),
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };
    const provider = createConversationSkillProvider({
      skillService: createSkillService([]) as unknown as SkillService,
      effects,
    });

    await expect(provider.deactivateSkill()).resolves.toEqual({
      success: true,
    });
    expect(effects.clearActiveSkill).toHaveBeenCalledOnce();
  });

  it('SkillInjectionCoordinator keeps exactly one active injection and cleans previous tracks', () => {
    const deps = createCoordinatorDeps();
    const coordinator = new SkillInjectionCoordinator(deps);

    coordinator.apply(
      createInjection('review', { allowedTools: ['ReadDocument'] }),
      createSkill('review'),
    );
    coordinator.apply(
      createInjection('storyboard', { allowedTools: ['ReadImage'] }),
      createSkill('storyboard'),
    );

    expect(deps.promptComposer.removeSection).toHaveBeenCalledWith('skill:review');
    expect(deps.permissionHooks.removeAllowRule).toHaveBeenCalledWith('ReadDocument');
    expect(coordinator.getActiveInjectionName()).toBe('storyboard');
    expect(coordinator.getActiveSkill()?.name).toBe('storyboard');
    expect(coordinator.getActiveSkillAllowedTools()).toEqual(['ReadImage']);
    expect(coordinator.isToolAllowed('ReadImage')).toBe(true);
    expect(coordinator.isToolAllowed('ReadDocument')).toBe(false);
  });

  it('SkillInjectionCoordinator clearActive removes prompt, permissions, and active guard', () => {
    const deps = createCoordinatorDeps();
    const coordinator = new SkillInjectionCoordinator(deps);

    coordinator.apply(
      createInjection('review', { allowedTools: ['ReadDocument'] }),
      createSkill('review'),
    );
    coordinator.clearActive();

    expect(deps.promptComposer.removeSection).toHaveBeenCalledWith('skill:review');
    expect(deps.permissionHooks.removeAllowRule).toHaveBeenCalledWith('ReadDocument');
    expect(coordinator.getActiveSkill()).toBeUndefined();
    expect(coordinator.getActiveSkillAllowedTools()).toBeUndefined();
    expect(coordinator.hasActiveInjection()).toBe(false);
    expect(coordinator.isToolAllowed('ReadDocument')).toBe(true);
  });
});

function createSkill(name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `${name} skill`,
    content: `${name} instructions`,
    enabled: true,
    source: 'project',
    ...overrides,
  };
}

function createInjection(name: string, overrides: Partial<SkillInjection> = {}): SkillInjection {
  return {
    name,
    systemPrompt: `${name} instructions`,
    type: 'skill',
    ...overrides,
  };
}

function createSkillService(skills: readonly Skill[], fixedInjection?: SkillInjection) {
  return {
    registry: {
      listSkills: vi.fn(() => skills),
      getSkill: vi.fn((name: string) => skills.find((skill) => skill.name === name)),
      ensureLoaded: vi.fn(async (name: string) => skills.find((skill) => skill.name === name)),
    },
    apply: vi.fn(async (skill: Skill, args?: string) => {
      if (fixedInjection) return fixedInjection;
      return createInjection(skill.name, {
        systemPrompt: args ? `${skill.content}: ${args}` : skill.content,
        allowedTools: skill.allowedTools,
      });
    }),
  };
}

function createCoordinatorDeps() {
  const promptComposer = {
    setBase: vi.fn(),
    setSection: vi.fn(),
    removeSection: vi.fn().mockReturnValue(true),
    removeSectionsByPrefix: vi.fn().mockReturnValue(0),
    hasSection: vi.fn().mockReturnValue(false),
    getSection: vi.fn(),
    compose: vi.fn().mockReturnValue('prompt'),
    composeStructured: vi.fn().mockReturnValue({
      text: 'prompt',
      sections: [],
      cacheBoundaries: [],
    }),
    getTotalTokens: vi.fn().mockReturnValue(0),
    getLayerUsage: vi.fn(),
    dumpSections: vi.fn().mockReturnValue([]),
    projectComposition: vi.fn().mockReturnValue([]),
    reset: vi.fn(),
  };
  const permissionHooks = {
    addAllowRule: vi.fn(),
    removeAllowRule: vi.fn(),
  };
  const deps: SkillInjectionCoordinatorDeps & {
    promptComposer: typeof promptComposer;
    permissionHooks: typeof permissionHooks;
  } = {
    promptComposer,
    permissionHooks,
    getPermissionHooks: () =>
      permissionHooks as unknown as import('../../permission/permission-manager-types').IPermissionManager,
    syncSystemPrompt: vi.fn(),
    skillInjectionModule: new SkillInjectionModule(),
  };
  return deps;
}
