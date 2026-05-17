import * as fs from 'fs/promises';
import * as os from 'os';
import {
  createDocumentAccessService,
  createDocumentReaderRuntime,
  type DocumentContent,
  type DocumentLowLevelAccess,
  type DocumentReaderRuntimeDeps,
  type IDocumentAccessService,
  type IDocumentReader,
} from '@neko/platform/document';
import type {
  DocumentBatchCursor,
  DocumentManifest,
  DocumentRange,
  DocumentReadResult,
  DocumentSourceRef,
} from '@neko/shared';
import { getLogger } from '../base';
import { createDocumentLowLevelAccess } from './documentLowLevelAccess';
import type { IEngineClientProvider } from './engineClientProvider';

const logger = getLogger('DocumentReaderService');

export type { DocumentContent };

export interface IDocumentReaderService extends IDocumentReader, IDocumentAccessService {}

export class DocumentReaderService implements IDocumentReaderService {
  private readonly runtime: IDocumentReader;
  private readonly access: IDocumentAccessService;

  constructor(lowLevelAccess?: DocumentLowLevelAccess) {
    const runtimeDeps: DocumentReaderRuntimeDeps = {
      readTextFile: (filePath) => fs.readFile(filePath, 'utf-8'),
      readBinaryFile: (filePath) => fs.readFile(filePath),
      writeBinaryFile: (filePath, data) => fs.writeFile(filePath, data),
      makeDir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
      tempDir: () => os.tmpdir(),
      loadModule: <T>(packageName: string) => this.tryImport<T>(packageName),
      logger,
    };
    this.runtime = createDocumentReaderRuntime(runtimeDeps);
    this.access = createDocumentAccessService({
      reader: this.runtime,
      runtime: runtimeDeps,
      lowLevelAccess: lowLevelAccess ?? createDocumentLowLevelAccess(),
    });
  }

  read(filePath: string): Promise<DocumentContent> {
    return this.runtime.read(filePath);
  }

  supports(filePath: string): boolean {
    return this.runtime.supports(filePath);
  }

  hasDRM(filePath: string): Promise<boolean> {
    return this.runtime.hasDRM(filePath);
  }

  readContent(filePath: string): Promise<DocumentContent> {
    return this.access.readContent(filePath);
  }

  getManifest(source: DocumentSourceRef | string): Promise<DocumentManifest> {
    return this.access.getManifest(source);
  }

  createBatchCursor(
    source: DocumentSourceRef | string,
    options?: { maxChars?: number },
  ): Promise<DocumentBatchCursor> {
    return this.access.createBatchCursor(source, options);
  }

  readRange(source: DocumentSourceRef | string, range: DocumentRange): Promise<DocumentReadResult> {
    return this.access.readRange(source, range);
  }

  readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult> {
    return this.access.readNext(cursor);
  }

  private async tryImport<T>(packageName: string): Promise<T | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(packageName) as T;
    } catch {
      return null;
    }
  }
}

export function createDocumentReaderService(
  engineClientProvider?: IEngineClientProvider,
): IDocumentReaderService {
  return new DocumentReaderService(createDocumentLowLevelAccess(engineClientProvider));
}
