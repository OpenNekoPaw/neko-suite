import * as nodeFs from 'node:fs/promises';
import type { ModelCallRecord, ModelCallRecorder } from '@neko/platform';
import { getLogger } from '../base';

export interface ModelCallJsonlRecorderFsOps {
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
  appendFile(path: string, data: string, encoding: 'utf-8'): Promise<void>;
}

export interface ModelCallJsonlRecorderOptions {
  readonly filePath: string;
  readonly fsOps?: ModelCallJsonlRecorderFsOps;
  readonly now?: () => number;
}

const logger = getLogger('ModelCallJsonlRecorder');
const nodeModelCallRecorderFsOps: ModelCallJsonlRecorderFsOps = {
  mkdir: async (path, opts) => {
    await nodeFs.mkdir(path, opts);
  },
  appendFile: (path, data, encoding) => nodeFs.appendFile(path, data, encoding),
};

class ModelCallJsonlRecorder implements ModelCallRecorder {
  private readonly filePath: string;
  private readonly fsOps: ModelCallJsonlRecorderFsOps;
  private readonly now: () => number;
  private pending: Promise<void> = Promise.resolve();
  private dirEnsured = false;
  private seq = 0;

  constructor(options: ModelCallJsonlRecorderOptions) {
    if (!options.filePath) {
      throw new Error('ModelCallJsonlRecorder: filePath is required');
    }
    this.filePath = options.filePath;
    this.fsOps = options.fsOps ?? nodeModelCallRecorderFsOps;
    this.now = options.now ?? (() => Date.now());
  }

  record(record: ModelCallRecord): void {
    const seq = ++this.seq;
    const ts = this.now();
    const line = JSON.stringify({ seq, ts, ...record }) + '\n';
    this.pending = this.pending
      .then(async () => {
        await this.ensureDir();
        await this.fsOps.appendFile(this.filePath, line, 'utf-8');
      })
      .catch((error: unknown) => {
        logger.warn('Failed to write model call record', {
          filePath: this.filePath,
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

  private async ensureDir(): Promise<void> {
    if (this.dirEnsured) {
      return;
    }
    const dir = this.filePath.replace(/[/\\][^/\\]+$/, '');
    if (dir && dir !== this.filePath) {
      await this.fsOps.mkdir(dir, { recursive: true });
    }
    this.dirEnsured = true;
  }
}

export function createModelCallJsonlRecorder(
  options: ModelCallJsonlRecorderOptions,
): ModelCallRecorder {
  return new ModelCallJsonlRecorder(options);
}
