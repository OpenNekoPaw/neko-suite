/**
 * NPC session projection handlers.
 */

import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type { NpcSessionExitedMessage, NpcSessionStartedMessage } from './messages';

const handleNpcSessionStarted: MessageHandler<'npcSessionStarted'> = (
  message: NpcSessionStartedMessage,
  context,
) => {
  context.conversationMessagesRef.current.set(message.session.sessionId, []);
  context.conversationStreamingRef.current.set(message.session.sessionId, {
    streamingMessageId: null,
    isThinking: false,
  });
  context.setMessages([]);
  context.setStreamingMessageId(null);
  context.streamingMessageIdRef.current = null;
  context.setIsThinking(false);
  context.activeConversationIdRef.current = message.session.sessionId;
  context.setActiveConversationId(message.session.sessionId);
  context.setOpenTabs((prev) => [
    ...prev.filter((tab) => tab.id !== message.tab.id),
    {
      ...message.tab,
      kind: 'npc-test',
      npcSession: message.session,
    },
  ]);
  context.setActiveTabId(message.tab.id);
  context.setActiveTab('chat');
};

const handleNpcSessionExited: MessageHandler<'npcSessionExited'> = (
  message: NpcSessionExitedMessage,
  context,
) => {
  context.setOpenTabs((prev) =>
    prev.map((tab) =>
      tab.kind === 'npc-test' && tab.conversationId === message.sessionId && tab.npcSession
        ? {
            ...tab,
            npcSession: { ...tab.npcSession, status: 'exited' },
          }
        : tab,
    ),
  );
};

export const npcSessionHandlers: HandlerRegistration[] = [
  defineHandler('npcSessionStarted', handleNpcSessionStarted),
  defineHandler('npcSessionExited', handleNpcSessionExited),
];
