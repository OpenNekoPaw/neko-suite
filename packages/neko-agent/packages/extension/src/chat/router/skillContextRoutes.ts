import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandleSkillContextRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'getSkills':
      deps.skillHandler.sendSkillsList(webview);
      return true;

    case 'executeSkill': {
      const conversationId = resolveRequiredConversationId(webview, message, 'execute skill');
      if (!conversationId) return true;
      deps.skillHandler.handleExecuteSkill(
        webview,
        message.skillId,
        conversationId,
        message.input ?? {},
      );
      return true;
    }

    case 'clearActiveSkill': {
      const conversationId = resolveRequiredConversationId(webview, message, 'clear active skill');
      if (!conversationId) return true;
      deps.skillHandler.clearActiveSkill(conversationId);
      return true;
    }

    case 'invokeSlashCommand': {
      const conversationId = resolveRequiredConversationId(
        webview,
        message,
        'invoke slash command',
      );
      if (!conversationId) return true;
      void deps.slashCommandHandler.handleCommand(
        webview,
        message.command,
        message.args,
        conversationId,
      );
      return true;
    }

    case 'getContextTokenCount': {
      const conversationId = resolveRequiredConversationId(
        webview,
        message,
        'get context token count',
      );
      if (!conversationId) return true;
      deps.contextHandler.getTokenCount(webview, conversationId);
      return true;
    }

    case 'compressContext': {
      const conversationId = resolveRequiredConversationId(webview, message, 'compress context');
      if (!conversationId) return true;
      void deps.contextHandler.compressContext(webview, conversationId);
      return true;
    }

    default:
      return false;
  }
}
