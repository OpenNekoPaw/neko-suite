import * as fs from 'fs/promises';
import * as os from 'os';
import type * as vscode from 'vscode';
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
import { getDocumentImageCacheUri } from './documentCachePaths';
import { createDocumentLowLevelAccess } from './documentLowLevelAccess';
import { resolveDocumentPath } from './documentPathResolver';
import type { IEngineClientProvider } from './engineClientProvider';

const logger = getLogger('DocumentReaderService');

export type { DocumentContent };

export interface IDocumentReaderService extends IDocumentReader, IDocumentAccessService {}

export interface DocumentReaderServiceOptions {
  readonly tempDir?: string;
}

export class DocumentReaderService implements IDocumentReaderService {
  private readonly runtime: IDocumentReader;
  private readonly access: IDocumentAccessService;

  constructor(lowLevelAccess?: DocumentLowLevelAccess, options: DocumentReaderServiceOptions = {}) {
    const tempDir = options.tempDir ?? os.tmpdir();
    const runtimeDeps: DocumentReaderRuntimeDeps = {
      readTextFile: async (filePath) => fs.readFile(await resolveDocumentPath(filePath), 'utf-8'),
      readBinaryFile: async (filePath) => fs.readFile(await resolveDocumentPath(filePath)),
      writeBinaryFile: async (filePath, data) =>
        fs.writeFile(await resolveDocumentPath(filePath), data),
      makeDir: async (filePath, options) =>
        fs.mkdir(await resolveDocumentPath(filePath), options).then(() => undefined),
      tempDir: () => tempDir,
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

  async read(filePath: string): Promise<DocumentContent> {
    return this.runtime.read(await resolveDocumentPath(filePath));
  }

  supports(filePath: string): boolean {
    return this.runtime.supports(filePath);
  }

  async hasDRM(filePath: string): Promise<boolean> {
    return this.runtime.hasDRM(await resolveDocumentPath(filePath));
  }

  async readContent(filePath: string): Promise<DocumentContent> {
    return this.access.readContent(await resolveDocumentPath(filePath));
  }

  async getManifest(source: DocumentSourceRef | string): Promise<DocumentManifest> {
    return this.access.getManifest(await this.resolveSourceInput(source));
  }

  async createBatchCursor(
    source: DocumentSourceRef | string,
    options?: { maxChars?: number },
  ): Promise<DocumentBatchCursor> {
    return this.access.createBatchCursor(await this.resolveSourceInput(source), options);
  }

  async readRange(
    source: DocumentSourceRef | string,
    range: DocumentRange,
  ): Promise<DocumentReadResult> {
    return this.access.readRange(await this.resolveSourceInput(source), range);
  }

  async readNext(cursor: DocumentBatchCursor): Promise<DocumentReadResult> {
    return this.access.readNext({
      ...cursor,
      source: await this.resolveSourceRef(cursor.source),
    });
  }

  private async tryImport<T>(packageName: string): Promise<T | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(packageName) as T;
    } catch {
      return null;
    }
  }

  private async resolveSourceInput(
    source: DocumentSourceRef | string,
  ): Promise<DocumentSourceRef | string> {
    if (typeof source === 'string') {
      return resolveDocumentPath(source);
    }
    return this.resolveSourceRef(source);
  }

  private async resolveSourceRef(source: DocumentSourceRef): Promise<DocumentSourceRef> {
    const filePath = await resolveDocumentPath(source.filePath);
    return filePath === source.filePath ? source : { ...source, filePath };
  }
}

export function createDocumentReaderService(
  engineClientProvider?: IEngineClientProvider,
  context?: vscode.ExtensionContext,
): IDocumentReaderService {
  return new DocumentReaderService(createDocumentLowLevelAccess(engineClientProvider), {
    tempDir: context ? getDocumentImageCacheUri(context).fsPath : undefined,
  });
}
