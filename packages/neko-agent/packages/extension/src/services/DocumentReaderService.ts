import * as fs from 'fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
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
    const documentAccess = lowLevelAccess ?? createDocumentLowLevelAccess();
    const tempDir = options.tempDir ?? resolveDefaultDocumentRuntimeCacheDir();
    const runtimeDeps: DocumentReaderRuntimeDeps = {
      readTextFile: async (filePath) => fs.readFile(await resolveDocumentPath(filePath), 'utf-8'),
      readBinaryFile: async (filePath) => {
        if (!documentAccess.readFile) {
          throw new Error('Engine file access is unavailable for document binary reads');
        }
        return documentAccess.readFile(await resolveDocumentPath(filePath));
      },
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
      lowLevelAccess: documentAccess,
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
    tempDir: resolveDocumentRuntimeCacheDir(context),
  });
}

export function resolveDocumentRuntimeCacheDir(context?: vscode.ExtensionContext): string {
  const workspaceRoot = readWorkspaceRoot();
  if (workspaceRoot) {
    return path.join(workspaceRoot, '.neko', '.runtime', 'document-reader');
  }
  if (context?.globalStorageUri && isFileUriLike(context.globalStorageUri)) {
    return path.join(context.globalStorageUri.fsPath, 'runtime', 'document-reader');
  }
  throw new Error(
    'DocumentReaderService requires a workspace or file-backed extension context for document image cache storage.',
  );
}

function resolveDefaultDocumentRuntimeCacheDir(): string {
  return resolveDocumentRuntimeCacheDir();
}

function readWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  const root = folders?.[0]?.uri;
  return root && isFileUriLike(root) ? root.fsPath : undefined;
}

function isFileUriLike(uri: vscode.Uri): boolean {
  return Boolean(uri.fsPath && (uri.scheme === undefined || uri.scheme === 'file'));
}
