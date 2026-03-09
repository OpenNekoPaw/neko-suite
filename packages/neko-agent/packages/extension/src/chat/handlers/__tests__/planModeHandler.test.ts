/**
 * PlanModeHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanModeHandler } from '../planModeHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockSystemPrompt() {
  let mode: 'default' | 'plan' = 'default';
  return {
    setMode: vi.fn((m: 'default' | 'plan') => {
      mode = m;
    }),
    togglePlanMode: vi.fn(() => {
      mode = mode === 'default' ? 'plan' : 'default';
    }),
    getMode: vi.fn(() => mode),
    isPlanMode: vi.fn(() => mode === 'plan'),
    getPrompt: vi.fn().mockReturnValue('system prompt'),
  };
}

function createMockConversations() {
  const messages = [
    { role: 'user', content: 'Plan something' },
    {
      role: 'assistant',
      contentBlocks: [
        {
          type: 'plan',
          plan: {
            id: 'plan-1',
            status: 'pending',
            steps: [
              { id: 'plan-1-step-0', description: 'Step one', status: 'pending' },
              { id: 'plan-1-step-1', description: 'Step two', status: 'pending' },
            ],
          },
        },
      ],
    },
  ];

  return {
    getActiveId: vi.fn().mockReturnValue('conv-1'),
    manager: {
      get: vi.fn().mockReturnValue({ messages }),
      updateMessages: vi.fn(),
    },
  };
}

function createMockSettings() {
  return {
    customSystemPrompt: 'custom prompt',
    temperature: 0.7,
    maxTokens: 4096,
    executionMode: 'auto' as const,
  };
}

describe('PlanModeHandler', () => {
  let handler: PlanModeHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let systemPrompt: ReturnType<typeof createMockSystemPrompt>;
  let conversations: ReturnType<typeof createMockConversations>;
  let settings: ReturnType<typeof createMockSettings>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    systemPrompt = createMockSystemPrompt();
    conversations = createMockConversations();
    settings = createMockSettings();
  });

  function createHandler(overrides?: Record<string, unknown>) {
    return new PlanModeHandler({
      systemPrompt: systemPrompt as any,
      conversations: conversations as any,
      settings: settings as any,
      ...overrides,
    });
  }

  describe('handleSetPromptMode', () => {
    it('should set mode to plan', () => {
      handler = createHandler();
      handler.handleSetPromptMode(webview as any, 'plan');

      expect(systemPrompt.setMode).toHaveBeenCalledWith('plan');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'promptModeChanged', isPlanMode: true }),
      );
    });

    it('should set mode to default', () => {
      handler = createHandler();
      handler.handleSetPromptMode(webview as any, 'default');

      expect(systemPrompt.setMode).toHaveBeenCalledWith('default');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'promptModeChanged', isPlanMode: false }),
      );
    });
  });

  describe('handleTogglePlanMode', () => {
    it('should toggle from default to plan', () => {
      handler = createHandler();
      handler.handleTogglePlanMode(webview as any);

      expect(systemPrompt.togglePlanMode).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'promptModeChanged' }),
      );
    });
  });

  describe('sendPromptMode', () => {
    it('should send current mode to webview', () => {
      handler = createHandler();
      handler.sendPromptMode(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'promptModeChanged',
        mode: 'default',
        isPlanMode: false,
      });
    });
  });

  describe('handlePlanReject', () => {
    it('should update plan status and send rejection message', () => {
      handler = createHandler();
      handler.handlePlanReject(webview as any, 'plan-1', 'conv-1');

      // Should persist status
      expect(conversations.manager.updateMessages).toHaveBeenCalled();

      // Should send status update
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'planStatusUpdate',
        planId: 'plan-1',
        conversationId: 'conv-1',
        status: 'rejected',
      });

      // Should send rejection text
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'streamText',
          conversationId: 'conv-1',
          content: expect.stringContaining('Plan rejected'),
        }),
      );
    });

    it('should handle missing conversation gracefully', () => {
      conversations.manager.get.mockReturnValue(undefined);
      handler = createHandler();
      handler.handlePlanReject(webview as any, 'plan-1', 'conv-missing');

      // Should still send UI update even if persistence fails
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'planStatusUpdate', status: 'rejected' }),
      );
    });
  });

  describe('handlePlanStepAction', () => {
    it('should approve a plan step', () => {
      handler = createHandler();
      handler.handlePlanStepAction(webview as any, 'plan-1', 'plan-1-step-0', 'conv-1', 'approve');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'planStepStatusUpdate',
        planId: 'plan-1',
        stepId: 'plan-1-step-0',
        conversationId: 'conv-1',
        status: 'approved',
      });
      expect(conversations.manager.updateMessages).toHaveBeenCalled();
    });

    it('should reject a plan step', () => {
      handler = createHandler();
      handler.handlePlanStepAction(webview as any, 'plan-1', 'plan-1-step-1', 'conv-1', 'reject');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ stepId: 'plan-1-step-1', status: 'rejected' }),
      );
    });
  });

  describe('handlePlanStepModify', () => {
    it('should modify step description and status', () => {
      handler = createHandler();
      handler.handlePlanStepModify(
        webview as any,
        'plan-1',
        'plan-1-step-0',
        'Updated step description',
        'conv-1',
      );

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'planStepStatusUpdate',
        planId: 'plan-1',
        stepId: 'plan-1-step-0',
        conversationId: 'conv-1',
        status: 'modified',
        newDescription: 'Updated step description',
      });
      expect(conversations.manager.updateMessages).toHaveBeenCalled();
    });
  });

  describe('handlePlanApprove', () => {
    it('should update status and send UI notification', async () => {
      handler = createHandler();
      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'planStatusUpdate',
        planId: 'plan-1',
        conversationId: 'conv-1',
        status: 'approved',
      });
    });

    it('should configure agent and send execute message when filePath provided', async () => {
      const agentRunner = { configure: vi.fn().mockResolvedValue(undefined) };
      const agentManager = { get: vi.fn().mockReturnValue(agentRunner) };
      const platform = { media: {} };
      const messages = { handleUserMessage: vi.fn() };

      // Mock fs.promises.readFile
      vi.doMock('fs', () => ({
        promises: { readFile: vi.fn().mockResolvedValue('# Plan Content\n## Step 1\nDo thing') },
      }));

      handler = createHandler({
        agentManager: agentManager as any,
        platform: platform as any,
        messages: messages as any,
      });

      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1', '/tmp/plan.md');

      expect(agentManager.get).toHaveBeenCalledWith('conv-1');
      expect(agentRunner.configure).toHaveBeenCalledWith(
        expect.objectContaining({ executionMode: 'auto', autoExecuteTools: true }),
      );
    });

    it('should send generic execution message without filePath', async () => {
      const agentRunner = { configure: vi.fn().mockResolvedValue(undefined) };
      const agentManager = { get: vi.fn().mockReturnValue(agentRunner) };
      const platform = { media: {} };
      const messages = { handleUserMessage: vi.fn() };

      handler = createHandler({
        agentManager: agentManager as any,
        platform: platform as any,
        messages: messages as any,
      });

      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1');

      expect(agentRunner.configure).toHaveBeenCalledWith(
        expect.objectContaining({ executionMode: 'auto' }),
      );
      expect(messages.handleUserMessage).toHaveBeenCalledWith(
        webview,
        expect.stringContaining('approved'),
      );
    });
  });
});
