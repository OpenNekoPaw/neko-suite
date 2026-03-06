/**
 * SkillHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillHandler } from '../skillHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockSkillService() {
  return {
    registry: {
      listSkills: vi.fn().mockReturnValue([
        { name: 'commit', description: 'Create a commit', slashCommand: '/commit' },
        { name: 'review', description: 'Review code', slashCommand: '/review' },
      ]),
      getCommand: vi.fn().mockReturnValue(null),
      getSkill: vi.fn().mockReturnValue(null),
    },
    applyCommand: vi.fn().mockReturnValue({
      name: 'commit',
      systemPrompt: 'You are a commit assistant',
      allowedTools: ['bash'],
    }),
    apply: vi.fn().mockReturnValue({
      name: 'review',
      systemPrompt: 'You are a code reviewer',
      allowedTools: ['read', 'grep'],
    }),
    discover: vi.fn().mockReturnValue(null),
    discoverAndApply: vi.fn().mockResolvedValue(null),
    clearActiveSkill: vi.fn(),
  };
}

// Mock toSkillSummary and createToolGuard
vi.mock('@neko/agent', () => ({
  toSkillSummary: vi.fn((skill: any) => ({
    name: skill.name,
    description: skill.description,
    slashCommand: skill.slashCommand,
  })),
  createToolGuard: vi.fn().mockReturnValue({
    check: vi.fn().mockReturnValue({ allowed: true }),
  }),
}));

describe('SkillHandler', () => {
  let handler: SkillHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let skillService: ReturnType<typeof createMockSkillService>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    skillService = createMockSkillService();
  });

  describe('sendSkillsList', () => {
    it('should send empty skills when no skillService', () => {
      handler = new SkillHandler();
      handler.sendSkillsList(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({ type: 'skillsList', skills: [] });
    });

    it('should send skills converted to summaries', () => {
      handler = new SkillHandler({ skillService: skillService as any });
      handler.sendSkillsList(webview as any);

      expect(skillService.registry.listSkills).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'skillsList',
        skills: expect.arrayContaining([
          expect.objectContaining({ name: 'commit' }),
          expect.objectContaining({ name: 'review' }),
        ]),
      });
    });

    it('should send empty skills on error', () => {
      skillService.registry.listSkills.mockImplementation(() => {
        throw new Error('Registry error');
      });
      handler = new SkillHandler({ skillService: skillService as any });
      handler.sendSkillsList(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({ type: 'skillsList', skills: [] });
    });
  });

  describe('handleSlashCommand', () => {
    it('should return error when no skillService', () => {
      handler = new SkillHandler();
      const result = handler.handleSlashCommand(webview as any, 'commit');

      expect(result).toEqual({ applied: false, error: 'SkillService not initialized' });
    });

    it('should return error for unknown command', () => {
      skillService.registry.getCommand.mockReturnValue(null);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = handler.handleSlashCommand(webview as any, 'unknown');

      expect(result).toEqual({ applied: false, error: 'Unknown command: /unknown' });
    });

    it('should apply slash command and send injection', () => {
      const mockCommand = { name: 'commit', body: 'Create commit' };
      skillService.registry.getCommand.mockReturnValue(mockCommand);

      handler = new SkillHandler({ skillService: skillService as any });
      const result = handler.handleSlashCommand(webview as any, 'commit', 'fix bug');

      expect(skillService.applyCommand).toHaveBeenCalledWith(mockCommand, 'fix bug');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skillInjection',
          skillName: 'commit',
          systemPrompt: 'You are a commit assistant',
        }),
      );
      expect(result).toEqual({ applied: true, injection: expect.any(Object) });
    });
  });

  describe('discoverSkills', () => {
    it('should return null when no skillService', () => {
      handler = new SkillHandler();
      expect(handler.discoverSkills('write a commit')).toBeNull();
    });

    it('should delegate to skillService.discover', () => {
      const mockResult = { matches: [{ skill: { name: 'commit' }, relevance: 0.9 }] };
      skillService.discover.mockReturnValue(mockResult);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = handler.discoverSkills('write a commit message');

      expect(skillService.discover).toHaveBeenCalledWith('write a commit message');
      expect(result).toEqual(mockResult);
    });
  });

  describe('isToolAllowed', () => {
    it('should return true when no active skill', () => {
      handler = new SkillHandler();
      expect(handler.isToolAllowed('bash')).toBe(true);
    });

    it('should return true when active skill has no toolGuard', () => {
      handler = new SkillHandler({ skillService: skillService as any });
      // Set active skill without toolGuard via handleExecuteSkill
      const skill = { name: 'free-skill', description: 'No restrictions' };
      skillService.registry.getSkill.mockReturnValue(skill);

      handler.handleExecuteSkill(webview as any, 'free-skill', {});
      // The mock createToolGuard returns { check: () => ({ allowed: true }) }
      expect(handler.isToolAllowed('bash')).toBe(true);
    });
  });

  describe('handleExecuteSkill', () => {
    it('should return error when no skillService', () => {
      handler = new SkillHandler();
      const result = handler.handleExecuteSkill(webview as any, 'commit', {});

      expect(result).toEqual({ applied: false, error: 'SkillService not initialized' });
    });

    it('should return error for unknown skill', () => {
      skillService.registry.getSkill.mockReturnValue(null);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = handler.handleExecuteSkill(webview as any, 'unknown', {});

      expect(result).toEqual({ applied: false, error: 'Unknown skill: unknown' });
    });

    it('should apply skill, set active state, and send injection', () => {
      const mockSkill = { name: 'review', description: 'Review code', toolDefinitions: [] };
      skillService.registry.getSkill.mockReturnValue(mockSkill);

      handler = new SkillHandler({ skillService: skillService as any });
      const result = handler.handleExecuteSkill(webview as any, 'review', { pr: '123' });

      expect(skillService.apply).toHaveBeenCalledWith(mockSkill);
      expect(result).toEqual(expect.objectContaining({ applied: true }));
      expect(handler.getActiveSkill()).toBeDefined();
      expect(handler.getActiveSkill()!.skill.name).toBe('review');
    });
  });

  describe('handleCancelSkill', () => {
    it('should clear active skill when matching', () => {
      const mockSkill = { name: 'review', description: 'Review code' };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      handler = new SkillHandler({ skillService: skillService as any });
      handler.handleExecuteSkill(webview as any, 'review', {});

      expect(handler.getActiveSkill()).toBeDefined();

      handler.handleCancelSkill('review');
      expect(handler.getActiveSkill()).toBeUndefined();
    });

    it('should not clear active skill for different name', () => {
      const mockSkill = { name: 'review', description: 'Review code' };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      handler = new SkillHandler({ skillService: skillService as any });
      handler.handleExecuteSkill(webview as any, 'review', {});

      handler.handleCancelSkill('commit');
      expect(handler.getActiveSkill()).toBeDefined();
    });
  });

  describe('clearActiveSkill', () => {
    it('should clear active skill and notify service', () => {
      const mockSkill = { name: 'review', description: 'Review code' };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      handler = new SkillHandler({ skillService: skillService as any });
      handler.handleExecuteSkill(webview as any, 'review', {});

      handler.clearActiveSkill();

      expect(handler.getActiveSkill()).toBeUndefined();
      expect(skillService.clearActiveSkill).toHaveBeenCalled();
    });
  });

  describe('setDependencies', () => {
    it('should update skill service after construction', () => {
      handler = new SkillHandler();
      handler.sendSkillsList(webview as any);
      expect(webview.postMessage).toHaveBeenCalledWith({ type: 'skillsList', skills: [] });

      handler.setDependencies({ skillService: skillService as any });
      handler.sendSkillsList(webview as any);
      // Should now have skills
      const lastCall = webview.postMessage.mock.calls.at(-1)![0];
      expect(lastCall.skills).toHaveLength(2);
    });
  });
});
