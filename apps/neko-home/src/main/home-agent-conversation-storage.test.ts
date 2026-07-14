import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HomeAgentConversationRuntimeStorageSnapshot } from './home-agent-webview-host';
import { createHomeAgentConversationFileStorage } from './home-agent-conversation-storage';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Home Agent conversation file storage', () => {
  it('migrates the supported Desktop store to Home without deleting the source', () => {
    const workspaceRoot = createTemporaryWorkspace();
    const sourcePath = join(
      workspaceRoot,
      '.neko',
      'desktop-agent',
      'conversations.json',
    );
    const targetPath = join(workspaceRoot, '.neko', 'home-agent', 'conversations.json');
    const snapshot = createSnapshot();
    writeJson(sourcePath, snapshot);

    const storage = createHomeAgentConversationFileStorage({ workspaceRoot });

    expect(storage.load()).toEqual(snapshot);
    expect(existsSync(sourcePath)).toBe(true);
    expect(JSON.parse(readFileSync(targetPath, 'utf-8'))).toEqual(snapshot);
  });

  it('uses the canonical Home store when both Home and Desktop stores exist', () => {
    const workspaceRoot = createTemporaryWorkspace();
    const sourcePath = join(
      workspaceRoot,
      '.neko',
      'desktop-agent',
      'conversations.json',
    );
    const targetPath = join(workspaceRoot, '.neko', 'home-agent', 'conversations.json');
    writeJson(sourcePath, createSnapshot('desktop-conversation-1'));
    writeJson(targetPath, createSnapshot('home-conversation-1'));

    expect(createHomeAgentConversationFileStorage({ workspaceRoot }).load()).toMatchObject({
      conversations: [{ id: 'home-conversation-1' }],
    });
  });

  it('rejects unsupported versions and malformed nested messages visibly', () => {
    const workspaceRoot = createTemporaryWorkspace();
    const targetPath = join(workspaceRoot, '.neko', 'home-agent', 'conversations.json');
    const storage = createHomeAgentConversationFileStorage({ workspaceRoot });
    writeJson(targetPath, { ...createSnapshot(), version: 2 });

    expect(() => storage.load()).toThrow('Unsupported Home Agent conversation store version');

    writeJson(targetPath, {
      ...createSnapshot(),
      conversations: [
        {
          ...createSnapshot().conversations[0],
          messages: [
            {
              id: 'message-1',
              role: 'user',
              content: 'hello',
              timestamp: 1,
              contentBlocks: [{ id: 'block-1', type: 'unknown', timestamp: 1 }],
            },
          ],
        },
      ],
    });
    expect(() => storage.load()).toThrow('invalid messages');
  });
});

function createTemporaryWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'neko-home-storage-'));
  temporaryRoots.push(root);
  return root;
}

function createSnapshot(
  conversationId = 'desktop-conversation-1',
): HomeAgentConversationRuntimeStorageSnapshot {
  return {
    version: 1,
    conversations: [
      {
        id: conversationId,
        title: 'Conversation 1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'hello',
            timestamp: 1,
          },
        ],
        updatedAt: 1,
        nextMessageOrdinal: 2,
      },
    ],
    promptModes: [[conversationId, 'default']],
    messageQueueSnapshotVersions: [[conversationId, 1]],
    tabState: {
      openTabs: [
        {
          id: conversationId,
          title: 'Conversation 1',
          conversationId,
          kind: 'chat',
        },
      ],
      activeTabId: conversationId,
    },
    nextConversationOrdinal: 2,
    activeConversationId: conversationId,
  };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}
