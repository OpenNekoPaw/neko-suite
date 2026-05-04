import type * as vscode from 'vscode';
import type { OpenTab } from '@neko-agent/types';
import type { DragDropBroker } from '../../services/DragDropBroker';
import type { AgentMessageTurnHandler } from '../agentMessageTurnHandler';
import type {
  ContextHandler,
  ConversationMessageHandler,
  FileOperationHandler,
  PlanModeHandler,
  SettingsHandler,
  SkillHandler,
  SlashCommandHandler,
  TaskHandler,
} from '../handlers';

export interface ChatWebviewMessageRouterDeps {
  readonly webview: vscode.Webview;
  readonly messages?: AgentMessageTurnHandler;
  readonly taskHandler: TaskHandler;
  readonly skillHandler: SkillHandler;
  readonly fileOperationHandler: FileOperationHandler;
  readonly planModeHandler: PlanModeHandler;
  readonly settingsHandler: SettingsHandler;
  readonly contextHandler: ContextHandler;
  readonly slashCommandHandler: SlashCommandHandler;
  readonly conversationMessageHandler: ConversationMessageHandler;
  readonly dndBroker: DragDropBroker;
  readonly sendTabState: () => void;
  readonly updateTabState: (openTabs: OpenTab[], activeTabId: string | null) => void;
  readonly syncCanvasAmbientScopeFromActiveConversation: () => void;
}
