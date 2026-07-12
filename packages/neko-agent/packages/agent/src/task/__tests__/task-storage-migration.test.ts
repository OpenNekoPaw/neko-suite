import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  migrateLegacyTaskStorageContent,
  migrateLegacyTaskStorageFile,
  TaskStorageMigrationError,
} from '../task-storage-migration';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('task storage ownership migration', () => {
  it('adds canonical direct-task scope only when every owner copy agrees', () => {
    const document = legacyDocument();
    const result = migrateLegacyTaskStorageContent({
      content: JSON.stringify(document),
      source: 'fixture:tasks.json',
      writerId: 'migration-test',
      now: 200,
    });
    const migrated = parseDocument(result.content);
    const task = firstTask(migrated);

    expect(result.migratedCount).toBe(1);
    expect(task?.scope).toEqual({
      conversationId: 'conversation-1',
      runId: 'run-1',
      parentRunId: 'run-1',
      childRunId: 'task-1',
      childKind: 'task',
    });
    expect(task?.output).toEqual(document.tasks[0]?.output);
    expect(migrated['writeMetadata']).toEqual({
      ownerId: 'migration-test',
      revision: 8,
      updatedAt: 200,
    });
  });

  it('rejects conflicting replicated owners without producing migrated content', () => {
    const document = legacyDocument();
    const task = document.tasks[0];
    if (!task) throw new Error('Missing task fixture');
    task.lifecycle.ownerRunId = 'run-conflict';

    expect(() =>
      migrateLegacyTaskStorageContent({
        content: JSON.stringify(document),
        source: 'fixture:tasks.json',
        writerId: 'migration-test',
        now: 200,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'agent-task-storage-migration-unsafe',
        reason: 'owner-mismatch',
        recordIndex: 0,
      }),
    );
  });

  it('atomically replaces the source and retains an exact backup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-task-migration-'));
    tempRoots.push(root);
    const filePath = join(root, 'tasks.json');
    const original = JSON.stringify(legacyDocument(), null, 2);
    await writeFile(filePath, original, 'utf8');

    const result = await migrateLegacyTaskStorageFile({
      filePath,
      writerId: 'migration-test',
      now: () => 200,
    });

    expect(result.migratedCount).toBe(1);
    expect(await readFile(result.backupPath, 'utf8')).toBe(original);
    expect(firstTask(parseDocument(await readFile(filePath, 'utf8')))['scope']).toEqual(
      expect.objectContaining({ childRunId: 'task-1', childKind: 'task' }),
    );
  });

  it('exposes typed migration errors', () => {
    expect(() =>
      migrateLegacyTaskStorageContent({
        content: JSON.stringify({ version: 1, tasks: [{}] }),
        source: 'fixture:tasks.json',
        writerId: 'migration-test',
        now: 200,
      }),
    ).toThrow(TaskStorageMigrationError);
  });
});

interface TestTaskRecord {
  id: string;
  input: {
    lifecycle: Record<string, unknown>;
    payload: { request: { metadata: Record<string, unknown> } };
  };
  lifecycle: Record<string, unknown>;
  output: unknown;
  scope?: unknown;
  [key: string]: unknown;
}

interface TestTaskDocument {
  version: number;
  writeMetadata: { ownerId: string; revision: number; updatedAt: number };
  tasks: TestTaskRecord[];
}

function legacyDocument(): TestTaskDocument {
  const owner = {
    ownerConversationId: 'conversation-1',
    ownerRunId: 'run-1',
    ownerRunStartedAt: 100,
  };
  return {
    version: 1,
    writeMetadata: { ownerId: 'old-writer', revision: 7, updatedAt: 100 },
    tasks: [
      {
        id: 'task-1',
        type: 'image_generation',
        status: 'completed',
        input: {
          lifecycle: { ...owner },
          payload: {
            request: {
              metadata: {
                conversationId: 'conversation-1',
                runId: 'run-1',
                runStartedAt: 100,
              },
            },
          },
        },
        lifecycle: { ...owner },
        progress: 100,
        createdAt: 100,
        updatedAt: 110,
        output: { data: { base64: 'preserve-me' } },
      },
    ],
  };
}

function parseDocument(content: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed) || !Array.isArray(parsed['tasks']) || !isRecord(parsed['writeMetadata'])) {
    throw new Error('Invalid migrated test document');
  }
  return parsed;
}

function firstTask(document: Record<string, unknown>): Record<string, unknown> {
  const tasks = document['tasks'];
  const task = Array.isArray(tasks) ? tasks[0] : undefined;
  if (!isRecord(task)) throw new Error('Missing migrated test task');
  return task;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
