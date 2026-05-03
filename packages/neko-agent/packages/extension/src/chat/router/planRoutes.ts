import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandlePlanRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'planApprove': {
      const conversationId = resolveRequiredConversationId(webview, message, 'approve plan');
      if (!conversationId) return true;
      deps.planModeHandler.handlePlanApprove(
        webview,
        message.planId,
        conversationId,
        message.filePath,
      );
      return true;
    }

    case 'planReject': {
      const conversationId = resolveRequiredConversationId(webview, message, 'reject plan');
      if (!conversationId) return true;
      deps.planModeHandler.handlePlanReject(webview, message.planId, conversationId);
      return true;
    }

    case 'planStepApprove': {
      const conversationId = resolveRequiredConversationId(webview, message, 'approve plan step');
      if (!conversationId) return true;
      deps.planModeHandler.handlePlanStepAction(
        webview,
        message.planId,
        message.stepId,
        conversationId,
        'approve',
      );
      return true;
    }

    case 'planStepReject': {
      const conversationId = resolveRequiredConversationId(webview, message, 'reject plan step');
      if (!conversationId) return true;
      deps.planModeHandler.handlePlanStepAction(
        webview,
        message.planId,
        message.stepId,
        conversationId,
        'reject',
      );
      return true;
    }

    case 'planStepModify': {
      const conversationId = resolveRequiredConversationId(webview, message, 'modify plan step');
      if (!conversationId) return true;
      deps.planModeHandler.handlePlanStepModify(
        webview,
        message.planId,
        message.stepId,
        message.newDescription ?? '',
        conversationId,
      );
      return true;
    }

    case 'setPromptMode':
      deps.planModeHandler.handleSetPromptMode(webview, message.conversationId, message.mode);
      return true;

    case 'togglePlanMode':
      deps.planModeHandler.handleTogglePlanMode(webview, message.conversationId);
      return true;

    case 'getPromptMode':
      deps.planModeHandler.sendPromptMode(webview, message.conversationId);
      return true;

    default:
      return false;
  }
}
