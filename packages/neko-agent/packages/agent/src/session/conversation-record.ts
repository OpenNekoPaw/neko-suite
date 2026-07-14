/**
 * Conversation Record - Shared resume layer format
 *
 * Both Extension (Webview) and TUI/CLI can surface this format.
 * Journal events are authoritative; SQLite provides the rebuildable resume projection.
 */

import type { ChatMessage } from '@neko/shared';

export type ConversationSource = 'extension' | 'tui' | 'journal-projection';

export interface ConversationMediaModelSelection {
  image?: string;
  video?: string;
  audio?: string;
  music?: string;
}

export interface ConversationChatModelSelection {
  providerId: string;
  modelId: string;
}

/**
 * A single persisted conversation record.
 * This is the minimal set needed to resume a session via session.loadHistory().
 */
export interface ConversationRecord {
  id: string;
  version: 1 | 2;
  title: string;
  workDir: string;
  /** LLM API messages — sufficient to call session.loadHistory() */
  messages: ChatMessage[];
  /** Optional journal provenance for each visible message (same order as `messages`) */
  messageEventIds?: string[][];
  createdAt: number;
  updatedAt: number;
  source: ConversationSource;
  /** Optional: last-used media model selection for this conversation */
  mediaModelSelection?: ConversationMediaModelSelection;
  /** Optional: last-used chat model selection for this conversation */
  chatModelSelection?: ConversationChatModelSelection;
  /** Optional catalog tags owned by the conversation metadata event. */
  tags?: string[];
}

/**
 * Legacy metadata shape accepted only by the explicit conversation catalog migration.
 */
export interface ConversationIndexMeta {
  conversationId: string;
  title: string;
  workDir: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  source: ConversationSource;
  mediaModelSelection?: ConversationMediaModelSelection;
  tags?: string[];
}

/**
 * Legacy global index shape accepted only by migration and recovery diagnostics.
 */
export interface ConversationsIndexFile {
  version: 1;
  writeMetadata?: {
    ownerId: string;
    revision: number;
    updatedAt: number;
  };
  workspaces: Record<string, string[]>;
  conversations: Record<string, ConversationIndexMeta>;
}
