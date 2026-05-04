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

export const CHAT_WEBVIEW_MESSAGE_ROUTER_TYPES = [
  'sendMessage',
  'searchProjectFiles',
  'mermaidError',
  'confirmTool',
  'cancelMessage',
  'stopAgent',
  'newConversation',
  'switchConversation',
  'deleteConversation',
  'getConversations',
  'getActiveConversation',
  'getAgentStates',
  'clearHistory',
  'clearAllConversations',
  'planApprove',
  'planReject',
  'planStepApprove',
  'planStepReject',
  'planStepModify',
  'setPromptMode',
  'togglePlanMode',
  'getPromptMode',
  'getSettings',
  'updateSettings',
  'getTabState',
  'updateTabState',
  'addModel',
  'removeModel',
  'toggleProvider',
  'toggleModel',
  'addMCPServer',
  'testMCPServer',
  'getTasks',
  'cancelTask',
  'retryTask',
  'removeTask',
  'viewTaskResult',
  'clearCompletedTasks',
  'openFile',
  'revealFile',
  'openConfigFile',
  'openPromptConfig',
  'openAgentsFile',
  'openSettingsFile',
  'openSkillFile',
  'openCommandFile',
  'openUrl',
  'downloadSvg',
  'sendToPlugin',
  'dnd:start',
  'invokePluginSlashCommand',
  'openMarketplace',
  'getSkills',
  'executeSkill',
  'cancelSkill',
  'clearActiveSkill',
  'invokeSlashCommand',
  'getContextTokenCount',
  'compressContext',
] as const satisfies readonly WebviewToExtensionMessage['type'][];

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
