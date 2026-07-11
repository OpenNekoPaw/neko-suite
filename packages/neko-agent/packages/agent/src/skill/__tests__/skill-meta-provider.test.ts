import { describe, expect, it, vi } from 'vitest';
import type { CreateSkillInput, CreateSkillResult, Skill, SkillInjection } from '@neko/shared';
import { GetContextTool } from '../../tools/core/meta-tools';
import { createConversationSkillProvider } from '../skill-meta-provider';
import { SkillRegistry } from '../skill-registry';
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

  it('projects portable, overlay, and Registry-owned Host facts through GetContext', async () => {
    const skill = createSkill({
      name: 'portable-review',
      description: 'Poisoned runtime description',
      source: 'project',
      portableDefinition: {
        name: 'portable-review',
        description: 'Portable review guidance.',
        body: '# Portable review',
      },
      nekoOverlay: {
        schemaVersion: 1,
        interface: {
          displayName: 'Portable Review',
          shortDescription: 'Review with the portable workflow.',
          iconSmall: 'check-circle',
        },
        dependencies: {
          capabilities: [{ id: 'review.read', requirement: 'required' }],
        },
        relationships: {
          skills: [{ name: 'evidence-check', relationship: 'supports' }],
        },
      },
      hostProjection: {
        source: 'builtin',
        location: { rootId: 'poisoned-root', relativePath: '../../escape' },
        provenance: 'builtin',
        enabled: true,
        editable: false,
        trusted: true,
        compatibility: { state: 'compatible', diagnostics: [] },
        fingerprint: 'poisoned-fingerprint',
        catalogActions: [{ id: 'run' }],
      },
    });
    Object.assign(skill, {
      manifest: {
        catalog: {
          source: 'builtin',
          editable: false,
          actions: ['run'],
        },
      },
    });

    const registry = new SkillRegistry({
      resolveHostProjectionContext: () => ({
        availableCapabilities: new Set(['review.read']),
      }),
    });
    registry.registerSkill(skill);
    const provider = createConversationSkillProvider({
      skillService: createSkillServiceWithRegistry(registry),
      effects: createEffects(),
    });
    const tool = new GetContextTool({} as never);
    tool.setSkillProvider(provider);

    const result = await tool.execute({});

    expect(result).toMatchObject({
      success: true,
      data: {
        activeSkill: null,
        registeredSkills: [
          {
            name: 'portable-review',
            description: 'Review with the portable workflow.',
            interface: {
              displayName: 'Portable Review',
              shortDescription: 'Review with the portable workflow.',
              iconSmall: 'check-circle',
            },
            relationships: {
              skills: [{ name: 'evidence-check', relationship: 'supports' }],
            },
            host: {
              source: 'project',
              location: {
                rootId: 'project-agent-skills',
                relativePath: 'portable-review',
              },
              provenance: 'workspace',
              enabled: true,
              editable: true,
              trusted: false,
              compatibility: { state: 'compatible', diagnostics: [] },
              catalogActions: [
                { id: 'run' },
                { id: 'edit' },
                { id: 'reveal' },
                { id: 'duplicate' },
              ],
            },
          },
        ],
      },
    });
    const registered = registry.getSkill('portable-review');
    expect(registered?.hostProjection?.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(registered?.hostProjection?.fingerprint).not.toBe('poisoned-fingerprint');
  });

  it('delegates native creation without mutating activation lifecycle state', async () => {
    const input: CreateSkillInput = {
      target: 'project',
      skill: {
        name: 'story-outline',
        description: 'Create a reusable story outline.',
        body: '# Story outline\n\nFollow the project structure.',
        metadata: { audience: 'writers' },
        allowedTools: ['ReadDocument'],
      },
      resources: [
        {
          path: 'references/example.md',
          encoding: 'utf8',
          content: '# Example',
        },
      ],
      neko: {
        schemaVersion: 1,
        interface: { displayName: 'Story Outline' },
      },
    };
    const result: CreateSkillResult = {
      source: 'project',
      rootId: 'project-agent-skills',
      relativePath: 'story-outline',
      absolutePath: '/workspace/.agents/skills/story-outline',
      fingerprint: 'sha256:created',
      diagnostics: [],
    };
    const effects = {
      ...createEffects(),
      activateLifecycleSkill: vi.fn(),
      deactivateLifecycleSkill: vi.fn(),
      createSkill: vi.fn(async () => result),
    };
    const provider = createConversationSkillProvider({
      skillService: createSkillServiceMock({ skills: [] }),
      effects,
    });
    const createSkill = provider.createSkill;
    expect(createSkill).toBeTypeOf('function');
    if (!createSkill) {
      throw new Error('Expected native Skill creation to be available');
    }

    await expect(createSkill(input)).resolves.toEqual(result);

    expect(effects.createSkill).toHaveBeenCalledWith(input);
    expect(effects.activateLifecycleSkill).not.toHaveBeenCalled();
    expect(effects.deactivateLifecycleSkill).not.toHaveBeenCalled();
    expect(effects.applySkillInjection).not.toHaveBeenCalled();
    expect(effects.clearActiveSkill).not.toHaveBeenCalled();
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

    await expect(
      provider.activateSkill({ name: 'commit', reason: 'Agent selected commit workflow' }),
    ).resolves.toEqual({
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

    await expect(
      provider.activateSkill({
        name: 'comic-to-storyboard',
        reason: 'Agent selected storyboard workflow',
      }),
    ).resolves.toEqual({
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

    await expect(
      provider.activateSkill({ name: 'missing', reason: 'Agent selected missing workflow' }),
    ).resolves.toEqual({
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

    await expect(
      provider.activateSkill({ name: 'video', reason: 'Agent selected video workflow' }),
    ).resolves.toEqual({
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
    portableDefinition: overrides.portableDefinition,
    nekoOverlay: overrides.nekoOverlay,
    hostProjection: overrides.hostProjection,
    catalog: overrides.catalog,
  };
}

function createSkillServiceWithRegistry(registry: SkillRegistry): SkillService {
  return {
    registry,
    apply: vi.fn(),
  } as unknown as SkillService;
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
