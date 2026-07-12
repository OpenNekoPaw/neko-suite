import { constants as fsConstants } from 'node:fs';
import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import {
  createJsonFileWriteMetadata,
  parseJsonFileWriteMetadata,
} from '../workspace/json-file-write-guard';
import { requirePersistedTaskRunScope } from '../runtime/persisted-child-run-ownership';

export type TaskStorageMigrationFailureReason =
  | 'invalid-document'
  | 'invalid-record'
  | 'owner-missing'
  | 'owner-incomplete'
  | 'owner-mismatch'
  | 'source-changed';

export class TaskStorageMigrationError extends Error {
  override readonly name = 'TaskStorageMigrationError';
  readonly code = 'agent-task-storage-migration-unsafe';

  constructor(
    readonly reason: TaskStorageMigrationFailureReason,
    message: string,
    readonly recordIndex?: number,
  ) {
    super(message);
  }
}

export interface LegacyTaskStorageContentMigrationInput {
  readonly content: string;
  readonly source: string;
  readonly writerId: string;
  readonly now: number;
}

export interface LegacyTaskStorageContentMigrationResult {
  readonly content: string;
  readonly migratedCount: number;
}

export interface LegacyTaskStorageFileMigrationOptions {
  readonly filePath: string;
  readonly writerId?: string;
  readonly now?: () => number;
}

export interface LegacyTaskStorageFileMigrationResult {
  readonly filePath: string;
  readonly backupPath: string;
  readonly migratedCount: number;
}

interface LegacyTaskOwnerIdentity {
  readonly conversationId: string;
  readonly runId: string;
  readonly runStartedAt: number;
}

interface ParsedTaskStorageDocument {
  readonly root: Record<string, unknown>;
  readonly tasks: readonly unknown[];
  readonly revision: number;
}

export function migrateLegacyTaskStorageContent(
  input: LegacyTaskStorageContentMigrationInput,
): LegacyTaskStorageContentMigrationResult {
  const document = parseTaskStorageDocument(input.content, input.source);
  let migratedCount = 0;
  const tasks = document.tasks.map((value, recordIndex) => {
    if (!isRecord(value) || typeof value['id'] !== 'string') {
      throw migrationError('invalid-record', input.source, recordIndex, 'task record is invalid');
    }
    if (value['scope'] !== undefined) {
      requirePersistedTaskRunScope({
        value: value['scope'],
        recordKind: 'task',
        source: input.source,
        recordIndex,
        localId: value['id'],
      });
      return value;
    }

    const owner = resolveLegacyTaskOwner(value, input.source, recordIndex);
    migratedCount += 1;
    return {
      ...value,
      scope: {
        conversationId: owner.conversationId,
        runId: owner.runId,
        parentRunId: owner.runId,
        childRunId: value['id'],
        childKind: 'task',
      },
    };
  });

  if (migratedCount === 0) {
    return { content: input.content, migratedCount: 0 };
  }

  const writeMetadata = createJsonFileWriteMetadata(
    input.writerId,
    document.revision,
    () => input.now,
  );
  return {
    content: JSON.stringify(
      {
        ...document.root,
        version: 1,
        writeMetadata,
        tasks,
      },
      null,
      2,
    ),
    migratedCount,
  };
}

export async function migrateLegacyTaskStorageFile(
  options: LegacyTaskStorageFileMigrationOptions,
): Promise<LegacyTaskStorageFileMigrationResult> {
  const now = options.now ?? (() => Date.now());
  const migrationTimestamp = now();
  const writerId = options.writerId ?? 'task-storage-ownership-migration';
  const original = await readFile(options.filePath, 'utf8');
  const migration = migrateLegacyTaskStorageContent({
    content: original,
    source: `file:${options.filePath}`,
    writerId,
    now: migrationTimestamp,
  });
  if (migration.migratedCount === 0) {
    throw new TaskStorageMigrationError(
      'invalid-document',
      `Task storage migration found no legacy records in ${options.filePath}.`,
    );
  }

  const backupPath = `${options.filePath}.backup-${migrationTimestamp}`;
  const temporaryPath = `${options.filePath}.migration-${process.pid}-${migrationTimestamp}.tmp`;
  await assertSourceUnchanged(options.filePath, original);
  await copyFile(options.filePath, backupPath, fsConstants.COPYFILE_EXCL);

  try {
    await writeFile(temporaryPath, migration.content, { encoding: 'utf8', flag: 'wx' });
    await assertSourceUnchanged(options.filePath, original);
    await rename(temporaryPath, options.filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return { filePath: options.filePath, backupPath, migratedCount: migration.migratedCount };
}

function parseTaskStorageDocument(content: string, source: string): ParsedTaskStorageDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new TaskStorageMigrationError(
      'invalid-document',
      `${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (Array.isArray(parsed)) {
    return { root: {}, tasks: parsed, revision: 0 };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['tasks'])) {
    throw new TaskStorageMigrationError(
      'invalid-document',
      `${source} does not contain a task array.`,
    );
  }
  return {
    root: parsed,
    tasks: parsed['tasks'],
    revision: parseJsonFileWriteMetadata(parsed)?.revision ?? 0,
  };
}

function resolveLegacyTaskOwner(
  task: Record<string, unknown>,
  source: string,
  recordIndex: number,
): LegacyTaskOwnerIdentity {
  const candidates: LegacyTaskOwnerIdentity[] = [];
  collectLifecycleOwner(
    candidates,
    readNestedRecord(task, ['input', 'lifecycle']),
    source,
    recordIndex,
  );
  collectLifecycleOwner(candidates, readNestedRecord(task, ['lifecycle']), source, recordIndex);
  collectRequestOwner(
    candidates,
    readNestedRecord(task, ['input', 'payload', 'request', 'metadata']),
    source,
    recordIndex,
  );
  if (candidates.length < 2) {
    throw migrationError(
      'owner-missing',
      source,
      recordIndex,
      'at least two complete owner replicas are required',
    );
  }
  const owner = candidates[0];
  if (!owner) {
    throw migrationError('owner-missing', source, recordIndex, 'owner replicas are missing');
  }
  if (candidates.some((candidate) => !sameOwner(candidate, owner))) {
    throw migrationError('owner-mismatch', source, recordIndex, 'owner replicas disagree');
  }
  return owner;
}

function collectLifecycleOwner(
  candidates: LegacyTaskOwnerIdentity[],
  value: Record<string, unknown> | undefined,
  source: string,
  recordIndex: number,
): void {
  if (!value) return;
  const conversationId = value['ownerConversationId'];
  const runId = value['ownerRunId'];
  const runStartedAt = value['ownerRunStartedAt'];
  candidates.push(
    requireOwnerIdentity({ conversationId, runId, runStartedAt }, source, recordIndex),
  );
}

function collectRequestOwner(
  candidates: LegacyTaskOwnerIdentity[],
  value: Record<string, unknown> | undefined,
  source: string,
  recordIndex: number,
): void {
  if (!value) return;
  candidates.push(
    requireOwnerIdentity(
      {
        conversationId: value['conversationId'],
        runId: value['runId'],
        runStartedAt: value['runStartedAt'],
      },
      source,
      recordIndex,
    ),
  );
}

function requireOwnerIdentity(
  value: Record<string, unknown>,
  source: string,
  recordIndex: number,
): LegacyTaskOwnerIdentity {
  if (
    typeof value['conversationId'] !== 'string' ||
    value['conversationId'].trim().length === 0 ||
    typeof value['runId'] !== 'string' ||
    value['runId'].trim().length === 0 ||
    typeof value['runStartedAt'] !== 'number' ||
    !Number.isFinite(value['runStartedAt'])
  ) {
    throw migrationError('owner-incomplete', source, recordIndex, 'owner replica is incomplete');
  }
  return {
    conversationId: value['conversationId'],
    runId: value['runId'],
    runStartedAt: value['runStartedAt'],
  };
}

function readNestedRecord(
  value: Record<string, unknown>,
  path: readonly string[],
): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return isRecord(current) ? current : undefined;
}

function sameOwner(left: LegacyTaskOwnerIdentity, right: LegacyTaskOwnerIdentity): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.runId === right.runId &&
    left.runStartedAt === right.runStartedAt
  );
}

async function assertSourceUnchanged(filePath: string, expected: string): Promise<void> {
  if ((await readFile(filePath, 'utf8')) !== expected) {
    throw new TaskStorageMigrationError(
      'source-changed',
      `Task storage changed while migration was running: ${filePath}`,
    );
  }
}

function migrationError(
  reason: TaskStorageMigrationFailureReason,
  source: string,
  recordIndex: number,
  detail: string,
): TaskStorageMigrationError {
  return new TaskStorageMigrationError(
    reason,
    `Cannot migrate persisted task ownership at ${source}[${recordIndex}]: ${detail}.`,
    recordIndex,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
