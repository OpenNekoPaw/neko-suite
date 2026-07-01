import type * as vscode from 'vscode';
import {
  buildAgentCapabilityActivationProgressMessage,
  buildGlobalErrorMessage,
  type ControlIdcWorkflowAction,
} from '@neko-agent/types';
import { createAgentCapabilityActivationIntent } from '@neko/shared';
import type { IAgentManager } from '../../ai/agentManager';

export interface IdcWorkflowHandlerDeps {
  readonly agentManager?: IAgentManager;
}

export interface IdcWorkflowControlInput {
  readonly conversationId: string;
  readonly action: ControlIdcWorkflowAction;
  readonly runKind?: string;
  readonly runId?: string;
  readonly reason?: string;
}

export class IdcWorkflowHandler {
  constructor(private deps: IdcWorkflowHandlerDeps = {}) {}

  updateDeps(deps: IdcWorkflowHandlerDeps): void {
    this.deps = { ...this.deps, ...deps };
  }

  handleControl(webview: vscode.Webview, input: IdcWorkflowControlInput): void {
    const agentManager = this.deps.agentManager;
    if (!agentManager) {
      void webview.postMessage(buildGlobalErrorMessage('IDC workflow control is not available.'));
      return;
    }

    const intent = createAgentCapabilityActivationIntent({
      conversationId: input.conversationId,
      source: 'user-explicit',
      target: 'idc-workflow',
      action: projectActivationAction(input.action),
      name: normalizeIdcWorkflowName(input.runKind, input.action),
      requestedBy: 'user',
      reason: input.reason ?? projectDefaultReason(input.action),
      createdAt: Date.now(),
      metadata: {
        action: input.action,
        ...(input.runId ? { runId: input.runId } : {}),
      },
    });

    try {
      const result = agentManager.controlIdcWorkflow(input.conversationId, {
        action: input.action,
        ...(input.runKind ? { runKind: input.runKind } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        intent,
      });
      if (result.events.length > 0) {
        void webview.postMessage(
          buildAgentCapabilityActivationProgressMessage({
            conversationId: input.conversationId,
            events: result.events,
          }),
        );
      }
      if (!result.success) {
        void webview.postMessage(buildGlobalErrorMessage(result.message));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'IDC workflow control failed.';
      void webview.postMessage(buildGlobalErrorMessage(message));
    }
  }
}

function normalizeIdcWorkflowName(
  runKind: string | undefined,
  action: ControlIdcWorkflowAction,
): string {
  const trimmed = runKind?.trim();
  if (trimmed) return trimmed;
  return action === 'resume' ? 'idc-resume' : 'idc';
}

function projectDefaultReason(action: ControlIdcWorkflowAction): string {
  switch (action) {
    case 'start':
      return 'User explicitly started IDC workflow';
    case 'resume':
      return 'User explicitly resumed IDC workflow';
    case 'stop':
      return 'User explicitly stopped IDC workflow';
  }
}

function projectActivationAction(
  action: ControlIdcWorkflowAction,
): 'activate' | 'resume' | 'deactivate' {
  switch (action) {
    case 'start':
      return 'activate';
    case 'resume':
      return 'resume';
    case 'stop':
      return 'deactivate';
  }
}
