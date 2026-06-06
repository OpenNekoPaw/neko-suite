import type {
  ArtifactKind,
  Draft,
  ExecutionPlan,
  IdcRunArtifactBinding,
  Task,
} from '@neko-agent/types';
import {
  createArtifactIndexStore,
  createNekoPaths,
  parseDraft,
  parseExecutionPlan,
  parseTask,
  serializeDraft,
  serializeExecutionPlan,
  serializeTask,
  type ArtifactIndexEntry,
  type IArtifactIndexStore,
  type INekoPaths,
} from '../workspace';
import { getLogger } from '../utils/logger';

const logger = getLogger('ArtifactService');

export interface ArtifactServiceFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
  readFile?(path: string, encoding: 'utf-8'): Promise<string>;
}

export interface ArtifactServiceConfig {
  readonly workspaceRoot: string;
  readonly fsOps: ArtifactServiceFsOps;
}

export interface ArtifactBinding<K extends ArtifactKind = ArtifactKind> {
  readonly kind: K;
  readonly runId: string;
  readonly artifactId: string;
  readonly path: string;
  readonly updatedAt: number;
}

export interface ArtifactRecord<K extends ArtifactKind = ArtifactKind> extends ArtifactBinding<K> {
  readonly content: ArtifactValueByKind[K];
  readonly value: ArtifactPayloadByKind[K];
}

export type AnyArtifactRecord =
  | ArtifactRecord<'draft'>
  | ArtifactRecord<'plan'>
  | ArtifactRecord<'task'>;

export interface ArtifactWriteInput<K extends ArtifactKind = ArtifactKind> {
  readonly kind: K;
  readonly runId: string;
  readonly value: ArtifactPayloadByKind[K];
}

export type AnyArtifactWriteInput =
  | ArtifactWriteInput<'draft'>
  | ArtifactWriteInput<'plan'>
  | ArtifactWriteInput<'task'>;

export interface ArtifactObservedInput<K extends ArtifactKind = ArtifactKind> {
  readonly kind: K;
  readonly runId: string;
  readonly path: string;
  readonly content: string;
}

export type AnyArtifactObservedInput =
  | ArtifactObservedInput<'draft'>
  | ArtifactObservedInput<'plan'>
  | ArtifactObservedInput<'task'>;

export interface IArtifactService {
  write(input: ArtifactWriteInput<'draft'>): Promise<ArtifactRecord<'draft'>>;
  write(input: ArtifactWriteInput<'plan'>): Promise<ArtifactRecord<'plan'>>;
  write(input: ArtifactWriteInput<'task'>): Promise<ArtifactRecord<'task'>>;
  writeDraft(runId: string, draft: Draft): Promise<ArtifactRecord<'draft'>>;
  writePlan(runId: string, plan: ExecutionPlan): Promise<ArtifactRecord<'plan'>>;
  writeTask(runId: string, task: Task): Promise<ArtifactRecord<'task'>>;
  ingestObservedArtifact(input: ArtifactObservedInput<'draft'>): ArtifactRecord<'draft'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'plan'>): ArtifactRecord<'plan'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'task'>): ArtifactRecord<'task'>;
  getByRunId(runId: string, kind: 'draft'): ArtifactRecord<'draft'> | null;
  getByRunId(runId: string, kind: 'plan'): ArtifactRecord<'plan'> | null;
  getByRunId(runId: string, kind: 'task'): ArtifactRecord<'task'> | null;
  listRunIds(): readonly string[];
  listByRunId(runId: string): readonly AnyArtifactRecord[];
  restore?(): Promise<readonly AnyArtifactRecord[]>;
  flush?(): Promise<void>;
  dispose?(): Promise<void>;
}

interface ArtifactPayloadByKind {
  draft: Draft;
  plan: ExecutionPlan;
  task: Task;
}

interface ArtifactValueByKind {
  draft: string;
  plan: string;
  task: string;
}

const ARTIFACT_ORDER: readonly ArtifactKind[] = ['draft', 'plan', 'task'];

class WorkspaceArtifactService implements IArtifactService {
  private readonly _paths: INekoPaths;
  private readonly _fsOps: ArtifactServiceFsOps;
  private readonly _indexStore: IArtifactIndexStore;
  private readonly _recordsByRun = new Map<string, Map<ArtifactKind, AnyArtifactRecord>>();

  constructor(config: ArtifactServiceConfig) {
    if (!config.workspaceRoot) {
      throw new Error('ArtifactService: workspaceRoot is required');
    }
    this._paths = createNekoPaths(config.workspaceRoot);
    this._fsOps = config.fsOps;
    this._indexStore = createArtifactIndexStore({
      filePath: this._paths.cache('artifactIndex'),
      fsOps: {
        mkdir: this._fsOps.mkdir,
        writeFile: this._fsOps.writeFile,
      },
    });
  }

  write(input: ArtifactWriteInput<'draft'>): Promise<ArtifactRecord<'draft'>>;
  write(input: ArtifactWriteInput<'plan'>): Promise<ArtifactRecord<'plan'>>;
  write(input: ArtifactWriteInput<'task'>): Promise<ArtifactRecord<'task'>>;
  async write(input: AnyArtifactWriteInput): Promise<AnyArtifactRecord> {
    switch (input.kind) {
      case 'draft': {
        const content = serializeDraft(input.value);
        const path = resolveArtifactPath(this._paths, 'draft', input.runId);
        await this._fsOps.mkdir(resolveArtifactDir(this._paths, 'draft'), { recursive: true });
        await this._fsOps.writeFile(path, content, 'utf-8');
        const record: ArtifactRecord<'draft'> = {
          kind: 'draft',
          runId: input.runId,
          artifactId: input.value.id,
          path,
          updatedAt: input.value.updatedAt,
          content,
          value: input.value,
        };
        this._remember(record);
        await this.flush();
        return record;
      }
      case 'plan': {
        const content = serializeExecutionPlan(input.value);
        const path = resolveArtifactPath(this._paths, 'plan', input.runId);
        await this._fsOps.mkdir(resolveArtifactDir(this._paths, 'plan'), { recursive: true });
        await this._fsOps.writeFile(path, content, 'utf-8');
        const record: ArtifactRecord<'plan'> = {
          kind: 'plan',
          runId: input.runId,
          artifactId: input.value.id,
          path,
          updatedAt: input.value.updatedAt,
          content,
          value: input.value,
        };
        this._remember(record);
        await this.flush();
        return record;
      }
      case 'task': {
        const content = serializeTask(input.value);
        const path = resolveArtifactPath(this._paths, 'task', input.runId);
        await this._fsOps.mkdir(resolveArtifactDir(this._paths, 'task'), { recursive: true });
        await this._fsOps.writeFile(path, content, 'utf-8');
        const record: ArtifactRecord<'task'> = {
          kind: 'task',
          runId: input.runId,
          artifactId: input.value.id,
          path,
          updatedAt: input.value.updatedAt,
          content,
          value: input.value,
        };
        this._remember(record);
        await this.flush();
        return record;
      }
    }

    throw new Error('Unsupported artifact kind');
  }

  writeDraft(runId: string, draft: Draft): Promise<ArtifactRecord<'draft'>> {
    return this.write({ kind: 'draft', runId, value: draft });
  }

  writePlan(runId: string, plan: ExecutionPlan): Promise<ArtifactRecord<'plan'>> {
    return this.write({ kind: 'plan', runId, value: plan });
  }

  writeTask(runId: string, task: Task): Promise<ArtifactRecord<'task'>> {
    return this.write({ kind: 'task', runId, value: task });
  }

  async restore(): Promise<readonly AnyArtifactRecord[]> {
    const readFile = this._fsOps.readFile;
    if (!readFile) {
      return [];
    }

    const entries = await readArtifactRestoreEntriesWithLegacyFallback(
      this._paths.cache('artifactIndex'),
      readFile,
    );
    if (!entries || entries.length === 0) {
      return [];
    }

    for (const entry of entries) {
      let content: string;
      try {
        content = await readFile(entry.path, 'utf-8');
      } catch (error) {
        logger.warn(`artifact restore read failed for ${entry.path}: ${String(error)}`);
        continue;
      }

      try {
        const record = this._recordFromObservedArtifact({
          kind: entry.kind,
          runId: entry.runId,
          path: entry.path,
          content,
        });
        this._remember(record, { writeIndex: false });
      } catch (error) {
        logger.warn(`artifact restore parse failed for ${entry.path}: ${String(error)}`);
      }
    }

    return this._listAllRecords();
  }

  ingestObservedArtifact(input: ArtifactObservedInput<'draft'>): ArtifactRecord<'draft'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'plan'>): ArtifactRecord<'plan'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'task'>): ArtifactRecord<'task'>;
  ingestObservedArtifact(input: AnyArtifactObservedInput): AnyArtifactRecord {
    const record = this._recordFromObservedArtifact(input);
    this._remember(record);
    return record;
  }

  private _recordFromObservedArtifact(input: AnyArtifactObservedInput): AnyArtifactRecord {
    switch (input.kind) {
      case 'draft': {
        const value = parseDraft(input.content);
        return {
          kind: 'draft',
          runId: input.runId,
          artifactId: value.id,
          path: input.path,
          updatedAt: value.updatedAt,
          content: input.content,
          value,
        };
      }
      case 'plan': {
        const value = parseExecutionPlan(input.content);
        return {
          kind: 'plan',
          runId: input.runId,
          artifactId: value.id,
          path: input.path,
          updatedAt: value.updatedAt,
          content: input.content,
          value,
        };
      }
      case 'task': {
        const value = parseTask(input.content);
        return {
          kind: 'task',
          runId: input.runId,
          artifactId: value.id,
          path: input.path,
          updatedAt: value.updatedAt,
          content: input.content,
          value,
        };
      }
    }

    throw new Error('Unsupported artifact kind');
  }

  getByRunId(runId: string, kind: 'draft'): ArtifactRecord<'draft'> | null;
  getByRunId(runId: string, kind: 'plan'): ArtifactRecord<'plan'> | null;
  getByRunId(runId: string, kind: 'task'): ArtifactRecord<'task'> | null;
  getByRunId(runId: string, kind: ArtifactKind): AnyArtifactRecord | null {
    const record = this._recordsByRun.get(runId)?.get(kind);
    if (!record || record.kind !== kind) {
      return null;
    }
    return record;
  }

  listRunIds(): readonly string[] {
    return Array.from(this._recordsByRun.keys()).sort((left, right) => left.localeCompare(right));
  }

  listByRunId(runId: string): readonly AnyArtifactRecord[] {
    const records = this._recordsByRun.get(runId);
    if (!records) {
      return [];
    }

    return ARTIFACT_ORDER.flatMap((kind) => {
      const record = records.get(kind);
      return record ? [record] : [];
    });
  }

  async flush(): Promise<void> {
    await this._indexStore.flush();
  }

  async dispose(): Promise<void> {
    await this._indexStore.dispose();
  }

  private _remember(record: AnyArtifactRecord, options?: { writeIndex?: boolean }): void {
    const existing =
      this._recordsByRun.get(record.runId) ?? new Map<ArtifactKind, AnyArtifactRecord>();
    existing.set(record.kind, record);
    this._recordsByRun.set(record.runId, existing);
    if (options?.writeIndex !== false) {
      this._indexStore.replace(this._listIndexEntries());
    }
  }

  private _listIndexEntries(): readonly ArtifactIndexEntry[] {
    return Array.from(this._recordsByRun.entries())
      .flatMap(([runId, records]) =>
        ARTIFACT_ORDER.flatMap((kind) => {
          const record = records.get(kind);
          return record ? [toArtifactIndexEntry(runId, record)] : [];
        }),
      )
      .sort(compareArtifactIndexEntries);
  }

  private _listAllRecords(): readonly AnyArtifactRecord[] {
    return this.listRunIds().flatMap((runId) => this.listByRunId(runId));
  }
}

export function createWorkspaceArtifactService(config: ArtifactServiceConfig): IArtifactService {
  return new WorkspaceArtifactService(config);
}

export function toIdcRunArtifactBinding(binding: ArtifactBinding): IdcRunArtifactBinding {
  return {
    kind: binding.kind,
    artifactId: binding.artifactId,
    path: binding.path,
    updatedAt: binding.updatedAt,
  };
}

function resolveArtifactDir(paths: INekoPaths, kind: ArtifactKind): string {
  switch (kind) {
    case 'draft':
      return paths.dir('drafts');
    case 'plan':
      return paths.dir('plans');
    case 'task':
      return paths.dir('tasks');
    default:
      throw new Error(`Unsupported artifact kind: ${String(kind)}`);
  }
}

function resolveArtifactPath(paths: INekoPaths, kind: ArtifactKind, runId: string): string {
  switch (kind) {
    case 'draft':
      return paths.file('drafts', runId);
    case 'plan':
      return paths.file('plans', runId);
    case 'task':
      return paths.file('tasks', runId);
    default:
      throw new Error(`Unsupported artifact kind: ${String(kind)}`);
  }
}

function toArtifactIndexEntry(runId: string, record: AnyArtifactRecord): ArtifactIndexEntry {
  switch (record.kind) {
    case 'draft':
      return {
        kind: 'draft',
        runId,
        artifactId: record.artifactId,
        path: record.path,
        updatedAt: record.updatedAt,
        title: record.value.title,
        status: record.value.status,
        domain: record.value.domain,
      };
    case 'plan':
      return {
        kind: 'plan',
        runId,
        artifactId: record.artifactId,
        path: record.path,
        updatedAt: record.updatedAt,
        title: record.value.title,
        status: record.value.status,
        draftId: record.value.draftId,
      };
    case 'task':
      return {
        kind: 'task',
        runId,
        artifactId: record.artifactId,
        path: record.path,
        updatedAt: record.updatedAt,
        itemCount: record.value.items.length,
        counts: countTaskItemStatuses(record.value),
      };
  }
}

function countTaskItemStatuses(task: Task): Record<Task['items'][number]['status'], number> {
  const counts: Record<Task['items'][number]['status'], number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
  };

  for (const item of task.items) {
    switch (item.status) {
      case 'pending':
        counts.pending = (counts.pending ?? 0) + 1;
        break;
      case 'in_progress':
        counts.in_progress = (counts.in_progress ?? 0) + 1;
        break;
      case 'completed':
        counts.completed = (counts.completed ?? 0) + 1;
        break;
      case 'failed':
        counts.failed = (counts.failed ?? 0) + 1;
        break;
      default:
        throw new Error(`Unsupported task item status: ${String(item.status)}`);
    }
  }

  return counts;
}

function compareArtifactIndexEntries(left: ArtifactIndexEntry, right: ArtifactIndexEntry): number {
  if (left.runId !== right.runId) {
    return left.runId.localeCompare(right.runId);
  }
  return ARTIFACT_ORDER.indexOf(left.kind) - ARTIFACT_ORDER.indexOf(right.kind);
}

interface ArtifactRestoreIndexEntry {
  readonly kind: ArtifactKind;
  readonly runId: string;
  readonly path: string;
}

async function readArtifactRestoreEntries(
  filePath: string,
  readFile: NonNullable<ArtifactServiceFsOps['readFile']>,
): Promise<readonly ArtifactRestoreIndexEntry[] | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return parseArtifactRestoreEntries(raw);
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    logger.warn(`artifact index read failed: ${String(error)}`);
    return null;
  }
}

async function readArtifactRestoreEntriesWithLegacyFallback(
  filePath: string,
  readFile: NonNullable<ArtifactServiceFsOps['readFile']>,
): Promise<readonly ArtifactRestoreIndexEntry[] | null> {
  const entries = await readArtifactRestoreEntries(filePath, readFile);
  if (entries && entries.length > 0) {
    return entries;
  }

  const legacyFilePath = toLegacyArtifactIndexPath(filePath);
  if (!legacyFilePath || legacyFilePath === filePath) {
    return entries;
  }
  return readArtifactRestoreEntries(legacyFilePath, readFile);
}

function toLegacyArtifactIndexPath(filePath: string): string | null {
  const marker = '/.neko/.cache/';
  const markerIndex = filePath.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  return `${filePath.slice(0, markerIndex)}/.neko/cache/${filePath.slice(
    markerIndex + marker.length,
  )}`;
}

function parseArtifactRestoreEntries(raw: string): readonly ArtifactRestoreIndexEntry[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const root = asRecord(parsed);
    if (!root || !Array.isArray(root['entries'])) {
      return null;
    }

    return root['entries']
      .map((entry) => toArtifactRestoreEntry(entry))
      .filter((entry): entry is ArtifactRestoreIndexEntry => entry !== null);
  } catch {
    return null;
  }
}

function toArtifactRestoreEntry(value: unknown): ArtifactRestoreIndexEntry | null {
  const entry = asRecord(value);
  if (!entry) {
    return null;
  }

  const kind = asArtifactKind(entry['kind']);
  const runId = asString(entry['runId']);
  const path = asString(entry['path']);
  if (!kind || !runId || !path) {
    return null;
  }

  return { kind, runId, path };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asArtifactKind(value: unknown): ArtifactKind | null {
  return value === 'draft' || value === 'plan' || value === 'task' ? value : null;
}

function isMissingFileError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === 'ENOENT') {
    return true;
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /ENOENT|no such file/i.test(message);
}
