import { createConversationId, isCanonicalConversationId } from '@neko/agent';
import type { ConversationIdOptions } from '@neko/agent';

const PATH_SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function createTuiConversationId(
  workDir: string,
  options: ConversationIdOptions = {},
): string {
  return createConversationId(workDir, options);
}

export function isPathSafeCliConversationId(value: string): boolean {
  return PATH_SAFE_ID_PATTERN.test(value);
}

export function isCanonicalTuiConversationId(value: string): boolean {
  return isCanonicalConversationId(value);
}

export function assertCanonicalTuiConversationId(value: string): string {
  const conversationId = value.trim();
  if (!isCanonicalTuiConversationId(conversationId)) {
    throw new Error(
      `TUI resume conversation id must be canonical; received "${value}". Start a new TUI conversation or choose a canonical workspace conversation id.`,
    );
  }
  return conversationId;
}
