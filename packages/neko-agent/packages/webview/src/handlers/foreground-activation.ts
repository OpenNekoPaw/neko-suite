import type { PendingForegroundConversationActivation } from './types';

export function shouldActivateForegroundConversation(
  pending: PendingForegroundConversationActivation | null | undefined,
  conversationId: string | undefined,
): boolean {
  if (!pending || !conversationId) return false;

  switch (pending.reason) {
    case 'switch-conversation':
      return pending.conversationId === conversationId;
    case 'new-conversation':
      return !pending.previousConversationIds.includes(conversationId);
  }
}
