import { describe, expect, it, vi } from 'vitest';
import type { CreateSkillInput, CreateSkillResult, ISkillRegistry, Skill } from '@neko/shared';
import type { LazySkill } from '../lazy-loader';
import { SkillRegistry } from '../skill-registry';
import { SkillRegistryPopulator } from '../skill-registry-populator';
import {
  buildRuntimeSkillAwareSystemPrompt,
  createRuntimeSkillLazySync,
  createRuntimeSkillBootstrap,
  populateLazyRuntimeSkillRegistry,
  type RuntimeSkillProviderState,
} from '../skill-runtime-bootstrap';

function makeSkill(name: string, enabled: boolean = true): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} content`,
    source: 'project',
    enabled,
  };
}

function makeLazySkill(name: string): LazySkill {
  return {
    name,
    description: `${name} lazy description`,
    source: 'project',
    directoryPath: `/tmp/${name}`,
    portableDefinition: {
      name,
      description: `${name} lazy description`,
      body: `${name} content`,
    },
    isLoaded: false,
    loadContent: async () => makeSkill(name),
  };
}

function createReadOnlyRegistry(): ISkillRegistry {
  return {
    registerSkill: () => undefined,
    unregisterSkill: () => undefined,
    getSkill: () => undefined,
    listSkills: () => [],
    listAllSkills: () => [],
    getSkillByCommand: () => undefined,
    searchSkills: () => [],
    ensureLoaded: async () => undefined,
    skillCount: 0,
    clear: () => undefined,
  };
}

describe('skill runtime bootstrap', () => {
  it('builds a skill-aware prompt from the runtime SkillService registry', () => {
    const registry = new SkillRegistry();
    registry.registerSkill(makeSkill('storyboard'));
    registry.registerSkill(makeSkill('disabled', false));

    const result = buildRuntimeSkillAwareSystemPrompt({
      basePrompt: 'Base prompt',
      skillService: { registry },
    });

    expect(result.enabledSkillCount).toBe(1);
    expect(result.prompt).toContain('Base prompt');
    expect(result.prompt).toContain('- **storyboard**: storyboard description');
    expect(result.prompt).not.toContain('disabled');
  });

  it('passes the runtime locale into the skill-aware prompt builder', () => {
    const registry = new SkillRegistry();
    registry.registerSkill(makeSkill('storyboard'));
    const bootstrap = createRuntimeSkillBootstrap({ registry, locale: 'zh-TW' });

    const result = bootstrap.buildSystemPrompt('Base prompt');

    expect(result.prompt).toContain('# 可用技能');
    expect(result.prompt).toContain(
      '- **storyboard**: 领域能力说明以技能正文为准；仅在 Agent 判断需要后激活。',
    );
    expect(result.prompt).not.toContain('storyboard description');
  });

  it('populates lazy skills through the runtime registry mutation boundary', () => {
    const registry = new SkillRegistry();
    const summary = populateLazyRuntimeSkillRegistry({
      skillService: { registry },
      populator: new SkillRegistryPopulator(),
      builtinSkills: [makeSkill('localized-builtin', true)],
      scanResult: {
        personal: { skills: [makeLazySkill('personal-skill')], commands: [] },
        project: { skills: [makeLazySkill('project-skill')], commands: [] },
      },
    });

    expect(summary.builtin).toBe(1);
    expect(summary.personal).toBe(1);
    expect(summary.project).toBe(1);
    expect(registry.getSkill('localized-builtin')?.content).toBe('localized-builtin content');
    expect(registry.isLazy('personal-skill')).toBe(true);
    expect(registry.isLazy('project-skill')).toBe(true);
  });

  it('rejects registries that cannot support lazy population', () => {
    expect(() =>
      populateLazyRuntimeSkillRegistry({
        skillService: { registry: createReadOnlyRegistry() },
        populator: new SkillRegistryPopulator(),
        scanResult: {
          personal: { skills: [], commands: [] },
          project: { skills: [], commands: [] },
        },
      }),
    ).toThrow('Runtime SkillService registry does not support lazy skill population');
  });

  it('owns SkillService creation, prompt building, and lazy population as one runtime bootstrap', () => {
    const registry = new SkillRegistry();
    registry.registerSkill(makeSkill('storyboard'));
    const bootstrap = createRuntimeSkillBootstrap({ registry });

    const prompt = bootstrap.buildSystemPrompt('Base prompt');
    const summary = bootstrap.populateLazy({
      personal: { skills: [makeLazySkill('personal-skill')], commands: [] },
      project: { skills: [], commands: [] },
    });

    expect(bootstrap.skillService.registry).toBe(registry);
    expect(prompt.enabledSkillCount).toBe(1);
    expect(prompt.prompt).toContain('- **storyboard**: storyboard description');
    expect(summary.personal).toBe(1);
    expect(registry.isLazy('personal-skill')).toBe(true);
  });

  it('uses caller-provided builtin skills during lazy population', () => {
    const registry = new SkillRegistry();
    const localizedBuiltin = makeSkill('storyboard');
    const bootstrap = createRuntimeSkillBootstrap({
      registry,
      builtinSkills: [
        {
          ...localizedBuiltin,
          content: '中文 Markdown Skill body',
          source: 'builtin',
        },
      ],
    });

    const summary = bootstrap.populateLazy({
      personal: { skills: [], commands: [] },
      project: { skills: [], commands: [] },
    });

    expect(summary.builtin).toBe(1);
    expect(registry.getSkill('storyboard')?.content).toBe('中文 Markdown Skill body');
    expect(registry.getSkill('storyboard')?.source).toBe('builtin');
  });

  it('creates conversation-scoped skill providers without host orchestration', async () => {
    const registry = new SkillRegistry();
    const skill = makeSkill('storyboard');
    registry.registerSkill(skill);
    const bootstrap = createRuntimeSkillBootstrap({ registry });
    const applied: string[] = [];
    const cleared: string[] = [];
    const state: RuntimeSkillProviderState = {
      getActiveSkill: (conversationId) =>
        conversationId === 'conversation-1' ? { skill } : undefined,
      applySkillInjection: (conversationId, _injection, activeSkill) => {
        applied.push(`${conversationId}:${activeSkill.name}`);
      },
      clearActiveSkill: (conversationId) => {
        cleared.push(conversationId);
      },
    };

    const provider = bootstrap.createSkillProviderFactory(state)('conversation-1');
    const activeSkill = await provider.getActiveSkill();
    const activation = await provider.activateSkill({
      name: 'storyboard',
      reason: 'Agent selected storyboard workflow',
    });
    const deactivation = await provider.deactivateSkill();

    expect(activeSkill).toEqual({ name: 'storyboard', description: 'storyboard description' });
    expect(activation.success).toBe(true);
    expect(applied).toEqual(['conversation-1:storyboard']);
    expect(deactivation.success).toBe(true);
    expect(cleared).toEqual(['conversation-1']);
  });

  it('binds native creation to the current conversation without activating the created skill', async () => {
    const registry = new SkillRegistry();
    const bootstrap = createRuntimeSkillBootstrap({ registry });
    const input: CreateSkillInput = {
      target: 'personal',
      skill: {
        name: 'portable-notes',
        description: 'Reusable note-taking guidance.',
        body: '# Portable notes',
      },
    };
    const result: CreateSkillResult = {
      source: 'personal',
      rootId: 'personal-agent-skills',
      relativePath: 'portable-notes',
      absolutePath: '/home/user/.agents/skills/portable-notes',
      fingerprint: 'sha256:portable-notes',
      diagnostics: [],
    };
    const state: RuntimeSkillProviderState = {
      getActiveSkill: vi.fn(() => undefined),
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
      activateLifecycleSkill: vi.fn(),
      deactivateLifecycleSkill: vi.fn(),
      syncSkillLifecycleProjection: vi.fn(),
      createSkill: vi.fn(async () => result),
    };
    const provider = bootstrap.createSkillProviderFactory(state)('conversation-creation');
    const createSkill = provider.createSkill;
    expect(createSkill).toBeTypeOf('function');
    if (!createSkill) {
      throw new Error('Expected native Skill creation to be available');
    }

    await expect(createSkill(input)).resolves.toEqual(result);

    expect(state.createSkill).toHaveBeenCalledWith('conversation-creation', input);
    expect(state.activateLifecycleSkill).not.toHaveBeenCalled();
    expect(state.deactivateLifecycleSkill).not.toHaveBeenCalled();
    expect(state.syncSkillLifecycleProjection).not.toHaveBeenCalled();
    expect(state.applySkillInjection).not.toHaveBeenCalled();
    expect(state.clearActiveSkill).not.toHaveBeenCalled();
  });

  it('syncs lifecycle projection after provider-driven lifecycle activation changes state', async () => {
    const registry = new SkillRegistry();
    const skill = makeSkill('storyboard');
    registry.registerSkill(skill);
    const bootstrap = createRuntimeSkillBootstrap({ registry });
    const synced: string[] = [];
    const state: RuntimeSkillProviderState = {
      getActiveSkill: () => undefined,
      getActiveSkillLifecycle: (conversationId) => ({
        conversationId,
        records: [],
        diagnostics: [],
      }),
      syncSkillLifecycleProjection: (conversationId) => {
        synced.push(conversationId);
        return {
          promptSections: [],
          toolPolicy: {
            mode: 'unrestricted',
            contributingRecordIds: [],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [],
        };
      },
      activateLifecycleSkill: async () => ({
        success: true,
        skillName: 'storyboard',
        lifecycleRecordId: 'record-storyboard',
      }),
      deactivateLifecycleSkill: async () => ({
        success: true,
        removedRecordIds: ['record-storyboard'],
      }),
      applySkillInjection: vi.fn(),
      clearActiveSkill: vi.fn(),
    };

    const provider = bootstrap.createSkillProviderFactory(state)('conversation-1');
    const activation = await provider.activateSkill({
      name: 'storyboard',
      reason: 'Agent selected storyboard workflow',
    });
    const deactivation = await provider.deactivateSkill({ recordId: 'record-storyboard' });

    expect(activation.success).toBe(true);
    expect(deactivation.success).toBe(true);
    expect(synced).toEqual(['conversation-1', 'conversation-1']);
  });

  it('owns lazy skill sync error handling around host scan effects', async () => {
    const registry = new SkillRegistry();
    const bootstrap = createRuntimeSkillBootstrap({ registry });
    const logger = { warn: vi.fn() };
    const sync = createRuntimeSkillLazySync({
      scanLazy: async () => ({
        personal: { skills: [makeLazySkill('personal-skill')], commands: [] },
        project: { skills: [], commands: [] },
      }),
      populateLazy: (scanResult) => bootstrap.populateLazy(scanResult),
      logger,
    });

    const result = await sync.syncInitial();

    expect(result?.personal).toBe(1);
    expect(registry.isLazy('personal-skill')).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns null and logs when lazy skill sync fails', async () => {
    const logger = { warn: vi.fn() };
    const sync = createRuntimeSkillLazySync({
      scanLazy: async () => {
        throw new Error('denied');
      },
      populateLazy: () => {
        throw new Error('should not populate');
      },
      logger,
      refreshFailureMessage: 'refresh failed',
    });

    await expect(sync.resync()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('refresh failed', expect.any(Error));
  });
});
