/**
 * PlanModeHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConversationPromptModeRuntime } from '@neko/agent';
import { PlanModeHandler } from '../planModeHandler';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockSystemPrompt() {
  const promptModeRuntime = createConversationPromptModeRuntime();
  return {
    getPromptModeRuntime: vi.fn(() => promptModeRuntime),
    getMode: vi.fn((conversationId: string) => promptModeRuntime.getMode(conversationId)),
    isPlanMode: vi.fn((conversationId: string) => promptModeRuntime.isPlanMode(conversationId)),
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
    get: vi.fn().mockReturnValue({ messages }),
    updateMessagesForConversation: vi.fn(),
    manager: {
      get: vi.fn().mockReturnValue({ messages }),
      updateMessages: vi.fn(),
    },
  };
}

describe('PlanModeHandler', () => {
  let handler: PlanModeHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let systemPrompt: ReturnType<typeof createMockSystemPrompt>;
  let conversations: ReturnType<typeof createMockConversations>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    systemPrompt = createMockSystemPrompt();
    conversations = createMockConversations();
  });

  function createHandler(overrides?: Record<string, unknown>) {
    return new PlanModeHandler({
      systemPrompt: systemPrompt as any,
      conversations: conversations as any,
      ...overrides,
    });
  }

  describe('handleSetPromptMode', () => {
    it('should set mode to plan', () => {
      handler = createHandler();
      handler.handleSetPromptMode(webview as any, 'conv-1', 'plan');

      expect(systemPrompt.getPromptModeRuntime().getMode('conv-1')).toBe('plan');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'promptModeChanged',
          conversationId: 'conv-1',
          isPlanMode: true,
        }),
      );
    });

    it('should set mode to default', () => {
      handler = createHandler();
      handler.handleSetPromptMode(webview as any, 'conv-1', 'default');

      expect(systemPrompt.getPromptModeRuntime().getMode('conv-1')).toBe('default');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'promptModeChanged',
          conversationId: 'conv-1',
          isPlanMode: false,
        }),
      );
    });
  });

  describe('handleTogglePlanMode', () => {
    it('should toggle from default to plan', () => {
      handler = createHandler();
      handler.handleTogglePlanMode(webview as any, 'conv-1');

      expect(systemPrompt.getPromptModeRuntime().getMode('conv-1')).toBe('plan');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'promptModeChanged', conversationId: 'conv-1' }),
      );
    });
  });

  describe('sendPromptMode', () => {
    it('should send current mode to webview', () => {
      handler = createHandler();
      handler.sendPromptMode(webview as any, 'conv-1');

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'promptModeChanged',
        conversationId: 'conv-1',
        mode: 'default',
        isPlanMode: false,
      });
    });
  });

  describe('handlePlanReject', () => {
    it('should update plan status and send rejection message', async () => {
      handler = createHandler();
      await handler.handlePlanReject(webview as any, 'plan-1', 'conv-1');

      // Should persist status
      expect(conversations.updateMessagesForConversation).toHaveBeenCalled();

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

    it('should handle missing conversation gracefully', async () => {
      conversations.get.mockReturnValue(undefined);
      handler = createHandler();
      await handler.handlePlanReject(webview as any, 'plan-1', 'conv-missing');

      // Should still send UI update even if persistence fails
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'planStatusUpdate', status: 'rejected' }),
      );
    });
  });

  describe('handlePlanStepAction', () => {
    it('should approve a plan step', async () => {
      handler = createHandler();
      await handler.handlePlanStepAction(
        webview as any,
        'plan-1',
        'plan-1-step-0',
        'conv-1',
        'approve',
      );

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'planStepStatusUpdate',
        planId: 'plan-1',
        stepId: 'plan-1-step-0',
        conversationId: 'conv-1',
        status: 'approved',
      });
      expect(conversations.updateMessagesForConversation).toHaveBeenCalled();
    });

    it('should reject a plan step', async () => {
      handler = createHandler();
      await handler.handlePlanStepAction(
        webview as any,
        'plan-1',
        'plan-1-step-1',
        'conv-1',
        'reject',
      );

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ stepId: 'plan-1-step-1', status: 'rejected' }),
      );
    });
  });

  describe('handlePlanStepModify', () => {
    it('should modify step description and status', async () => {
      handler = createHandler();
      await handler.handlePlanStepModify(
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
      expect(conversations.updateMessagesForConversation).toHaveBeenCalled();
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

    it('should bind plan file read errors to the approving conversation', async () => {
      const readPlanFile = vi.fn().mockRejectedValue(new Error('missing file'));

      handler = createHandler({ readPlanFile });
      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1', '/missing/plan.md');

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          conversationId: 'conv-1',
          message: expect.stringContaining('Failed to read plan file'),
        }),
      );
    });

    it('should send auto execution message when filePath provided', async () => {
      const messages = { handleUserMessage: vi.fn() };
      const readPlanFile = vi.fn().mockResolvedValue('# Plan Content\n## Step 1\nDo thing');

      handler = createHandler({
        messages: messages as any,
        readPlanFile,
      });

      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1', '/tmp/plan.md');

      expect(messages.handleUserMessage).toHaveBeenCalledWith(
        webview,
        expect.objectContaining({
          conversationId: 'conv-1',
          messageText: expect.stringContaining('# Plan Content'),
          sessionMode: 'agent',
          executionOverrides: expect.objectContaining({ executionMode: 'auto' }),
        }),
      );
    });

    it('should send generic execution message without filePath', async () => {
      const messages = { handleUserMessage: vi.fn() };

      handler = createHandler({
        messages: messages as any,
      });

      await handler.handlePlanApprove(webview as any, 'plan-1', 'conv-1');

      expect(messages.handleUserMessage).toHaveBeenCalledWith(
        webview,
        expect.objectContaining({
          conversationId: 'conv-1',
          messageText: expect.stringContaining('approved'),
          sessionMode: 'agent',
          executionOverrides: expect.objectContaining({ executionMode: 'auto' }),
        }),
      );
    });
  });
});
