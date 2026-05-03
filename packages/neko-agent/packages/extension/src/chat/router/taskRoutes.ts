import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandleTaskRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'getTasks': {
      const conversationId = resolveRequiredConversationId(webview, message, 'getTasks');
      if (!conversationId) return true;
      deps.taskHandler.sendTasks(webview, conversationId);
      return true;
    }

    case 'cancelTask': {
      const conversationId = resolveRequiredConversationId(webview, message, 'cancelTask');
      if (!conversationId) return true;
      deps.taskHandler.handleCancelTask(webview, message.taskId, conversationId);
      return true;
    }

    case 'retryTask': {
      const conversationId = resolveRequiredConversationId(webview, message, 'retryTask');
      if (!conversationId) return true;
      deps.taskHandler.handleRetryTask(webview, message.taskId, conversationId);
      return true;
    }

    case 'removeTask': {
      const conversationId = resolveRequiredConversationId(webview, message, 'removeTask');
      if (!conversationId) return true;
      deps.taskHandler.handleRemoveTask(webview, message.taskId, conversationId);
      return true;
    }

    case 'viewTaskResult': {
      const conversationId = resolveRequiredConversationId(webview, message, 'viewTaskResult');
      if (!conversationId) return true;
      deps.taskHandler.handleViewTaskResult(message.taskId, conversationId);
      return true;
    }

    case 'clearCompletedTasks': {
      const conversationId = resolveRequiredConversationId(webview, message, 'clearCompletedTasks');
      if (!conversationId) return true;
      deps.taskHandler.handleClearCompletedTasks(webview, conversationId);
      return true;
    }

    default:
      return false;
  }
}
