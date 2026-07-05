import * as nodeFs from 'node:fs/promises';
import type { AgentTraceContext } from '@neko/shared';
import type { ModelCallRecord, ModelCallRecorder } from '@neko/platform';
import { getLogger } from '../base';

export interface ModelCallJsonlRecorderFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  appendFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

export interface ModelCallJsonlRecorderOptions {
  readonly filePath?: string;
  readonly resolveFilePath?: (input: ModelCallJsonlRecorderPathInput) => string;
  readonly writerId?: string;
  readonly fsOps?: ModelCallJsonlRecorderFsOps;
  readonly now?: () => number;
}

const logger = getLogger('ModelCallJsonlRecorder');
let modelCallRecorderWriterOrdinal = 0;
const nodeModelCallRecorderFsOps: ModelCallJsonlRecorderFsOps = {
  mkdir: async (path, opts) => {
    await nodeFs.mkdir(path, opts);
  },
  appendFile: (path, data, encoding) => nodeFs.appendFile(path, data, encoding),
};

export interface ModelCallLogPartition {
  readonly conversationId: string;
  readonly turnId?: string;
  readonly runId?: string;
  readonly requestId: string;
}

export interface ModelCallJsonlRecorderPathInput {
  readonly record: ModelCallRecord;
  readonly trace: AgentTraceContext;
  readonly partition: ModelCallLogPartition;
}

class ModelCallJsonlRecorder implements ModelCallRecorder {
  private readonly filePath: string | undefined;
  private readonly resolveFilePath:
    | ((input: ModelCallJsonlRecorderPathInput) => string)
    | undefined;
  private readonly writerId: string;
  private readonly fsOps: ModelCallJsonlRecorderFsOps;
  private readonly now: () => number;
  private pending: Promise<void> = Promise.resolve();
  private readonly dirsEnsured = new Set<string>();
  private readonly fileSeq = new Map<string, number>();
  private readonly partitionSeq = new Map<string, number>();

  constructor(options: ModelCallJsonlRecorderOptions) {
    if (!options.filePath && !options.resolveFilePath) {
      throw new Error('ModelCallJsonlRecorder: filePath or resolveFilePath is required');
    }
    this.filePath = options.filePath;
    this.resolveFilePath = options.resolveFilePath;
    this.writerId = options.writerId ?? createModelCallRecorderWriterId();
    this.fsOps = options.fsOps ?? nodeModelCallRecorderFsOps;
    this.now = options.now ?? (() => Date.now());
  }

  record(record: ModelCallRecord): void {
    const ts = this.now();
    const trace = normalizeModelCallTrace(record.trace, record.requestId);
    const partition = createModelCallPartition(trace, record.requestId);
    const filePath = this.resolveRecordFilePath({ record, trace, partition });
    const seq = this.nextFileSeq(filePath);
    const partitionSeq = this.nextPartitionSeq(partition);
    const line =
      JSON.stringify({
        writerId: this.writerId,
        seq,
        partitionSeq,
        ts,
        ...record,
        trace,
        partition,
      }) + '\n';
    this.pending = this.pending
      .then(async () => {
        await this.ensureDir(filePath);
        await this.fsOps.appendFile(filePath, line, 'utf-8');
      })
      .catch((error: unknown) => {
        logger.warn('Failed to write model call record', {
          filePath,
          requestId: record.requestId,
          kind: record.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  async flush(): Promise<void> {
    await this.pending;
  }

  async dispose(): Promise<void> {
    await this.flush();
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = filePath.replace(/[/\\][^/\\]+$/, '');
    if (this.dirsEnsured.has(dir)) {
      return;
    }
    if (dir && dir !== filePath) {
      await this.fsOps.mkdir(dir, { recursive: true });
    }
    this.dirsEnsured.add(dir);
  }

  private nextFileSeq(filePath: string): number {
    const next = (this.fileSeq.get(filePath) ?? 0) + 1;
    this.fileSeq.set(filePath, next);
    return next;
  }

  private nextPartitionSeq(partition: ModelCallLogPartition): number {
    const key = createModelCallPartitionKey(partition);
    const next = (this.partitionSeq.get(key) ?? 0) + 1;
    this.partitionSeq.set(key, next);
    return next;
  }

  private resolveRecordFilePath(input: ModelCallJsonlRecorderPathInput): string {
    const filePath = this.resolveFilePath ? this.resolveFilePath(input) : this.filePath;
    if (!filePath) {
      throw new Error('ModelCallJsonlRecorder: resolved filePath is required');
    }
    return filePath;
  }
}

function createModelCallRecorderWriterId(): string {
  modelCallRecorderWriterOrdinal += 1;
  return `model-call-${Date.now().toString(36)}-${modelCallRecorderWriterOrdinal}`;
}

function normalizeModelCallTrace(trace: AgentTraceContext, requestId: string): AgentTraceContext {
  const llmRequestId = trace.llmRequestId ?? requestId;
  const duplicateRunId = trace.runId !== undefined && trace.runId === trace.turnId;

  return {
    conversationId: trace.conversationId,
    ...(duplicateRunId || trace.runId === undefined ? {} : { runId: trace.runId }),
    ...(trace.turnId !== undefined ? { turnId: trace.turnId } : {}),
    ...(trace.iteration !== undefined ? { iteration: trace.iteration } : {}),
    ...(trace.phase !== undefined ? { phase: trace.phase } : {}),
    ...(trace.parentRequestId !== undefined ? { parentRequestId: trace.parentRequestId } : {}),
    llmRequestId,
    ...(trace.toolRequestId !== undefined ? { toolRequestId: trace.toolRequestId } : {}),
  };
}

function createModelCallPartition(
  trace: AgentTraceContext,
  requestId: string,
): ModelCallLogPartition {
  return {
    conversationId: trace.conversationId,
    ...(trace.turnId !== undefined ? { turnId: trace.turnId } : {}),
    ...(trace.turnId === undefined && trace.runId !== undefined ? { runId: trace.runId } : {}),
    requestId: trace.llmRequestId ?? requestId,
  };
}

function createModelCallPartitionKey(partition: ModelCallLogPartition): string {
  return [
    partition.conversationId,
    partition.turnId ? `turn:${partition.turnId}` : `run:${partition.runId ?? 'none'}`,
    partition.requestId,
  ].join('\u001f');
}

export function createModelCallJsonlRecorder(
  options: ModelCallJsonlRecorderOptions,
): ModelCallRecorder {
  return new ModelCallJsonlRecorder(options);
}
