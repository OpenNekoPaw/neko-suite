/**
 * SkillService & SkillInjector Tests
 *
 * Tests for service orchestration (discovery, application, tool guard)
 * and injector (prompt injection, argument interpolation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillService, createSkillService } from '../skill-service';
import { SkillInjector } from '../skill-injector';
import type {
  Skill,
  SkillMatch,
  ISkillRegistry,
  ISkillMatcher,
  ISkillInjector,
} from '@neko/shared';

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

function makeMockMatcher(results: SkillMatch[] = []): ISkillMatcher {
  return {
    match: vi.fn(() => results),
  };
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

  // --- discover (replaces match) ---

  it('discover delegates to matcher and registry', () => {
    const skill = makeSkill({ name: 'commit-helper', description: 'Help with git commits' });
    const matchResults: SkillMatch[] = [{ skill, relevance: 0.8, reason: 'keyword match' }];
    const registry = makeMockRegistry();
    const matcher = makeMockMatcher(matchResults);

    registry.registerSkill(skill);

    const service = new SkillService({ registry, matcher });
    const result = service.discover('commit my changes');

    expect(matcher.match).toHaveBeenCalled();
    expect(result.found).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.skill.name).toBe('commit-helper');
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
    const matcher = makeMockMatcher([]);
    const service = new SkillService({ matcher });

    const result = service.discover('something random');

    expect(result.found).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('discover returns matches above threshold', () => {
    const highSkill = makeSkill({ name: 'high-match' });
    const lowSkill = makeSkill({ name: 'low-match' });
    const matchResults: SkillMatch[] = [
      { skill: highSkill, relevance: 0.8, reason: 'good match' },
      { skill: lowSkill, relevance: 0.1, reason: 'weak match' },
    ];
    const matcher = makeMockMatcher(matchResults);
    // default minRelevanceThreshold is 0.3
    const service = new SkillService({ matcher });

    const result = service.discover('test input');

    expect(result.found).toBe(true);
    // Only the high-relevance match passes the 0.3 threshold
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.skill.name).toBe('high-match');
  });

  it('discover sets requiresConfirmation when below autoApplyThreshold', () => {
    const skill = makeSkill({ name: 'mid-match' });
    const matchResults: SkillMatch[] = [{ skill, relevance: 0.5, reason: 'partial match' }];
    const matcher = makeMockMatcher(matchResults);
    // default autoApplyThreshold is 0.9, so 0.5 < 0.9 → requires confirmation
    const service = new SkillService({ matcher });

    const result = service.discover('test input');

    expect(result.found).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
  });

  // --- discoverAndApply ---

  it('discoverAndApply returns null when no match', async () => {
    const matcher = makeMockMatcher([]);
    const service = new SkillService({ matcher });

    const result = await service.discoverAndApply('nothing here');

    expect(result).toBeNull();
  });

  it('discoverAndApply calls confirmCallback when required', async () => {
    const skill = makeSkill({ name: 'needs-confirm' });
    const matchResults: SkillMatch[] = [{ skill, relevance: 0.5, reason: 'partial' }];
    const matcher = makeMockMatcher(matchResults);
    const service = new SkillService({ matcher });

    const confirmCallback = vi.fn().mockResolvedValue(true);
    const result = await service.discoverAndApply('test', confirmCallback);

    expect(confirmCallback).toHaveBeenCalledWith(skill, matchResults[0]);
    expect(result?.applied).toBe(true);
  });

  it('discoverAndApply returns error when user declines', async () => {
    const skill = makeSkill({ name: 'declined-skill' });
    const matchResults: SkillMatch[] = [{ skill, relevance: 0.5, reason: 'partial' }];
    const matcher = makeMockMatcher(matchResults);
    const service = new SkillService({ matcher });

    const confirmCallback = vi.fn().mockResolvedValue(false);
    const result = await service.discoverAndApply('test', confirmCallback);

    expect(result?.applied).toBe(false);
    expect(result?.error).toContain('declined');
  });

  // ---------------------------------------------------------------------------
  // Ablation: setDiscoveryEnabled (P1-A Toggle 1)
  // ---------------------------------------------------------------------------

  describe('ablation: setDiscoveryEnabled', () => {
    it('discover() short-circuits to empty result when disabled', () => {
      const skill = makeSkill({ name: 'would-match' });
      const matcher = makeMockMatcher([{ skill, relevance: 0.95, reason: 'strong' }]);
      const registry = makeMockRegistry();
      registry.registerSkill(skill);
      const service = new SkillService({ registry, matcher });

      service.setDiscoveryEnabled(false);
      const result = service.discover('anything');

      expect(result.found).toBe(false);
      expect(result.matches).toEqual([]);
      expect(result.requiresConfirmation).toBe(false);
      // matcher never consulted
      expect(matcher.match).not.toHaveBeenCalled();
    });

    it('re-enabling via setDiscoveryEnabled(true) restores normal behavior', () => {
      const skill = makeSkill({ name: 'commit-helper' });
      const matcher = makeMockMatcher([{ skill, relevance: 0.95, reason: 'keyword match' }]);
      const registry = makeMockRegistry();
      registry.registerSkill(skill);
      const service = new SkillService({ registry, matcher });

      service.setDiscoveryEnabled(false);
      expect(service.discover('x').found).toBe(false);

      service.setDiscoveryEnabled(true);
      const result = service.discover('x');
      expect(result.found).toBe(true);
    });

    it('default state is enabled', () => {
      const service = new SkillService();
      expect(service.isDiscoveryEnabled()).toBe(true);
    });

    it('discoverAndApply returns null when discovery is disabled', async () => {
      const skill = makeSkill({ name: 'strong' });
      const matcher = makeMockMatcher([{ skill, relevance: 0.95, reason: 'strong' }]);
      const registry = makeMockRegistry();
      registry.registerSkill(skill);
      const service = new SkillService({ registry, matcher });

      service.setDiscoveryEnabled(false);
      const result = await service.discoverAndApply('x');

      expect(result).toBeNull();
    });
  });
});
