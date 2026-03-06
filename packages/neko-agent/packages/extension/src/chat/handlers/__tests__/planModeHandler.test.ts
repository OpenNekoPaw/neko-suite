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
    setMode: vi.fn((m: 'default' | 'plan') => { mode = m; }),
    togglePlanMode: vi.fn(() => { mode = mode === 'default' ? 'plan' : 'default'; }),
    getMode: vi.fn(() => mode),
    isPlanMode: vi.fn(() => mode === 'plan'),
    getPrompt: vi.fn().mockReturnValue('system prompt'),
  };
}

function createMockConversations() {
  const messages = [
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: 'plan',
      contentBlocks: [
        {
          type: 'plan',
          plan: {
            id: 'plan-1',
            title: 'Test Plan',
            status: 'pending',
            steps: [
              { id: 'plan-1-step-0', description: 'Step 1', status: 'pending' },
              { id: 'plan-1-step-1', description: 'Step 2', status: 'pending' },
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
    customSystemPrompt: '',
    temperature: 0.7,
    maxTokens: 4096,
    executionMode: 'auto' as const,
  };
}

function createMockAgentManager() {
  return {
    get: vi.fn().mockReturnValue({
      configure: vi.fn().mockResolvedValue(undefined),
    }),
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

  function createHandler(overrides: Record<string, unknown> = {}) {
    return new PlanModeHandler({
      systemPrompt: systemPrompt as any,
      conversations: conversations as any,
      settings: settings as any,
      ...overrides,
    });
  }

  describe('handleSetPromptMode', () => {
    it('should set mode and send update', () => {
      handler = createHandler();
      handler.handleSetPromptMode(webview as any, 'plan');

      expect(systemPrompt.setMode).toHaveBeenCalledWith('plan');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'promptModeChanged' }),
      );
    });
  });

  describe('handleTogglePlanMode', () => {
    it('should toggle mode and send update', () => {
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
    it('should update plan status and notify UI', () => {
      handler = createHandler();
      handler.handlePlanReject(webview as any, 'plan-1', 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'planStatusUpdate',
        planId: 'plan-1',
        conversationId: 'conv-1',
        status: 'rejected',
      });
      // Should also send rejection text
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamText', conversationId: 'conv-1' }),
      );
    });

    it('should persist rejected status in conversation', () => {
      handler = createHandler();
      handler.handlePlanReject(webview as any, 'plan-1', 'conv-1');

      expect(conversations.manager.updateMessages).toHaveBeenCalledWith(
        'conv-1',
        expect.arrayContaining([
          expect.objectContaining({
            contentBlocks: expect.arrayContaining([
              expect.objectContaining({
                plan: expect.objectContaining({ status: 'rejected' }),
              }),
            ]),
          }),
        ]),
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
    it('should modify step description and persist', () => {
      handler = createHandler();
      handler.handlePlanStepModify(webview as any, 'plan-1', 'plan-1-step-0', 'Updated step description', 'conv-1');

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
    it('should approve plan without file path', async () => {
      const agentManager = createMockAgentManager();
      const messages = { handleUserMessage: vi.fn() };
      const platform = { config: {} };

      handler = createHandler({
        agentManager: agentManager as any,
        platform: platform as any,
        messages: messages as any,
      });

      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'planStatusUpdate', status: 'approved' }),
      );
      expect(agentManager.get).toHaveBeenCalledWith('conv-1');
      expect(messages.handleUserMessage).toHaveBeenCalledWith(
        webview,
        'The plan has been approved. Please proceed with the implementation.',
      );
    });

    it('should not execute when agentManager is unavailable', async () => {
      handler = createHandler();
      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1');

      // Should still send status update
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'planStatusUpdate', status: 'approved' }),
      );
    });

    it('should handle missing conversation gracefully for status persistence', () => {
      conversations.manager.get.mockReturnValue(null);
      handler = createHandler();
      handler.handlePlanReject(webview as any, 'plan-1', 'conv-1');

      // Should still send UI update, just not persist
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'planStatusUpdate' }),
      );
      expect(conversations.manager.updateMessages).not.toHaveBeenCalled();
    });
  });
});
