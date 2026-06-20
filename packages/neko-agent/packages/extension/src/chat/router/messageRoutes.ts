import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandleMessageRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'sendMessage':
      if (deps.characterDialogue?.hasSession(message.conversationId)) {
        void deps.characterDialogue.routeUserMessage(message.conversationId, message.message);
        return true;
      }
      if (deps.embodyCharacter?.hasSession(message.conversationId)) {
        void deps.embodyCharacter.routeUserMessage(message.conversationId, message.message);
        return true;
      }
      deps.messages?.handleUserMessage(webview, {
        conversationId: message.conversationId,
        messageText: message.message,
        sessionMode: message.sessionMode,
        chatModel: message.chatModel,
        agentModels: message.agentModels,
        llmConfig: message.llmConfig,
        mediaModel: message.mediaModel,
        mediaModels: message.mediaModels,
        attachments: message.attachments,
        contextPayloads: message.contextPayloads,
        promptId: message.promptId,
      });
      return true;

    case 'searchProjectFiles': {
      const conversationId = resolveRequiredConversationId(webview, message, 'searchProjectFiles');
      if (!conversationId) return true;
      deps.messages?.searchProjectFiles(webview, message.filter, conversationId);
      return true;
    }

    case 'mermaidError': {
      const conversationId = resolveRequiredConversationId(
        webview,
        message,
        'report Mermaid error',
      );
      if (!conversationId) return true;
      deps.messages?.handleUserMessage(webview, {
        conversationId,
        messageText: message.feedbackMessage,
        sessionMode: 'agent',
      });
      return true;
    }

    default:
      return false;
  }
}
