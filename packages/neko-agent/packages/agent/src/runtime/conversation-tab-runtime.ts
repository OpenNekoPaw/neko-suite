import {
  buildAmbientCanvasUpdateMessage,
  buildExternalInputMessage,
  buildGlobalErrorMessage,
  buildInjectContextMessage,
  buildPluginCommandsMessage,
  buildTabStateMessage,
  type AmbientCanvasUpdateMessage,
  type ExternalMessage,
  type GlobalErrorMessage,
  type InjectContextMessage,
  projectTabStateUpdate,
  resolveActiveTabConversationId,
  type OpenTab,
  type PluginCommandsMessage,
  type PrefillInputMessage,
  type TabState,
  type TabStateMessage,
} from '@neko-agent/types';
import type { AgentContextPayload } from '@neko/shared';

export type ConversationTabSyncReason =
  | 'no-active-tab-conversation'
  | 'already-active'
  | 'switch-rejected';

export type ConversationTabSyncResult =
  | {
      kind: 'active-conversation-cleared';
    }
  | {
      kind: 'switched';
      conversationId: string;
    }
  | {
      kind: 'character-dialogue-active';
      sessionId: string;
    }
  | {
      kind: 'embody-character-active';
      sessionId: string;
    }
  | {
      kind: 'skipped';
      reason: ConversationTabSyncReason;
      conversationId?: string;
    };

export interface ConversationTabRuntimeEffects {
  hasConversation(conversationId: string): boolean;
  hasCharacterDialogueSession?(sessionId: string): boolean;
  hasEmbodyCharacterSession?(sessionId: string): boolean;
  getActiveConversationId(): string | null;
  switchConversation(conversationId: string): boolean;
  clearActiveConversation?(): void;
  onConversationSwitched?(conversationId: string): void;
}

export interface SyncActiveConversationFromTabStateInput {
  tabState: TabState;
}

export interface UpdateTabStateRuntimeInput {
  openTabs: readonly OpenTab[];
  activeTabId: string | null;
}

export interface UpdateTabStateRuntimeResult {
  tabState: TabState;
  sync: ConversationTabSyncResult;
}

export type ChatRestorePlanAction =
  | { type: 'syncActiveConversation' }
  | { type: 'syncCanvasAmbientScope' }
  | { type: 'sendConversationList' }
  | { type: 'sendActiveConversation' }
  | { type: 'sendSettings' }
  | { type: 'postTabState'; message: TabStateMessage }
  | { type: 'sendActiveConversationTasks' }
  | { type: 'sendAgentStateSnapshot' }
  | { type: 'postPluginCommands'; message: PluginCommandsMessage };

export interface BuildChatRestorePlanInput {
  tabState: TabState;
  hasWebview: boolean;
  pluginCommands?: NonNullable<PluginCommandsMessage['commands']>;
}

export interface ChatRestorePlan {
  actions: ChatRestorePlanAction[];
}

export function syncActiveConversationFromTabState(
  input: SyncActiveConversationFromTabStateInput,
  effects: ConversationTabRuntimeEffects,
): ConversationTabSyncResult {
  if (input.tabState.openTabs.length === 0) {
    if (effects.getActiveConversationId()) {
      effects.clearActiveConversation?.();
      return { kind: 'active-conversation-cleared' };
    }
    return { kind: 'skipped', reason: 'no-active-tab-conversation' };
  }

  const conversationId = resolveActiveTabConversationId({
    tabState: input.tabState,
    hasConversation: effects.hasConversation,
    hasCharacterDialogueSession: effects.hasCharacterDialogueSession,
    hasEmbodyCharacterSession: effects.hasEmbodyCharacterSession,
  });

  if (!conversationId) {
    return { kind: 'skipped', reason: 'no-active-tab-conversation' };
  }

  const activeTab = input.tabState.activeTabId
    ? input.tabState.openTabs.find((tab) => tab.id === input.tabState.activeTabId)
    : undefined;
  if (activeTab?.kind === 'character-dialogue') {
    return { kind: 'character-dialogue-active', sessionId: conversationId };
  }
  if (activeTab?.kind === 'embody-character') {
    return { kind: 'embody-character-active', sessionId: conversationId };
  }

  if (effects.getActiveConversationId() === conversationId) {
    return { kind: 'skipped', reason: 'already-active', conversationId };
  }

  if (!effects.switchConversation(conversationId)) {
    return { kind: 'skipped', reason: 'switch-rejected', conversationId };
  }

  effects.onConversationSwitched?.(conversationId);
  return { kind: 'switched', conversationId };
}

export function updateTabStateRuntime(
  input: UpdateTabStateRuntimeInput,
  effects: ConversationTabRuntimeEffects,
): UpdateTabStateRuntimeResult {
  const tabState = projectTabStateUpdate(input);
  return {
    tabState,
    sync: syncActiveConversationFromTabState({ tabState }, effects),
  };
}

export function buildChatAmbientCanvasUpdateMessage(input: {
  nodes: AmbientCanvasUpdateMessage['nodes'];
  conversationId: string | null;
}): AmbientCanvasUpdateMessage {
  return buildAmbientCanvasUpdateMessage(input);
}

export function buildChatContextInjectionMessage(
  payload: AgentContextPayload,
  input: { conversationId: string | null },
): InjectContextMessage {
  return buildInjectContextMessage(payload, input);
}

export function buildChatExternalInputMessage(input: {
  message: string;
  autoSend: boolean;
}): ExternalMessage | PrefillInputMessage {
  return buildExternalInputMessage(input);
}

export function buildChatPluginCommandsMessage(
  commands: NonNullable<PluginCommandsMessage['commands']>,
): PluginCommandsMessage {
  return buildPluginCommandsMessage(commands);
}

export function buildChatTabStateMessage(tabState: TabState): TabStateMessage {
  return buildTabStateMessage(tabState);
}

export function buildInvalidWebviewPayloadMessage(): GlobalErrorMessage {
  return buildGlobalErrorMessage('Invalid webview message payload.');
}

export function buildChatRestorePlan(input: BuildChatRestorePlanInput): ChatRestorePlan {
  const actions: ChatRestorePlanAction[] = [{ type: 'sendConversationList' }];

  if (!input.hasWebview) {
    return { actions };
  }

  actions.push(
    { type: 'sendSettings' },
    { type: 'postTabState', message: buildTabStateMessage(input.tabState) },
  );

  actions.push({ type: 'sendActiveConversationTasks' }, { type: 'sendAgentStateSnapshot' });

  if (input.pluginCommands) {
    actions.push({
      type: 'postPluginCommands',
      message: buildPluginCommandsMessage(input.pluginCommands),
    });
  }

  return { actions };
}
