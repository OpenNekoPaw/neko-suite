import type { ConversationKind, Message, OpenTab } from '@neko-agent/types';
import type { ConversationStreamingState } from '@neko-agent/types';

export type CharacterRoleOpenTab = OpenTab & {
  kind: 'character-dialogue' | 'embody-character';
};

export function isCharacterRoleConversationKind(kind: ConversationKind): boolean {
  return kind === 'character-dialogue' || kind === 'embody-character';
}

export function isCharacterRoleTab(tab: OpenTab | undefined): tab is CharacterRoleOpenTab {
  return tab?.kind === 'character-dialogue' || tab?.kind === 'embody-character';
}

export function findActiveTab(
  openTabs: readonly OpenTab[],
  activeTabId: string | null,
): OpenTab | undefined {
  return activeTabId ? openTabs.find((tab) => tab.id === activeTabId) : undefined;
}

export function idleStreamingState(): ConversationStreamingState {
  return { streamingMessageId: null, isThinking: false };
}

export function projectCharacterRoleSessionView(input: {
  readonly sessionId: string;
  readonly cachedMessages?: readonly Message[];
  readonly cachedStreaming?: ConversationStreamingState;
}): {
  readonly activeConversationId: string;
  readonly messages: Message[];
  readonly streaming: ConversationStreamingState;
} {
  return {
    activeConversationId: input.sessionId,
    messages: input.cachedMessages ? [...input.cachedMessages] : [],
    streaming: input.cachedStreaming ?? idleStreamingState(),
  };
}
