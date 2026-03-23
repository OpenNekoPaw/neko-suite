/**
 * Conversation Record - Shared resume layer format
 *
 * Both Extension (Webview) and TUI/CLI write to this format.
 * Stored at ~/.neko/conversations/<workDir-hash>.json
 * Contains only ChatMessage[] (LLM API format), no display-layer data.
 */

import type { ChatMessage } from '@neko/shared';

/**
 * A single persisted conversation record.
 * This is the minimal set needed to resume a session via session.loadHistory().
 */
export interface ConversationRecord {
  id: string;
  version: 1;
  title: string;
  workDir: string;
  /** LLM API messages — sufficient to call session.loadHistory() */
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  source: 'extension' | 'tui';
  /** Optional: last-used media model selection for this conversation */
  mediaModelSelection?: {
    image?: string;
    video?: string;
    audio?: string;
    music?: string;
  };
}

/**
 * The on-disk JSON structure for a single workDir's conversation file.
 * All records for one workDir are stored in one file.
 */
export interface ConversationIndex {
  records: ConversationRecord[];
}
