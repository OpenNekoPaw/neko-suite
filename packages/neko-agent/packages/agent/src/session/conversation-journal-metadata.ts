import { isWorkspaceId } from '@neko/shared';
import type { ConversationMediaModelSelection } from './conversation-record';

export type ConversationJournalSource = 'vscode' | 'tui' | 'agent' | 'import';

export interface ConversationJournalChatModelSelection {
  readonly providerId: string;
  readonly modelId: string;
}

export interface ConversationJournalModelSelection {
  readonly chat: ConversationJournalChatModelSelection | null;
  readonly media: ConversationMediaModelSelection | null;
}

export type ConversationJournalLifecycle =
  | { readonly state: 'active'; readonly deletedAt: null }
  | { readonly state: 'deleted'; readonly deletedAt: number };

export interface ConversationJournalMetadata {
  readonly version: 1;
  readonly conversationId: string;
  readonly journalId: string;
  readonly workspaceId: string | null;
  readonly title: string;
  readonly source: ConversationJournalSource;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly messageCount: number;
  readonly modelSelection: ConversationJournalModelSelection;
  readonly tags: readonly string[];
  readonly lifecycle: ConversationJournalLifecycle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Conversation Journal metadata ${field} must be a non-empty string.`);
  }
  return value;
}

function parseSource(value: unknown): ConversationJournalSource {
  if (value === 'vscode' || value === 'tui' || value === 'agent' || value === 'import') {
    return value;
  }
  throw new Error(`Conversation Journal metadata source is unsupported: ${String(value)}.`);
}

function parseTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Conversation Journal metadata ${field} must be a non-negative timestamp.`);
  }
  return value;
}

function parseMediaModelSelection(value: unknown): ConversationMediaModelSelection | null {
  if (value === null) return null;
  if (!isRecord(value)) {
    throw new Error(
      'Conversation Journal metadata modelSelection.media must be an object or null.',
    );
  }
  const result: ConversationMediaModelSelection = {};
  for (const field of ['image', 'video', 'audio', 'music'] as const) {
    const modelId = value[field];
    if (modelId === undefined) continue;
    result[field] = requireNonEmptyString(modelId, `modelSelection.media.${field}`);
  }
  return result;
}

function parseModelSelection(value: unknown): ConversationJournalModelSelection {
  if (!isRecord(value)) {
    throw new Error('Conversation Journal metadata modelSelection must be an object.');
  }
  const chat = value['chat'];
  const parsedChat =
    chat === null
      ? null
      : isRecord(chat)
        ? {
            providerId: requireNonEmptyString(chat['providerId'], 'modelSelection.chat.providerId'),
            modelId: requireNonEmptyString(chat['modelId'], 'modelSelection.chat.modelId'),
          }
        : undefined;
  if (parsedChat === undefined) {
    throw new Error('Conversation Journal metadata modelSelection.chat must be an object or null.');
  }
  return {
    chat: parsedChat,
    media: parseMediaModelSelection(value['media']),
  };
}

function parseTags(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('Conversation Journal metadata tags must be an array.');
  }
  return value.map((tag, index) => requireNonEmptyString(tag, `tags[${index}]`));
}

function parseLifecycle(
  value: unknown,
  createdAt: number,
  updatedAt: number,
): ConversationJournalLifecycle {
  if (!isRecord(value)) {
    throw new Error('Conversation Journal metadata lifecycle must be an object.');
  }
  if (value['state'] === 'active') {
    if (value['deletedAt'] !== null) {
      throw new Error('Active Conversation Journal metadata deletedAt must be null.');
    }
    return { state: 'active', deletedAt: null };
  }
  if (value['state'] === 'deleted') {
    const deletedAt = parseTimestamp(value['deletedAt'], 'lifecycle.deletedAt');
    if (deletedAt < createdAt || deletedAt !== updatedAt) {
      throw new Error(
        'Deleted Conversation Journal metadata deletedAt must equal updatedAt and not precede createdAt.',
      );
    }
    return { state: 'deleted', deletedAt };
  }
  throw new Error(
    `Conversation Journal metadata lifecycle state is unsupported: ${String(value['state'])}.`,
  );
}

export function parseConversationJournalMetadata(value: unknown): ConversationJournalMetadata {
  if (!isRecord(value)) {
    throw new Error('Conversation Journal metadata must be an object.');
  }
  if (value['version'] !== 1) {
    throw new Error(
      `Unsupported Conversation Journal metadata version: ${String(value['version'])}.`,
    );
  }
  const workspaceId = value['workspaceId'];
  if (workspaceId !== null && !isWorkspaceId(workspaceId)) {
    throw new Error('Conversation Journal metadata workspaceId must be a UUID or null.');
  }
  const createdAt = parseTimestamp(value['createdAt'], 'createdAt');
  const updatedAt = parseTimestamp(value['updatedAt'], 'updatedAt');
  if (updatedAt < createdAt) {
    throw new Error('Conversation Journal metadata updatedAt cannot precede createdAt.');
  }
  const messageCount = value['messageCount'];
  if (typeof messageCount !== 'number' || !Number.isSafeInteger(messageCount) || messageCount < 0) {
    throw new Error('Conversation Journal metadata messageCount must be a non-negative integer.');
  }
  return {
    version: 1,
    conversationId: requireNonEmptyString(value['conversationId'], 'conversationId'),
    journalId: requireNonEmptyString(value['journalId'], 'journalId'),
    workspaceId,
    title: requireNonEmptyString(value['title'], 'title'),
    source: parseSource(value['source']),
    createdAt,
    updatedAt,
    messageCount,
    modelSelection: parseModelSelection(value['modelSelection']),
    tags: parseTags(value['tags']),
    lifecycle: parseLifecycle(value['lifecycle'], createdAt, updatedAt),
  };
}
