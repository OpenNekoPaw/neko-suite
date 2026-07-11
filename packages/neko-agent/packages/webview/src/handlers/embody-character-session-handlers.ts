/**
 * Embody Character session projection handlers.
 */

import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type {
  EmbodyCharacterSessionExitedMessage,
  EmbodyCharacterSessionStartedMessage,
} from './messages';
import {
  activateConversationTabView,
  persistCurrentVisibleConversation,
} from './conversation-tab-session-state';

const handleEmbodyCharacterSessionStarted: MessageHandler<'embodyCharacterSessionStarted'> = (
  message: EmbodyCharacterSessionStartedMessage,
  context,
) => {
  persistCurrentVisibleConversation(context);
  context.conversationMessagesRef.current.delete(message.session.sessionId);
  context.conversationStreamingRef.current.delete(message.session.sessionId);
  activateConversationTabView(context, message.session.sessionId, 'extension-active-conversation');
  context.setOpenTabs((prev) => [
    ...prev.filter((tab) => tab.id !== message.tab.id),
    {
      ...message.tab,
      kind: 'embody-character',
      embodyCharacterSession: message.session,
    },
  ]);
  context.setActiveTabId(message.tab.id);
  context.setActiveTab('chat');
};

const handleEmbodyCharacterSessionExited: MessageHandler<'embodyCharacterSessionExited'> = (
  message: EmbodyCharacterSessionExitedMessage,
  context,
) => {
  context.setOpenTabs((prev) =>
    prev.map((tab) =>
      tab.kind === 'embody-character' &&
      tab.conversationId === message.sessionId &&
      tab.embodyCharacterSession
        ? {
            ...tab,
            embodyCharacterSession: { ...tab.embodyCharacterSession, status: 'exited' },
          }
        : tab,
    ),
  );
};

export const embodyCharacterSessionHandlers: HandlerRegistration[] = [
  defineHandler('embodyCharacterSessionStarted', handleEmbodyCharacterSessionStarted),
  defineHandler('embodyCharacterSessionExited', handleEmbodyCharacterSessionExited),
];
