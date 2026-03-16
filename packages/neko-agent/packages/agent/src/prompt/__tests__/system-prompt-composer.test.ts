/**
 * SystemPromptComposer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SystemPromptComposer } from '../system-prompt-composer';
import { DEFAULT_PROMPT_LAYER_BUDGET } from '../system-prompt-composer-types';

describe('SystemPromptComposer', () => {
  let composer: SystemPromptComposer;

  beforeEach(() => {
    composer = new SystemPromptComposer();
  });

  // -------------------------------------------------------------------------
  // setBase / compose
  // -------------------------------------------------------------------------

  describe('setBase', () => {
    it('returns base content when only base is set', () => {
      composer.setBase('You are a helpful assistant.');
      expect(composer.compose()).toBe('You are a helpful assistant.');
    });

    it('replaces previous base content', () => {
      composer.setBase('First base.');
      composer.setBase('Second base.');
      expect(composer.compose()).toBe('Second base.');
    });

    it('returns empty string when nothing is set', () => {
      expect(composer.compose()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // setSection
  // -------------------------------------------------------------------------

  describe('setSection', () => {
    it('adds a skill section after the base', () => {
      composer.setBase('Base prompt.');
      composer.setSection({ id: 'skill:helper', layer: 'skill', content: 'Skill content.' });
      expect(composer.compose()).toBe('Base prompt.\n\n---\n\nSkill content.');
    });

    it('replaces a section with the same ID', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:helper', layer: 'skill', content: 'Old skill.' });
      composer.setSection({ id: 'skill:helper', layer: 'skill', content: 'New skill.' });
      expect(composer.compose()).toBe('Base.\n\n---\n\nNew skill.');
    });

    it('orders sections by layer: base → skill → environment → ephemeral', () => {
      composer.setSection({ id: 'ephemeral:note', layer: 'ephemeral', content: 'Ephemeral.' });
      composer.setSection({ id: 'env:cwd', layer: 'environment', content: 'Env context.' });
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });

      const result = composer.compose();
      const parts = result.split('\n\n---\n\n');
      expect(parts).toEqual(['Base.', 'Skill.', 'Env context.', 'Ephemeral.']);
    });

    it('orders sections within same layer by priority descending', () => {
      composer.setBase('Base.');
      composer.setSection({
        id: 'skill:low',
        layer: 'skill',
        content: 'Low priority.',
        priority: 10,
      });
      composer.setSection({
        id: 'skill:high',
        layer: 'skill',
        content: 'High priority.',
        priority: 90,
      });

      const result = composer.compose();
      const idx_high = result.indexOf('High priority.');
      const idx_low = result.indexOf('Low priority.');
      expect(idx_high).toBeLessThan(idx_low);
    });

    it('uses default priority of 50 when not specified', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:a', layer: 'skill', content: 'A.' });
      const section = composer.getSection('skill:a');
      expect(section?.priority).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // removeSection
  // -------------------------------------------------------------------------

  describe('removeSection', () => {
    it('removes an existing section and returns true', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      expect(composer.removeSection('skill:x')).toBe(true);
      expect(composer.compose()).toBe('Base.');
    });

    it('returns false for a non-existent section', () => {
      expect(composer.removeSection('nonexistent')).toBe(false);
    });

    it('compose reverts to base only after skill removed', () => {
      composer.setBase('Base prompt.');
      composer.setSection({ id: 'skill:commit', layer: 'skill', content: 'Commit helper.' });
      expect(composer.compose()).toContain('Commit helper.');
      composer.removeSection('skill:commit');
      expect(composer.compose()).toBe('Base prompt.');
    });
  });

  // -------------------------------------------------------------------------
  // hasSection / getSection
  // -------------------------------------------------------------------------

  describe('hasSection / getSection', () => {
    it('hasSection returns true after setSection', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'X.' });
      expect(composer.hasSection('skill:x')).toBe(true);
    });

    it('hasSection returns false for missing section', () => {
      expect(composer.hasSection('nonexistent')).toBe(false);
    });

    it('hasSection returns false after removeSection', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'X.' });
      composer.removeSection('skill:x');
      expect(composer.hasSection('skill:x')).toBe(false);
    });

    it('getSection returns the section with correct fields', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'X content.', priority: 70 });
      const section = composer.getSection('skill:x');
      expect(section).toBeDefined();
      expect(section?.id).toBe('skill:x');
      expect(section?.layer).toBe('skill');
      expect(section?.content).toBe('X content.');
      expect(section?.priority).toBe(70);
      expect(section?.tokenEstimate).toBeGreaterThan(0);
      expect(section?.addedAt).toBeGreaterThan(0);
    });

    it('getSection returns undefined for missing section', () => {
      expect(composer.getSection('nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all non-base sections', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.setSection({ id: 'env:cwd', layer: 'environment', content: 'Env.' });
      composer.reset();
      expect(composer.compose()).toBe('Base.');
      expect(composer.hasSection('skill:x')).toBe(false);
      expect(composer.hasSection('env:cwd')).toBe(false);
    });

    it('preserves base section after reset', () => {
      composer.setBase('Preserved base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.reset();
      expect(composer.compose()).toBe('Preserved base.');
    });

    it('compose returns empty string after reset with no base', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.reset();
      expect(composer.compose()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // getTotalTokens
  // -------------------------------------------------------------------------

  describe('getTotalTokens', () => {
    it('returns 0 when empty', () => {
      expect(composer.getTotalTokens()).toBe(0);
    });

    it('estimates tokens from content length', () => {
      const content = 'A'.repeat(400); // 400 chars ≈ 100 tokens
      composer.setBase(content);
      expect(composer.getTotalTokens()).toBe(100);
    });

    it('sums tokens across all sections', () => {
      composer.setBase('A'.repeat(400)); // 100 tokens
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'B'.repeat(200) }); // 50 tokens
      // Total: 150 tokens + separator tokens
      expect(composer.getTotalTokens()).toBeGreaterThanOrEqual(150);
    });
  });

  // -------------------------------------------------------------------------
  // getLayerUsage
  // -------------------------------------------------------------------------

  describe('getLayerUsage', () => {
    it('returns zero used for all layers when empty', () => {
      const usage = composer.getLayerUsage();
      expect(usage.base.used).toBe(0);
      expect(usage.skill.used).toBe(0);
      expect(usage.environment.used).toBe(0);
      expect(usage.ephemeral.used).toBe(0);
    });

    it('reports correct budget for each layer', () => {
      const usage = composer.getLayerUsage();
      expect(usage.base.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.base);
      expect(usage.skill.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.skill);
      expect(usage.environment.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.environment);
      expect(usage.ephemeral.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.ephemeral);
    });

    it('reflects skill section usage', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'B'.repeat(200) }); // 50 tokens
      const usage = composer.getLayerUsage();
      expect(usage.skill.used).toBe(50);
      expect(usage.base.used).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Token budget enforcement
  // -------------------------------------------------------------------------

  describe('token budget enforcement', () => {
    it('truncates section content that exceeds layer budget', () => {
      // skill budget is 4000 tokens = 16000 chars by default
      // Create content that exceeds budget
      const hugeContent = 'X'.repeat(20000); // 5000 tokens > 4000 budget
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:big', layer: 'skill', content: hugeContent });
      const result = composer.compose();
      expect(result).toContain('[truncated]');
      // Should not contain the full content
      expect(result.length).toBeLessThan('Base.'.length + hugeContent.length + 50);
    });

    it('does not truncate content within budget', () => {
      const smallContent = 'X'.repeat(100); // 25 tokens, well within budget
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:small', layer: 'skill', content: smallContent });
      const result = composer.compose();
      expect(result).not.toContain('[truncated]');
      expect(result).toContain(smallContent);
    });
  });

  // -------------------------------------------------------------------------
  // Custom separator
  // -------------------------------------------------------------------------

  describe('custom separator', () => {
    it('uses custom separator between sections', () => {
      const customComposer = new SystemPromptComposer({ separator: '\n===\n' });
      customComposer.setBase('Base.');
      customComposer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      expect(customComposer.compose()).toBe('Base.\n===\nSkill.');
    });
  });

  // -------------------------------------------------------------------------
  // Custom budget
  // -------------------------------------------------------------------------

  describe('custom budget', () => {
    it('uses custom per-layer budget', () => {
      const customComposer = new SystemPromptComposer({ budget: { skill: 5 } });
      const usage = customComposer.getLayerUsage();
      expect(usage.skill.budget).toBe(5);
      // Base budget should still use default
      expect(usage.base.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.base);
    });
  });

  // -------------------------------------------------------------------------
  // createSystemPromptComposer factory
  // -------------------------------------------------------------------------

  describe('createSystemPromptComposer', () => {
    it('creates a new instance', async () => {
      const { createSystemPromptComposer } = await import('../system-prompt-composer');
      const c = createSystemPromptComposer();
      expect(c).toBeInstanceOf(SystemPromptComposer);
    });

    it('accepts options', async () => {
      const { createSystemPromptComposer } = await import('../system-prompt-composer');
      const c = createSystemPromptComposer({ budget: { skill: 999 } });
      expect(c.getLayerUsage().skill.budget).toBe(999);
    });
  });
});
