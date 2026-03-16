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
  SlashCommand,
  SkillMatch,
  ISkillRegistry,
  ISkillMatcher,
  ISkillInjector,
  IToolInjectionManager,
  ToolInjectionState,
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

function makeCommand(overrides?: Partial<SlashCommand>): SlashCommand {
  return {
    command: '/test',
    description: 'A test command',
    content: 'Review PR $1 with priority $2',
    allowedTools: ['Bash'],
    enabled: true,
    source: 'test',
    ...overrides,
  } as SlashCommand;
}

function makeMockRegistry(): ISkillRegistry {
  const skills: Skill[] = [];
  const commands: SlashCommand[] = [];
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
    registerCommand: vi.fn((c: SlashCommand) => {
      commands.push(c);
    }),
    unregisterCommand: vi.fn(),
    getCommand: vi.fn((name: string) => commands.find((c) => c.command === name)),
    listCommands: vi.fn(() => commands.filter((c) => c.enabled)),
    hasCommand: vi.fn((name: string) => commands.some((c) => c.command === name)),
    searchSkills: vi.fn(() => []),
    get skillCount() {
      return skills.length;
    },
    get commandCount() {
      return commands.length;
    },
    clear: vi.fn(() => {
      skills.length = 0;
      commands.length = 0;
    }),
  } as unknown as ISkillRegistry;
}

function makeMockMatcher(results: SkillMatch[] = []): ISkillMatcher {
  return {
    match: vi.fn(() => results),
  };
}

function makeMockInjectionManager(): IToolInjectionManager {
  const activeToolSets: string[] = [];
  return {
    getState: vi.fn(
      () =>
        ({
          activeToolSets: [...activeToolSets],
          injectedTools: new Map(),
          tokenUsage: new Map(),
        }) as ToolInjectionState,
    ),
    activateToolSet: vi.fn((name: string) => {
      activeToolSets.push(name);
    }),
    deactivateToolSet: vi.fn((name: string) => {
      const idx = activeToolSets.indexOf(name);
      if (idx >= 0) activeToolSets.splice(idx, 1);
    }),
    getToolsForTurn: vi.fn(() => []),
    configure: vi.fn(),
    reset: vi.fn(),
    getActiveToolSets: vi.fn(() => [...activeToolSets]),
    isToolInjected: vi.fn(() => false),
    getToolLayer: vi.fn(),
    getTokenUsage: vi.fn(() => []),
  } as unknown as IToolInjectionManager;
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

  it('injectSkill returns injection with skill content', () => {
    const skill = makeSkill({ content: '# My Skill\nDo the thing' });
    const injection = injector.injectSkill(skill);

    expect(injection.systemPrompt).toBe('# My Skill\nDo the thing');
  });

  it('injectSkill adds support files hint when directoryPath and supportFileRefs exist', () => {
    const skill = makeSkill({
      directoryPath: '/path/to/skill',
      supportFileRefs: ['ref.md'],
      content: '# Skill with refs',
    });
    const injection = injector.injectSkill(skill);

    expect(injection.systemPrompt).toContain('Support files available in');
    expect(injection.systemPrompt).toContain('/path/to/skill');
  });

  it('injectSkill does not add hint when no supportFileRefs', () => {
    const skill = makeSkill({
      directoryPath: '/path/to/skill',
      supportFileRefs: undefined,
      content: '# No refs',
    });
    const injection = injector.injectSkill(skill);

    expect(injection.systemPrompt).toBe('# No refs');
    expect(injection.systemPrompt).not.toContain('Support files');
  });

  it('injectSkill returns correct allowedTools and name', () => {
    const skill = makeSkill({
      name: 'my-skill',
      allowedTools: ['Read', 'Grep'],
    });
    const injection = injector.injectSkill(skill);

    expect(injection.allowedTools).toEqual(['Read', 'Grep']);
    expect(injection.name).toBe('my-skill');
    expect(injection.type).toBe('skill');
  });

  it('injectSkill passes model from skill', () => {
    const skill = makeSkill({ model: 'claude-3' });
    const injection = injector.injectSkill(skill);

    expect(injection.model).toBe('claude-3');
  });

  // --- injectCommand ---

  it('injectCommand interpolates $ARGUMENTS', () => {
    const command = makeCommand({ content: 'Run with $ARGUMENTS' });
    const injection = injector.injectCommand(command, 'foo bar');

    expect(injection.systemPrompt).toBe('Run with foo bar');
  });

  it('injectCommand interpolates positional $1 $2', () => {
    const command = makeCommand({ content: 'Review PR $1 with priority $2' });
    const injection = injector.injectCommand(command, '123 high');

    expect(injection.systemPrompt).toBe('Review PR 123 with priority high');
  });

  it('injectCommand handles quoted arguments', () => {
    const command = makeCommand({ content: 'A=$1 B=$2 C=$3' });
    const injection = injector.injectCommand(command, 'foo "bar baz" qux');

    expect(injection.systemPrompt).toBe('A=foo B=bar baz C=qux');
  });

  it('injectCommand cleans placeholders when no args', () => {
    const command = makeCommand({ content: 'Review PR $1 with priority $2' });
    const injection = injector.injectCommand(command);

    expect(injection.systemPrompt).toBe('Review PR  with priority ');
  });

  it('injectCommand returns type slash-command', () => {
    const command = makeCommand();
    const injection = injector.injectCommand(command, '123 high');

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

  // --- match ---

  it('match delegates to matcher and registry', () => {
    const skill = makeSkill({ name: 'commit-helper', description: 'Help with git commits' });
    const matchResults: SkillMatch[] = [{ skill, relevance: 0.8, reason: 'keyword match' }];
    const registry = makeMockRegistry();
    const matcher = makeMockMatcher(matchResults);

    registry.registerSkill(skill);

    const service = new SkillService({ registry, matcher });
    const results = service.match('commit my changes');

    expect(matcher.match).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]?.skill.name).toBe('commit-helper');
  });

  // --- apply ---

  it('apply creates injection and sets active skill', () => {
    const service = createSkillService();
    const skill = makeSkill({ name: 'active-skill' });

    service.apply(skill);

    expect(service.getActiveSkill()).toBeDefined();
    expect(service.getActiveSkill()?.name).toBe('active-skill');
  });

  it('apply creates tool guard', () => {
    const service = createSkillService();
    const skill = makeSkill({ allowedTools: ['Read', 'Write'] });

    service.apply(skill);

    expect(service.getToolGuard()).toBeDefined();
    expect(service.getToolGuard()?.hasRestrictions()).toBe(true);
  });

  // --- clearActiveSkill ---

  it('clearActiveSkill clears active state', () => {
    const service = createSkillService();
    const skill = makeSkill();

    service.apply(skill);
    expect(service.getActiveSkill()).toBeDefined();

    service.clearActiveSkill();
    expect(service.getActiveSkill()).toBeUndefined();
  });

  // --- isToolAllowed ---

  it('isToolAllowed returns true when no active guard', () => {
    const service = createSkillService();

    expect(service.isToolAllowed('AnyTool')).toBe(true);
  });

  it('isToolAllowed checks guard when skill active', () => {
    const service = createSkillService();
    const skill = makeSkill({ allowedTools: ['Read'] });

    service.apply(skill);

    expect(service.isToolAllowed('Read')).toBe(true);
    expect(service.isToolAllowed('Write')).toBe(false);
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

  // --- Track D: ToolSet integration ---

  it('apply activates toolSets via injectionManager', () => {
    const injectionManager = makeMockInjectionManager();
    const service = new SkillService({ injectionManager });
    const skill = makeSkill({ toolSets: ['web-tools', 'file-tools'] });

    service.apply(skill);

    expect(injectionManager.activateToolSet).toHaveBeenCalledWith('web-tools');
    expect(injectionManager.activateToolSet).toHaveBeenCalledWith('file-tools');
  });

  it('clearActiveSkill deactivates toolSets', () => {
    const injectionManager = makeMockInjectionManager();
    const service = new SkillService({ injectionManager });
    const skill = makeSkill({ toolSets: ['web-tools'] });

    service.apply(skill);
    service.clearActiveSkill();

    expect(injectionManager.deactivateToolSet).toHaveBeenCalledWith('web-tools');
  });
});
