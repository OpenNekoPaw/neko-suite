import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandleConversationRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'confirmTool':
      deps.conversationMessageHandler.handleConfirmTool(
        message.toolCallId,
        message.approved,
        message.conversationId,
      );
      return true;

    case 'cancelMessage': {
      const conversationId = resolveRequiredConversationId(webview, message, 'cancel message');
      if (!conversationId) return true;
      if (deps.characterDialogue?.cancel(conversationId)) return true;
      if (deps.embodyCharacter?.cancel(conversationId)) return true;
      deps.conversationMessageHandler.handleCancelMessage(webview, conversationId);
      return true;
    }

    case 'exitCharacterDialogueSession':
      void deps.characterDialogue?.exit(message.sessionId);
      return true;

    case 'exitEmbodyCharacterSession':
      void deps.embodyCharacter?.exit(message.sessionId);
      return true;

    case 'newConversation':
      deps.conversationMessageHandler.handleNewConversation();
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return true;

    case 'switchConversation':
      deps.conversationMessageHandler.handleSwitchConversation(message.conversationId);
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return true;

    case 'deleteConversation':
      deps.conversationMessageHandler.handleDeleteConversation(message.conversationId, {
        activateNext: message.activateNext,
      });
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return true;

    case 'getConversations':
      deps.conversationMessageHandler.sendConversationList();
      return true;

    case 'getActiveConversation':
      deps.conversationMessageHandler.sendActiveConversation();
      return true;

    case 'getAgentStates':
      deps.conversationMessageHandler.sendAgentStateSnapshot(webview);
      return true;

    case 'clearHistory': {
      const conversationId = resolveRequiredConversationId(webview, message, 'clear history');
      if (!conversationId) return true;
      deps.conversationMessageHandler.handleClearHistory(webview, conversationId);
      return true;
    }

    case 'clearAllConversations':
      deps.conversationMessageHandler.handleClearAllConversations(webview);
      deps.syncCanvasAmbientScopeFromActiveConversation();
      return true;

    default:
      return false;
  }
}
