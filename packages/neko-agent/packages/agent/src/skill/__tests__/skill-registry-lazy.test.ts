/**
 * SkillRegistry — Lazy skill registration and loading tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { SkillRegistry } from '../skill-registry';
import type { LazySkill } from '../lazy-loader';
import type { Skill } from '@neko/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLazySkill(overrides?: Partial<LazySkill>): LazySkill {
  const fullSkill: Skill = {
    name: 'test-skill',
    description: 'A test skill',
    content: '# Full skill content\n\nDetailed instructions here.',
    source: 'personal',
    enabled: true,
    directoryPath: '/home/user/.neko/skills/test-skill',
  };

  return {
    name: 'test-skill',
    description: 'A test skill',
    source: 'personal',
    directoryPath: '/home/user/.neko/skills/test-skill',
    isLoaded: false,
    loadContent: vi.fn().mockResolvedValue(fullSkill),
    ...overrides,
  };
}

describe('SkillRegistry — lazy loading', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  // -------------------------------------------------------------------------
  // registerLazySkill
  // -------------------------------------------------------------------------
  describe('registerLazySkill()', () => {
    it('registers a lightweight placeholder in the skills map', () => {
      const lazy = makeLazySkill({
        manifest: {
          version: '1.0.0',
          domain: 'media',
          referencedSkills: [{ id: 'comic-to-storyboard', relationship: 'delegator' }],
          mediaWorkflow: {
            acceptedModalities: ['comic'],
            producedArtifacts: ['StoryboardTable'],
          },
        },
      });
      registry.registerLazySkill(lazy);

      const skill = registry.getSkill('test-skill');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('test-skill');
      expect(skill?.description).toBe('A test skill');
      expect(skill?.content).toBe(''); // placeholder
      expect(skill?.referencedSkills).toEqual([
        { id: 'comic-to-storyboard', relationship: 'delegator' },
      ]);
      expect(skill?.mediaWorkflow).toEqual({
        acceptedModalities: ['comic'],
        producedArtifacts: ['StoryboardTable'],
      });
    });

    it('lazy skill is discoverable via listSkills()', () => {
      registry.registerLazySkill(makeLazySkill());

      const skills = registry.listSkills();
      expect(skills.length).toBe(1);
      expect(skills[0]?.name).toBe('test-skill');
    });

    it('lazy skill is discoverable via searchSkills()', () => {
      registry.registerLazySkill(makeLazySkill());

      const results = registry.searchSkills('test');
      expect(results.length).toBe(1);
    });

    it('isLazy returns true for unloaded lazy skill', () => {
      registry.registerLazySkill(makeLazySkill());
      expect(registry.isLazy('test-skill')).toBe(true);
    });

    it('isLazy returns false for non-existent skill', () => {
      expect(registry.isLazy('nonexistent')).toBe(false);
    });

    it('isLazy returns false for eagerly registered skill', () => {
      registry.registerSkill({
        name: 'eager-skill',
        description: 'An eager skill',
        content: 'Full content',
        source: 'builtin',
        enabled: true,
      });
      expect(registry.isLazy('eager-skill')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // ensureLoaded
  // -------------------------------------------------------------------------
  describe('ensureLoaded()', () => {
    it('loads content for lazy skill on first call', async () => {
      const lazy = makeLazySkill();
      registry.registerLazySkill(lazy);

      const skill = await registry.ensureLoaded('test-skill');

      expect(lazy.loadContent).toHaveBeenCalledTimes(1);
      expect(skill?.content).toBe('# Full skill content\n\nDetailed instructions here.');
    });

    it('returns cached result on subsequent calls', async () => {
      const lazy = makeLazySkill();
      registry.registerLazySkill(lazy);

      await registry.ensureLoaded('test-skill');
      // Mark as loaded for second call
      lazy.isLoaded = true;

      await registry.ensureLoaded('test-skill');
      // loadContent should only be called once
      expect(lazy.loadContent).toHaveBeenCalledTimes(1);
    });

    it('returns immediately for eagerly registered skill', async () => {
      const eager: Skill = {
        name: 'eager-skill',
        description: 'Eager',
        content: 'Already loaded',
        source: 'builtin',
        enabled: true,
      };
      registry.registerSkill(eager);

      const result = await registry.ensureLoaded('eager-skill');
      expect(result?.content).toBe('Already loaded');
    });

    it('returns undefined for non-existent skill', async () => {
      const result = await registry.ensureLoaded('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns placeholder on load failure', async () => {
      const lazy = makeLazySkill({
        loadContent: vi.fn().mockRejectedValue(new Error('File not found')),
      });
      registry.registerLazySkill(lazy);

      const result = await registry.ensureLoaded('test-skill');
      // Should return the placeholder (empty content), not throw
      expect(result).toBeDefined();
      expect(result?.content).toBe('');
    });

    it('drops lazy loader metadata when skill is unregistered', async () => {
      registry.registerLazySkill(makeLazySkill());
      expect(registry.isLazy('test-skill')).toBe(true);

      registry.unregisterSkill('test-skill');

      expect(registry.getSkill('test-skill')).toBeUndefined();
      expect(registry.isLazy('test-skill')).toBe(false);
      await expect(registry.ensureLoaded('test-skill')).resolves.toBeUndefined();
    });

    it('replaces lazy loader metadata when eagerly overwriting the same skill', async () => {
      registry.registerLazySkill(makeLazySkill());

      registry.registerSkill({
        name: 'test-skill',
        description: 'Eager replacement',
        content: 'Ready now',
        source: 'builtin',
        enabled: true,
      });

      expect(registry.isLazy('test-skill')).toBe(false);
      await expect(registry.ensureLoaded('test-skill')).resolves.toEqual(
        expect.objectContaining({
          content: 'Ready now',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------
  describe('clear()', () => {
    it('clears both eager and lazy skills', () => {
      registry.registerSkill({
        name: 'eager',
        description: 'Eager',
        content: 'Content',
        source: 'builtin',
        enabled: true,
      });
      registry.registerLazySkill(makeLazySkill({ name: 'lazy' }));

      expect(registry.skillCount).toBe(2);

      registry.clear();

      expect(registry.skillCount).toBe(0);
      expect(registry.isLazy('lazy')).toBe(false);
    });
  });
});
