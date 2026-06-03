/**
 * Character Dialogue session projection handlers.
 */

import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type {
  CharacterDialogueSessionExitedMessage,
  CharacterDialogueSessionStartedMessage,
} from './messages';
import {
  activateCharacterRoleSessionView,
  persistCurrentVisibleConversation,
} from './character-role-session-state';

const handleCharacterDialogueSessionStarted: MessageHandler<'characterDialogueSessionStarted'> = (
  message: CharacterDialogueSessionStartedMessage,
  context,
) => {
  persistCurrentVisibleConversation(context);
  activateCharacterRoleSessionView(context, {
    sessionId: message.session.sessionId,
    cachedMessages: [],
  });
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
