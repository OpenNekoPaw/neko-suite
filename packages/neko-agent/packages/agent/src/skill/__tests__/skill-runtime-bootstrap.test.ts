import { describe, expect, it, vi } from 'vitest';
import type { ISkillRegistry, Skill } from '@neko/shared';
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

  it('populates lazy skills through the runtime registry mutation boundary', () => {
    const registry = new SkillRegistry();
    const summary = populateLazyRuntimeSkillRegistry({
      skillService: { registry },
      populator: new SkillRegistryPopulator(),
      scanResult: {
        personal: { skills: [makeLazySkill('personal-skill')], commands: [] },
        project: { skills: [makeLazySkill('project-skill')], commands: [] },
      },
    });

    expect(summary.personal).toBe(1);
    expect(summary.project).toBe(1);
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
    const activation = await provider.activateSkill('storyboard');
    const deactivation = await provider.deactivateSkill();

    expect(activeSkill).toEqual({ name: 'storyboard', description: 'storyboard description' });
    expect(activation.success).toBe(true);
    expect(applied).toEqual(['conversation-1:storyboard']);
    expect(deactivation.success).toBe(true);
    expect(cleared).toEqual(['conversation-1']);
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
