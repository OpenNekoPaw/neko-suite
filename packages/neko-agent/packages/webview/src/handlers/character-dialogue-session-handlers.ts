/**
 * Character Dialogue session projection handlers.
 */

import { discardConversationSnapshotProjection } from '@/render-lifecycle/conversation-render-state-adapter';
import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type {
  CharacterDialogueSessionExitedMessage,
  CharacterDialogueSessionStartedMessage,
} from './messages';
import {
  activateConversationTabView,
  persistCurrentVisibleConversation,
} from './conversation-tab-session-state';

const handleCharacterDialogueSessionStarted: MessageHandler<'characterDialogueSessionStarted'> = (
  message: CharacterDialogueSessionStartedMessage,
  context,
) => {
  persistCurrentVisibleConversation(context);
  discardConversationSnapshotProjection({
    conversationId: message.session.sessionId,
    conversationMessagesRef: context.conversationMessagesRef,
    conversationStreamingRef: context.conversationStreamingRef,
  });
  activateConversationTabView(context, message.session.sessionId, 'extension-active-conversation');
  context.setOpenTabs((prev) => [
    ...prev.filter((tab) => tab.id !== message.tab.id),
    {
      ...message.tab,
      kind: 'character-dialogue',
      characterDialogueSession: message.session,
    },
  ]);
  context.setActiveTabId(message.tab.id);
  context.setActiveTab('chat');
};

const handleCharacterDialogueSessionExited: MessageHandler<'characterDialogueSessionExited'> = (
  message: CharacterDialogueSessionExitedMessage,
  context,
) => {
  context.setOpenTabs((prev) =>
    prev.map((tab) =>
      tab.kind === 'character-dialogue' &&
      tab.conversationId === message.sessionId &&
      tab.characterDialogueSession
        ? {
            ...tab,
            characterDialogueSession: { ...tab.characterDialogueSession, status: 'exited' },
          }
        : tab,
    ),
  );
};

export const characterDialogueSessionHandlers: HandlerRegistration[] = [
  defineHandler('characterDialogueSessionStarted', handleCharacterDialogueSessionStarted),
  defineHandler('characterDialogueSessionExited', handleCharacterDialogueSessionExited),
];
