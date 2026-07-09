import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  DesktopAgentConversationRuntimeStorage,
  DesktopAgentConversationRuntimeStorageSnapshot,
} from './agent-webview-host';

const STORAGE_VERSION = 1;

export interface DesktopAgentConversationFileStorageOptions {
  readonly workspaceRoot: string;
}

export function createDesktopAgentConversationFileStorage(
  options: DesktopAgentConversationFileStorageOptions,
): DesktopAgentConversationRuntimeStorage {
  return new DesktopAgentConversationFileStorage(
    join(options.workspaceRoot, '.neko', 'desktop-agent', 'conversations.json'),
  );
}

export class DesktopAgentConversationFileStorage
  implements DesktopAgentConversationRuntimeStorage
{
  constructor(private readonly filePath: string) {}

  load(): DesktopAgentConversationRuntimeStorageSnapshot | undefined {
    if (!existsSync(this.filePath)) {
      return undefined;
    }
    const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as unknown;
    return parseStorageSnapshot(parsed, this.filePath);
  }

  save(snapshot: DesktopAgentConversationRuntimeStorageSnapshot): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  }
}

function parseStorageSnapshot(
  value: unknown,
  filePath: string,
): DesktopAgentConversationRuntimeStorageSnapshot {
  if (!isRecord(value)) {
    throw new Error(`Desktop Agent conversation store must be an object: ${filePath}`);
  }
  if (value['version'] !== STORAGE_VERSION) {
    throw new Error(
      `Unsupported Desktop Agent conversation store version in ${filePath}: ${String(value['version'])}`,
    );
  }
  if (!Array.isArray(value['conversations'])) {
    throw new Error(`Desktop Agent conversation store is missing conversations: ${filePath}`);
  }
  if (!Array.isArray(value['promptModes'])) {
    throw new Error(`Desktop Agent conversation store is missing promptModes: ${filePath}`);
  }
  if (!Array.isArray(value['messageQueueSnapshotVersions'])) {
    throw new Error(
      `Desktop Agent conversation store is missing messageQueueSnapshotVersions: ${filePath}`,
    );
  }
  const tabState = value['tabState'];
  if (!isRecord(tabState) || !Array.isArray(tabState['openTabs'])) {
    throw new Error(`Desktop Agent conversation store is missing tabState: ${filePath}`);
  }
  const nextConversationOrdinal = value['nextConversationOrdinal'];
  if (typeof nextConversationOrdinal !== 'number' || nextConversationOrdinal < 1) {
    throw new Error(
      `Desktop Agent conversation store has invalid nextConversationOrdinal: ${filePath}`,
    );
  }

  return value as unknown as DesktopAgentConversationRuntimeStorageSnapshot;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
