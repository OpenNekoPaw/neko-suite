/**
 * Conversation Record - Shared resume layer format
 *
 * Both Extension (Webview) and TUI/CLI can surface this format.
 * Journal + conversations-index.json is the source of truth.
 */

import type { ChatMessage } from '@neko/shared';

export type ConversationSource = 'extension' | 'tui' | 'journal-projection';

export interface ConversationMediaModelSelection {
  image?: string;
  video?: string;
  audio?: string;
  music?: string;
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
}

/**
 * Meta record stored in ~/.neko/conversations-index.json.
 * Contains routing and list metadata only; message history stays in Journal.
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
 * Global conversations index file.
 * Tracks workDir-to-conversation routing plus per-conversation metadata.
 */
export interface ConversationsIndexFile {
  version: 1;
  workspaces: Record<string, string[]>;
  conversations: Record<string, ConversationIndexMeta>;
}
