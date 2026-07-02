import { buildExtensionSkillCommandResultPayload } from '@neko/agent';
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

    case 'clearActiveSkill': {
      const conversationId = resolveRequiredConversationId(webview, message, 'clear active skill');
      if (!conversationId) return true;
      deps.skillHandler.clearActiveSkill(conversationId, {
        ...(message.recordId ? { recordId: message.recordId } : {}),
        ...(message.slot ? { slot: message.slot } : {}),
        ...(message.skillName ? { skillName: message.skillName } : {}),
      });
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

    case 'invokeSkill': {
      const conversationId = resolveRequiredConversationId(webview, message, 'invoke skill');
      if (!conversationId) return true;
      void deps.skillHandler
        .handleSkillInvocation(webview, message.skillName, conversationId, message.args)
        .then((result) => {
          if (result?.applied) return;
          void webview.postMessage(
            buildExtensionSkillCommandResultPayload({
              conversationId,
              command: `$${message.skillName}`,
              status: result ? 'failed' : 'unknown',
              ...(result?.error ? { error: result.error } : {}),
            }),
          );
        });
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
