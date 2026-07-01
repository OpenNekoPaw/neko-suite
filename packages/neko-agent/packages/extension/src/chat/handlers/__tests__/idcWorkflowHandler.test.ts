import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdcWorkflowHandler } from '../idcWorkflowHandler';

describe('IdcWorkflowHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes explicit user IDC workflow start through the agent manager', () => {
    const events = [
      {
        id: 'event-1',
        activationId: 'activation-1',
        conversationId: 'conv-1',
        target: 'idc-workflow',
        action: 'activate',
        name: 'idc',
        step: 'active',
        status: 'succeeded',
        source: 'user-explicit',
        requestedBy: 'user',
        at: 100,
      },
    ];
    const agentManager = {
      controlIdcWorkflow: vi.fn(() => ({
        success: true,
        message: 'started',
        runId: 'run-1',
        events,
      })),
    };
    const webview = { postMessage: vi.fn() };
    const handler = new IdcWorkflowHandler({ agentManager: agentManager as never });

    handler.handleControl(webview as never, {
      conversationId: 'conv-1',
      action: 'start',
      runKind: 'idc',
      reason: 'toolbar',
    });

    expect(agentManager.controlIdcWorkflow).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        action: 'start',
        runKind: 'idc',
        intent: expect.objectContaining({
          conversationId: 'conv-1',
          source: 'user-explicit',
          target: 'idc-workflow',
          action: 'activate',
          name: 'idc',
          requestedBy: 'user',
          reason: 'toolbar',
        }),
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'agentCapabilityActivationProgress',
      conversationId: 'conv-1',
      events,
    });
  });

  it('reports unavailable workflow control visibly', () => {
    const webview = { postMessage: vi.fn() };
    const handler = new IdcWorkflowHandler({});

    handler.handleControl(webview as never, {
      conversationId: 'conv-1',
      action: 'stop',
    });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'IDC workflow control is not available.',
    });
  });
});
