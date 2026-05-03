import type { WebviewToExtensionMessage } from '@neko-agent/types';
import { tryHandleConversationRoute } from './router/conversationRoutes';
import { tryHandleFileAndPluginRoute } from './router/fileAndPluginRoutes';
import { tryHandleMessageRoute } from './router/messageRoutes';
import { tryHandlePlanRoute } from './router/planRoutes';
import { tryHandleSettingsRoute } from './router/settingsRoutes';
import { tryHandleSkillContextRoute } from './router/skillContextRoutes';
import { tryHandleTaskRoute } from './router/taskRoutes';
import type { ChatWebviewMessageRouterDeps } from './router/types';

export type { ChatWebviewMessageRouterDeps } from './router/types';

const routeHandlers = [
  tryHandleMessageRoute,
  tryHandleConversationRoute,
  tryHandlePlanRoute,
  tryHandleSettingsRoute,
  tryHandleTaskRoute,
  tryHandleFileAndPluginRoute,
  tryHandleSkillContextRoute,
] as const;

export function handleChatWebviewMessage(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): void {
  for (const tryHandle of routeHandlers) {
    if (tryHandle(message, deps)) {
      return;
    }
  }
}
