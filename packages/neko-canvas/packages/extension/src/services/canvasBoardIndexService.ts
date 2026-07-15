import * as path from 'path';
import * as vscode from 'vscode';
import {
  CANVAS_BOARD_DIRECTORY,
  CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
  createDefaultProjectFormatCodecRegistry,
  nkcSourcePathPolicy,
  ProjectFileStore,
  validateCanvasBoardDocumentRef,
  type CanvasBoardDocumentRef,
  type CanvasBoardQuery,
  type CanvasBoardQueryResult,
  type CanvasBoardQuerySummary,
  type CanvasBoardRoutingDiagnostic,
  type CanvasData,
  type ILogger,
} from '@neko/shared';
import { createVSCodeProjectFileIoAdapter } from '@neko/shared/vscode/extension';
import {
  matchesCanvasBoardQueryFilter,
  projectCanvasBoardQuerySummary,
} from './canvasBoardProjection';

export interface CanvasBoardIndexServiceOptions {
  readonly logger?: Pick<ILogger, 'debug' | 'warn' | 'error'>;
}

export class CanvasBoardIndexService {
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: this.projectFileAdapter.fileOps,
    logger: this.options.logger,
  });

  constructor(private readonly options: CanvasBoardIndexServiceOptions = {}) {}

  async query(query: CanvasBoardQuery): Promise<CanvasBoardQueryResult> {
    if (
      query.version !== CANVAS_BOARD_ROUTING_CONTRACT_VERSION ||
      query.directory !== CANVAS_BOARD_DIRECTORY
    ) {
      throw new Error('Invalid Canvas Board index query contract.');
    }
    const folder = requireWorkspaceFolder();
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, `${CANVAS_BOARD_DIRECTORY}/*.nkc`),
    );
    const summaries: CanvasBoardQuerySummary[] = [];
    const diagnostics: CanvasBoardRoutingDiagnostic[] = [];

    for (const uri of uris.sort((left, right) => left.fsPath.localeCompare(right.fsPath))) {
      const result = await this.loadSummary(folder, uri);
      if (result.summary && matchesCanvasBoardQueryFilter(result.summary, query.filter)) {
        summaries.push(result.summary);
      }
      diagnostics.push(...result.diagnostics);
    }

    return {
      version: CANVAS_BOARD_ROUTING_CONTRACT_VERSION,
      summaries,
      diagnostics,
    };
  }

  async get(documentRef: CanvasBoardDocumentRef): Promise<CanvasBoardQuerySummary | undefined> {
    const diagnostics = validateCanvasBoardDocumentRef(documentRef);
    if (diagnostics.length > 0) {
      throw new Error(diagnostics.map(({ message }) => message).join(' '));
    }
    const folder = requireWorkspaceFolder();
    const uri = vscode.Uri.file(path.join(folder.uri.fsPath, documentRef.path));
    const result = await this.loadSummary(folder, uri);
    if (result.diagnostics.length > 0) {
      this.options.logger?.warn('canvasBoardIndex.get.failed', {
        boardPath: documentRef.path,
        diagnostics: result.diagnostics,
      });
    }
    return result.summary;
  }

  private async loadSummary(
    folder: vscode.WorkspaceFolder,
    uri: vscode.Uri,
  ): Promise<{
    readonly summary?: CanvasBoardQuerySummary;
    readonly diagnostics: readonly CanvasBoardRoutingDiagnostic[];
  }> {
    try {
      const loaded = await this.projectFileStore.load<CanvasData>({
        filePath: uri.fsPath,
        formatId: 'nkc',
        sourcePolicy: nkcSourcePathPolicy,
        sourcePolicyOptions: {
          context: this.projectFileAdapter.createWorkspaceMediaPathContext({
            documentUri: uri,
            allowedRoots: [path.dirname(uri.fsPath), folder.uri.fsPath],
          }),
        },
      });
      if (!loaded.ok || !loaded.document) {
        return {
          diagnostics: [
            {
              code: 'stale-board-target',
              severity: 'error',
              message: `Canvas Board could not be loaded: ${loaded.diagnostics
                .map(({ message }) => message)
                .join('; ')}`,
            },
          ],
        };
      }
      const stat = await vscode.workspace.fs.stat(uri);
      const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
      return {
        summary: projectCanvasBoardQuerySummary({
          workspaceRelativePath: relativePath,
          canvasData: loaded.document,
          ...(typeof stat.mtime === 'number'
            ? { updatedAt: new Date(stat.mtime).toISOString() }
            : {}),
        }),
        diagnostics: [],
      };
    } catch (error) {
      this.options.logger?.warn('canvasBoardIndex.load.failed', {
        boardPath: path.relative(folder.uri.fsPath, uri.fsPath),
        error,
      });
      return {
        diagnostics: [
          {
            code: isMissingFileError(error) ? 'deleted-board-target' : 'stale-board-target',
            severity: 'error',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
}

function requireWorkspaceFolder(): vscode.WorkspaceFolder {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('No workspace folder open for querying Canvas Board documents.');
  }
  return folder;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && /(?:ENOENT|FileNotFound|not found)/i.test(error.message);
}
