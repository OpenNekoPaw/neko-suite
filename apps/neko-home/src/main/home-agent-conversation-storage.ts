import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Message, OpenTab, PromptMode, TabState } from '@neko-agent/types';
import type {
  HomeAgentConversationRuntimeStorage,
  HomeAgentConversationRuntimeStorageSnapshot,
} from './home-agent-webview-host';

const STORAGE_VERSION = 1;

export interface HomeAgentConversationFileStorageOptions {
  readonly workspaceRoot: string;
}

export function createHomeAgentConversationFileStorage(
  options: HomeAgentConversationFileStorageOptions,
): HomeAgentConversationRuntimeStorage {
  return new HomeAgentConversationFileStorage(
    join(options.workspaceRoot, '.neko', 'home-agent', 'conversations.json'),
    [join(options.workspaceRoot, '.neko', 'desktop-agent', 'conversations.json')],
  );
}

export class HomeAgentConversationFileStorage
  implements HomeAgentConversationRuntimeStorage
{
  constructor(
    private readonly filePath: string,
    private readonly migrationSourcePaths: readonly string[] = [],
  ) {}

  load(): HomeAgentConversationRuntimeStorageSnapshot | undefined {
    if (existsSync(this.filePath)) {
      return readStorageSnapshot(this.filePath);
    }

    const migrationSourcePath = this.migrationSourcePaths.find((path) => existsSync(path));
    if (!migrationSourcePath) return undefined;

    const snapshot = readStorageSnapshot(migrationSourcePath);
    this.save(snapshot);
    return snapshot;
  }

  save(snapshot: HomeAgentConversationRuntimeStorageSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      renameSync(temporaryPath, this.filePath);
    } catch (error: unknown) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  }
}

function readStorageSnapshot(filePath: string): HomeAgentConversationRuntimeStorageSnapshot {
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
  return parseStorageSnapshot(parsed, filePath);
}

function parseStorageSnapshot(
  value: unknown,
  filePath: string,
): HomeAgentConversationRuntimeStorageSnapshot {
  if (!isRecord(value)) {
    throw new Error(`Home Agent conversation store must be an object: ${filePath}`);
  }
  if (value['version'] !== STORAGE_VERSION) {
    throw new Error(
      `Unsupported Home Agent conversation store version in ${filePath}: ${String(value['version'])}`,
    );
  }
  const conversations = parseConversations(value['conversations'], filePath);
  const promptModes = parsePromptModes(value['promptModes'], filePath);
  const messageQueueSnapshotVersions = parseMessageQueueSnapshotVersions(
    value['messageQueueSnapshotVersions'],
    filePath,
  );
  const tabState = parseTabState(value['tabState'], filePath);
  const nextConversationOrdinal = requirePositiveInteger(
    value['nextConversationOrdinal'],
    `Home Agent conversation store has invalid nextConversationOrdinal: ${filePath}`,
  );
  const activeConversationId = optionalNonEmptyString(
    value['activeConversationId'],
    `Home Agent conversation store has invalid activeConversationId: ${filePath}`,
  );
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  if (activeConversationId && !conversationIds.has(activeConversationId)) {
    throw new Error(
      `Home Agent conversation store activeConversationId does not identify a conversation: ${filePath}`,
    );
  }
  for (const tab of tabState.openTabs) {
    if (!conversationIds.has(tab.conversationId)) {
      throw new Error(
        `Home Agent conversation store tab '${tab.id}' identifies an unknown conversation: ${filePath}`,
      );
    }
  }

  return {
    version: STORAGE_VERSION,
    conversations,
    promptModes,
    messageQueueSnapshotVersions,
    tabState,
    nextConversationOrdinal,
    ...(activeConversationId ? { activeConversationId } : {}),
  };
}

function parseConversations(
  value: unknown,
  filePath: string,
): HomeAgentConversationRuntimeStorageSnapshot['conversations'] {
  if (!Array.isArray(value)) {
    throw new Error(`Home Agent conversation store is missing conversations: ${filePath}`);
  }
  const conversations = value.map((item, index) => parseConversation(item, index, filePath));
  const conversationIds = new Set<string>();
  for (const conversation of conversations) {
    if (conversationIds.has(conversation.id)) {
      throw new Error(
        `Home Agent conversation store contains duplicate conversation '${conversation.id}': ${filePath}`,
      );
    }
    conversationIds.add(conversation.id);
  }
  return conversations;
}

function parseConversation(
  value: unknown,
  index: number,
  filePath: string,
): HomeAgentConversationRuntimeStorageSnapshot['conversations'][number] {
  if (!isRecord(value)) {
    throw new Error(`Home Agent conversation ${index} must be an object: ${filePath}`);
  }
  const messages = value['messages'];
  if (!Array.isArray(messages) || !messages.every(isStoredMessage)) {
    throw new Error(`Home Agent conversation ${index} has invalid messages: ${filePath}`);
  }
  return {
    id: requireNonEmptyString(
      value['id'],
      `Home Agent conversation ${index} has invalid id: ${filePath}`,
    ),
    title: requireString(
      value['title'],
      `Home Agent conversation ${index} has invalid title: ${filePath}`,
    ),
    messages,
    updatedAt: requireNonNegativeNumber(
      value['updatedAt'],
      `Home Agent conversation ${index} has invalid updatedAt: ${filePath}`,
    ),
    nextMessageOrdinal: requirePositiveInteger(
      value['nextMessageOrdinal'],
      `Home Agent conversation ${index} has invalid nextMessageOrdinal: ${filePath}`,
    ),
  };
}

function parsePromptModes(
  value: unknown,
  filePath: string,
): HomeAgentConversationRuntimeStorageSnapshot['promptModes'] {
  if (!Array.isArray(value)) {
    throw new Error(`Home Agent conversation store is missing promptModes: ${filePath}`);
  }
  return value.map((item, index) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== 'string' ||
      item[0].trim().length === 0 ||
      !isPromptMode(item[1])
    ) {
      throw new Error(`Home Agent prompt mode ${index} is invalid: ${filePath}`);
    }
    return createPromptModeEntry(item[0], item[1]);
  });
}

function createPromptModeEntry(
  conversationId: string,
  mode: PromptMode,
): readonly [string, PromptMode] {
  return [conversationId, mode];
}

function parseMessageQueueSnapshotVersions(
  value: unknown,
  filePath: string,
): HomeAgentConversationRuntimeStorageSnapshot['messageQueueSnapshotVersions'] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Home Agent conversation store is missing messageQueueSnapshotVersions: ${filePath}`,
    );
  }
  return value.map((item, index) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== 'string' ||
      item[0].trim().length === 0 ||
      !Number.isInteger(item[1]) ||
      typeof item[1] !== 'number' ||
      item[1] < 0
    ) {
      throw new Error(`Home Agent message queue version ${index} is invalid: ${filePath}`);
    }
    return createMessageQueueVersionEntry(item[0], item[1]);
  });
}

function createMessageQueueVersionEntry(
  conversationId: string,
  version: number,
): readonly [string, number] {
  return [conversationId, version];
}

function parseTabState(value: unknown, filePath: string): TabState {
  if (!isRecord(value) || !Array.isArray(value['openTabs'])) {
    throw new Error(`Home Agent conversation store is missing tabState: ${filePath}`);
  }
  const openTabs = value['openTabs'];
  if (!openTabs.every(isStoredOpenTab)) {
    throw new Error(`Home Agent conversation store has invalid openTabs: ${filePath}`);
  }
  const activeTabId = value['activeTabId'];
  if (activeTabId !== null && (typeof activeTabId !== 'string' || activeTabId.length === 0)) {
    throw new Error(`Home Agent conversation store has invalid activeTabId: ${filePath}`);
  }
  if (activeTabId && !openTabs.some((tab) => tab.id === activeTabId)) {
    throw new Error(
      `Home Agent conversation store activeTabId does not identify an open tab: ${filePath}`,
    );
  }
  return { openTabs, activeTabId };
}

function isStoredMessage(value: unknown): value is Message {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value['id']) ||
    (value['role'] !== 'user' && value['role'] !== 'assistant' && value['role'] !== 'system') ||
    typeof value['content'] !== 'string' ||
    !isNonNegativeNumber(value['timestamp'])
  ) {
    return false;
  }
  return (
    isOptionalBoolean(value['isStreaming']) &&
    isOptionalArray(value['attachments'], isStoredMessageAttachment) &&
    isOptionalArray(value['contextReferences'], isStoredContextReference) &&
    isOptionalArray(value['workItemIds'], isNonEmptyString) &&
    (value['feedback'] === undefined ||
      value['feedback'] === 'positive' ||
      value['feedback'] === 'negative') &&
    isOptionalNonNegativeNumber(value['editedAt']) &&
    isOptionalString(value['originalContent']) &&
    isOptionalBoolean(value['isCancelled']) &&
    isOptionalBoolean(value['isError']) &&
    isOptionalBoolean(value['isQueued']) &&
    isOptionalArray(value['contentBlocks'], isStoredContentBlock)
  );
}

function isStoredMessageAttachment(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['name']) &&
    (value['type'] === 'file' ||
      value['type'] === 'image' ||
      value['type'] === 'video' ||
      value['type'] === 'audio') &&
    isOptionalString(value['path']) &&
    isOptionalNonNegativeNumber(value['size']) &&
    isOptionalString(value['preview'])
  );
}

function isStoredContextReference(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['type']) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['label']) &&
    isOptionalString(value['summary']) &&
    isOptionalString(value['thumbnailUri']) &&
    isOptionalString(value['mediaType']) &&
    (value['navigationData'] === undefined || isStringRecord(value['navigationData']))
  );
}

function isStoredContentBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    (value['type'] === 'thinking' ||
      value['type'] === 'text' ||
      value['type'] === 'tool_call' ||
      value['type'] === 'code_diff' ||
      value['type'] === 'plan' ||
      value['type'] === 'composite' ||
      value['type'] === 'canvas_lifecycle') &&
    isNonNegativeNumber(value['timestamp']) &&
    isOptionalString(value['thinking']) &&
    isOptionalBoolean(value['isThinkingComplete']) &&
    isOptionalString(value['content']) &&
    isOptionalBoolean(value['isStreaming']) &&
    isOptionalRecord(value['toolCall']) &&
    isOptionalRecord(value['codeDiff']) &&
    isOptionalRecord(value['plan']) &&
    isOptionalRecord(value['composite']) &&
    isOptionalRecord(value['compositeSource']) &&
    isOptionalRecord(value['canvasLifecycle'])
  );
}

function isStoredOpenTab(value: unknown): value is OpenTab {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['id']) &&
    typeof value['title'] === 'string' &&
    isNonEmptyString(value['conversationId']) &&
    (value['kind'] === undefined ||
      value['kind'] === 'chat' ||
      value['kind'] === 'character-dialogue' ||
      value['kind'] === 'embody-character') &&
    isOptionalRecord(value['characterDialogueSession']) &&
    isOptionalRecord(value['embodyCharacterSession'])
  );
}

function isPromptMode(value: unknown): value is PromptMode {
  return value === 'default' || value === 'plan';
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new Error(message);
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (!isNonEmptyString(value)) throw new Error(message);
  return value;
}

function optionalNonEmptyString(value: unknown, message: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, message);
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(message);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, message: string): number {
  if (!isNonNegativeNumber(value)) throw new Error(message);
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return value === undefined || isNonNegativeNumber(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function isOptionalArray(
  value: unknown,
  predicate: (item: unknown) => boolean,
): boolean {
  return value === undefined || (Array.isArray(value) && value.every(predicate));
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
