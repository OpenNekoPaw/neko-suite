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
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
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

// Mock only the shared utility surface used by the presenter.
vi.mock('@neko/agent', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent')>('@neko/agent');
  return {
    ...actual,
    toSkillSummary: vi.fn((skill: any) => ({
      name: skill.name,
      description: skill.description,
      slashCommand: skill.slashCommand,
    })),
    createToolGuard: vi.fn().mockReturnValue({
      check: vi.fn().mockReturnValue({ allowed: true }),
    }),
  };
});

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
      const result = await handler.handleSlashCommand(webview as any, 'commit', 'conv-1');

      expect(result).toEqual({ applied: false, error: 'SkillService not initialized' });
    });

    it('should return error for unknown command', async () => {
      skillService.registry.getSkillByCommand.mockReturnValue(null);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = await handler.handleSlashCommand(webview as any, 'unknown', 'conv-1');

      expect(result).toEqual({ applied: false, error: 'Unknown command: /unknown' });
    });

    it('should apply command artifact slash command and send injection', async () => {
      const mockSkill = {
        name: 'commit',
        description: 'Create a commit',
        entryPointKind: 'command-artifact',
        command: 'commit',
      };
      skillService.registry.getSkillByCommand.mockReturnValue(mockSkill);
      skillService.apply.mockReturnValue({
        name: 'commit',
        systemPrompt: 'You are a commit assistant',
        allowedTools: ['bash'],
      });

      handler = new SkillHandler({ skillService: skillService as any });
      const result = await handler.handleSlashCommand(
        webview as any,
        'commit',
        'conv-1',
        'fix bug',
      );

      expect(skillService.apply).toHaveBeenCalledWith(mockSkill, 'fix bug');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skillInjection',
          conversationId: 'conv-1',
          skillName: 'commit',
          systemPrompt: 'You are a commit assistant',
        }),
      );
      expect(result).toEqual(expect.objectContaining({ applied: true, skill: mockSkill }));
      expect(handler.getActiveSkill('conv-1')?.skill).toBe(mockSkill);
    });

    it('should isolate active command artifact skills by conversation', async () => {
      const commitSkill = {
        name: 'commit',
        description: 'Create a commit',
        entryPointKind: 'command-artifact',
        command: 'commit',
      };
      const reviewSkill = {
        name: 'review',
        description: 'Review code',
        entryPointKind: 'command-artifact',
        command: 'review',
      };
      skillService.registry.getSkillByCommand.mockImplementation((command: string) =>
        command === 'commit' ? commitSkill : reviewSkill,
      );
      skillService.apply.mockImplementation((skill: { name: string }) => ({
        name: skill.name,
        systemPrompt: `Prompt for ${skill.name}`,
        allowedTools: [],
      }));

      handler = new SkillHandler({
        skillService: skillService as any,
      });

      await handler.handleSlashCommand(webview as any, 'commit', 'conv-1');
      await handler.handleSlashCommand(webview as any, 'review', 'conv-2');

      expect(handler.getActiveSkill('conv-1')?.skill).toBe(commitSkill);
      expect(handler.getActiveSkill('conv-2')?.skill).toBe(reviewSkill);
      expect(webview.postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'skillInjection',
          conversationId: 'conv-2',
          skillName: 'review',
        }),
      );
    });
  });

  describe('handleSkillInvocation', () => {
    it('should apply skill by canonical name and send injection', async () => {
      const mockSkill = {
        name: 'quality-review',
        description: 'Review changed files',
        content: 'Review instructions',
        enabled: true,
      };
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      skillService.registry.ensureLoaded.mockResolvedValue(mockSkill);
      skillService.apply.mockResolvedValue({
        name: 'quality-review',
        systemPrompt: 'Review instructions',
        allowedTools: ['read'],
        type: 'skill' as const,
      });

      handler = new SkillHandler({ skillService: skillService as any });
      const result = await handler.handleSkillInvocation(
        webview as any,
        'quality-review',
        'conv-1',
        'changed files',
      );

      expect(skillService.registry.getSkill).toHaveBeenCalledWith('quality-review');
      expect(skillService.registry.getSkillByCommand).not.toHaveBeenCalled();
      expect(skillService.registry.ensureLoaded).toHaveBeenCalledWith('quality-review');
      expect(skillService.apply).toHaveBeenCalledWith(mockSkill, 'changed files');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'skillInjection',
          conversationId: 'conv-1',
          skillName: 'quality-review',
          systemPrompt: 'Review instructions',
        }),
      );
      expect(result).toEqual(expect.objectContaining({ applied: true, skill: mockSkill }));
    });

    it('should return visible unknown skill result without sending injection', async () => {
      skillService.registry.getSkill.mockReturnValue(undefined);
      handler = new SkillHandler({ skillService: skillService as any });

      const result = await handler.handleSkillInvocation(webview as any, 'missing', 'conv-1');

      expect(result).toEqual({ applied: false, error: 'Unknown skill: $missing' });
      expect(webview.postMessage).not.toHaveBeenCalled();
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

  describe('autoActivateSkill', () => {
    it('does not activate high-confidence discovered skills from natural language', async () => {
      const mockSkill = {
        name: 'comic-to-storyboard',
        description: 'Convert manga pages into StoryboardTable storyboards',
        content: 'Storyboard instructions',
        enabled: true,
      };
      skillService.discover.mockReturnValue({
        found: true,
        matches: [{ skill: mockSkill, relevance: 0.95, reason: 'artifact match' }],
        topMatch: { skill: mockSkill, relevance: 0.95, reason: 'artifact match' },
        requiresConfirmation: false,
      });
      skillService.registry.getSkill.mockReturnValue(mockSkill);
      skillService.registry.ensureLoaded.mockResolvedValue(mockSkill);
      skillService.apply.mockResolvedValue({
        name: 'comic-to-storyboard',
        systemPrompt: 'Storyboard instructions',
        allowedTools: ['ReadDocument', 'ReadImage'],
        type: 'skill' as const,
      });
      handler = new SkillHandler({ skillService: skillService as any });

      const result = await handler.autoActivateSkill(webview as any, {
        conversationId: 'conv-1',
        userInput: '生成分镜表',
      });

      expect(result).toBeNull();
      expect(skillService.discover).not.toHaveBeenCalled();
      expect((skillService.registry as any).ensureLoaded).not.toHaveBeenCalled();
      expect(skillService.apply).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('isToolAllowed', () => {
    it('should reject missing conversationId', () => {
      handler = new SkillHandler();
      expect(handler.isToolAllowed('bash', '')).toBe(false);
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

  describe('clearActiveSkill', () => {
    it('should clear active skill and delegate to agentManager', async () => {
      const mockSkill = { name: 'review', description: 'Review code', command: 'review' };
      skillService.registry.getSkillByCommand.mockReturnValue(mockSkill);
      const mockAgentManager = { clearActiveSkill: vi.fn(), applySkillInjection: vi.fn() } as any;
      handler = new SkillHandler({
        skillService: skillService as any,
        agentManager: mockAgentManager,
      });
      await handler.handleSlashCommand(webview as any, 'review', 'conv-1');

      handler.clearActiveSkill('conv-1');

      expect(handler.getActiveSkill('conv-1')).toBeUndefined();
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
