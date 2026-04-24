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
      getSkillByCommand: vi.fn().mockReturnValue(null),
    },
    applyCommand: vi.fn().mockReturnValue({
      applied: true,
      injection: {
        name: 'commit',
        systemPrompt: 'You are a commit assistant',
        allowedTools: ['bash'],
        type: 'slash-command' as const,
      },
    }),
    apply: vi.fn().mockReturnValue({
      name: 'review',
      systemPrompt: 'You are a code reviewer',
      allowedTools: ['read', 'grep'],
    }),
    discover: vi.fn().mockReturnValue(null),
    discoverAndApply: vi.fn().mockResolvedValue(null),
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
    it('should return error when no skillService', async () => {
      handler = new SkillHandler();
      const result = await handler.handleSlashCommand(webview as any, 'commit');

      expect(result).toEqual({ applied: false, error: 'SkillService not initialized' });
    });

    it('should return error for unknown command', async () => {
      skillService.registry.getSkillByCommand.mockReturnValue(null);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = await handler.handleSlashCommand(webview as any, 'unknown');

      expect(result).toEqual({ applied: false, error: 'Unknown command: /unknown' });
    });

    it('should apply slash command and send injection', async () => {
      const mockSkill = {
        name: 'commit',
        description: 'Create a commit',
        command: 'commit',
        phases: [{ name: 'draft' }],
      };
      skillService.registry.getSkillByCommand.mockReturnValue(mockSkill);
      skillService.apply.mockReturnValue({
        name: 'commit',
        systemPrompt: 'You are a commit assistant',
        allowedTools: ['bash'],
      });

      handler = new SkillHandler({ skillService: skillService as any });
      const result = await handler.handleSlashCommand(webview as any, 'commit', 'fix bug');

      expect(skillService.apply).toHaveBeenCalledWith(mockSkill, 'fix bug');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skillInjection',
          skillName: 'commit',
          systemPrompt: 'You are a commit assistant',
        }),
      );
      expect(result).toEqual(expect.objectContaining({ applied: true, skill: mockSkill }));
      expect(handler.getActiveSkill()?.skill).toBe(mockSkill);
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
    it('should return true when no conversationId', () => {
      handler = new SkillHandler();
      expect(handler.isToolAllowed('bash')).toBe(true);
    });

    it('should delegate to agentManager when conversationId provided', () => {
      const mockAgent = { isToolAllowed: vi.fn().mockReturnValue(true) };
      const mockAgentManager = { get: vi.fn().mockReturnValue(mockAgent) } as any;
      handler = new SkillHandler({
        skillService: skillService as any,
        agentManager: mockAgentManager,
      });

      expect(handler.isToolAllowed('bash', 'conv-1')).toBe(true);
      expect(mockAgentManager.get).toHaveBeenCalledWith('conv-1');
      expect(mockAgent.isToolAllowed).toHaveBeenCalledWith('bash');
    });
  });

  describe('handleExecuteSkill', () => {
    it('should return error when no skillService', async () => {
      handler = new SkillHandler();
      const result = await handler.handleExecuteSkill(webview as any, 'commit', {});

      expect(result).toEqual({ applied: false, error: 'SkillService not initialized' });
    });

    it('should return error for unknown skill', async () => {
      skillService.registry.getSkill.mockReturnValue(null);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = await handler.handleExecuteSkill(webview as any, 'unknown', {});

      expect(result).toEqual({ applied: false, error: 'Unknown skill: unknown' });
    });

    it('should apply skill, set active state, and send injection', async () => {
      const mockSkill = { name: 'review', description: 'Review code', toolDefinitions: [] };
      skillService.registry.getSkill.mockReturnValue(mockSkill);

      handler = new SkillHandler({ skillService: skillService as any });
      const result = await handler.handleExecuteSkill(webview as any, 'review', { pr: '123' });

      expect(skillService.apply).toHaveBeenCalledWith(mockSkill);
      expect(result).toEqual(expect.objectContaining({ applied: true }));
      expect(handler.getActiveSkill()).toBeDefined();
      expect(handler.getActiveSkill()!.skill.name).toBe('review');
    });
  });

  describe('handleCancelSkill', () => {
    it('should clear active skill when matching', async () => {
      const mockSkill = { name: 'review', description: 'Review code' };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      handler = new SkillHandler({ skillService: skillService as any });
      await handler.handleExecuteSkill(webview as any, 'review', {});

      expect(handler.getActiveSkill()).toBeDefined();

      handler.handleCancelSkill('review');
      expect(handler.getActiveSkill()).toBeUndefined();
    });

    it('should not clear active skill for different name', async () => {
      const mockSkill = { name: 'review', description: 'Review code' };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      handler = new SkillHandler({ skillService: skillService as any });
      await handler.handleExecuteSkill(webview as any, 'review', {});

      handler.handleCancelSkill('commit');
      expect(handler.getActiveSkill()).toBeDefined();
    });
  });

  describe('clearActiveSkill', () => {
    it('should clear active skill and delegate to agentManager', async () => {
      const mockSkill = { name: 'review', description: 'Review code' };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      const mockAgentManager = { clearActiveSkill: vi.fn(), applySkillInjection: vi.fn() } as any;
      handler = new SkillHandler({
        skillService: skillService as any,
        agentManager: mockAgentManager,
        getActiveConversationId: () => 'conv-1',
      });
      await handler.handleExecuteSkill(webview as any, 'review', {});

      handler.clearActiveSkill();

      expect(handler.getActiveSkill()).toBeUndefined();
      expect(mockAgentManager.clearActiveSkill).toHaveBeenCalledWith('conv-1');
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
