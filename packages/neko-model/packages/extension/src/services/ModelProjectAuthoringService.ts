import * as path from 'path';
import * as vscode from 'vscode';
import {
  createDefaultNkmProject,
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
  type NekoProjectAuthoringDiagnostic,
  type NekoProjectAuthoringResult,
  type NekoProjectAuthoringTarget,
  type NkmProjectData,
  type ProjectFileDiagnostic,
  type ProjectSourceAddRequest,
} from '@neko/shared';
import {
  createNkmSourcePolicyOptions,
  loadNkmProject,
  saveNkmProject,
} from '../editor/ModelDocument';
import { validateModelAssetPath } from '../importModelAsset';

export interface ModelProjectAuthoringHost {
  readonly getActiveDocumentUri?: () => vscode.Uri | undefined;
  readonly revealDocument?: (uri: vscode.Uri) => Promise<void>;
}

export interface ModelImportAssetAuthoringRequest {
  readonly assetPath: string;
  readonly name?: string;
  readonly target?: NekoProjectAuthoringTarget;
}

export interface ModelImportAssetAuthoringData {
  readonly modelSrc: string;
}

export class ModelProjectAuthoringService {
  constructor(private readonly host: ModelProjectAuthoringHost = {}) {}

  async importAsset(
    request: ModelImportAssetAuthoringRequest,
  ): Promise<NekoProjectAuthoringResult<ModelImportAssetAuthoringData>> {
    const validation = validateModelAssetPath(request.assetPath);
    if (!validation.supported) {
      return createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: [
          createNekoProjectAuthoringDiagnostic({
            code: 'invalid-authoring-operation',
            message: `Unsupported model asset format: ${request.assetPath}`,
            context: { extension: validation.extension },
          }),
        ],
      });
    }

    const target = await this.resolveTarget(request);
    if (!target.ok) {
      return createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: target.diagnostics,
      });
    }

    const source = await this.acquireModelSource(request, target.uri);
    if (!source.ok) {
      return createNekoProjectAuthoringResult({
        ok: false,
        documentUri: target.uri.toString(),
        target: {
          kind: target.kind,
          documentUri: target.uri.toString(),
          created: target.created,
          reveal: target.reveal,
        },
        created: target.created,
        diagnostics: source.diagnostics,
      });
    }

    const project: NkmProjectData = {
      ...target.project,
      model: { ...target.project.model, src: source.durablePath },
    };
    await saveNkmProject(target.uri, project, target.created ? 'import' : 'agent-edit');
    if (target.reveal) {
      await this.host.revealDocument?.(target.uri);
    }

    return createNekoProjectAuthoringResult({
      ok: true,
      documentUri: target.uri.toString(),
      target: {
        kind: target.kind,
        documentUri: target.uri.toString(),
        created: target.created,
        reveal: target.reveal,
      },
      created: target.created,
      revealed: target.reveal,
      diagnostics: [],
      data: { modelSrc: source.durablePath },
    });
  }

  private async resolveTarget(request: ModelImportAssetAuthoringRequest): Promise<
    | {
        readonly ok: true;
        readonly uri: vscode.Uri;
        readonly project: NkmProjectData;
        readonly kind: 'active' | 'file' | 'new';
        readonly created: boolean;
        readonly reveal: boolean;
      }
    | {
        readonly ok: false;
        readonly diagnostics: readonly NekoProjectAuthoringDiagnostic[];
      }
  > {
    const target = request.target;
    if (target?.documentUri) {
      return await this.loadOrCreateFileTarget(
        this.toUri(target.documentUri),
        request,
        'file',
        target.reveal ?? false,
      );
    }

    if (target?.kind === 'active') {
      const activeUri = this.host.getActiveDocumentUri?.();
      if (!activeUri) {
        return {
          ok: false,
          diagnostics: [
            createNekoProjectAuthoringDiagnostic({
              code: 'interactive-editor-required',
              message: 'No active model editor is available for active-target import.',
            }),
          ],
        };
      }
      return await this.loadOrCreateFileTarget(activeUri, request, 'active', target.reveal ?? false);
    }

    if (target?.kind === 'new' || !target) {
      const uri = await this.createNewTargetUri(request);
      if (!uri) {
        return {
          ok: false,
          diagnostics: [
            createNekoProjectAuthoringDiagnostic({
              code: 'workspace-required',
              message: 'A workspace is required to create a model project.',
            }),
          ],
        };
      }
      return await this.loadOrCreateFileTarget(uri, request, 'new', target?.reveal ?? false);
    }

    return {
      ok: false,
      diagnostics: [
        createNekoProjectAuthoringDiagnostic({
          code: 'missing-authoring-target',
          message: 'Model asset import requires a file, active, or new target.',
        }),
      ],
    };
  }

  private async loadOrCreateFileTarget(
    uri: vscode.Uri,
    request: ModelImportAssetAuthoringRequest,
    kind: 'active' | 'file' | 'new',
    reveal: boolean,
  ): Promise<{
    readonly ok: true;
    readonly uri: vscode.Uri;
    readonly project: NkmProjectData;
    readonly kind: 'active' | 'file' | 'new';
    readonly created: boolean;
    readonly reveal: boolean;
  }> {
    if (await this.fileExists(uri)) {
      const loaded = await loadNkmProject(uri);
      if (!loaded.project) {
        throw new Error(
          `Failed to load .nkm file: ${loaded.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('; ')}`,
        );
      }
      return { ok: true, uri, project: loaded.project, kind, created: false, reveal };
    }

    const title = request.name ?? path.basename(request.assetPath, path.extname(request.assetPath));
    return {
      ok: true,
      uri,
      project: createDefaultNkmProject(title, null),
      kind: kind === 'active' ? 'file' : kind,
      created: true,
      reveal,
    };
  }

  private async acquireModelSource(
    request: ModelImportAssetAuthoringRequest,
    documentUri: vscode.Uri,
  ): Promise<
    | { readonly ok: true; readonly durablePath: string }
    | { readonly ok: false; readonly diagnostics: readonly NekoProjectAuthoringDiagnostic[] }
  > {
    const sourceRequest = this.createModelProjectSourceAddRequest(request, documentUri);
    const result = await handleProjectSourceAddRequest(sourceRequest, {
      ingest: (ingestRequest) =>
        ingestProjectSourceAddRequest(ingestRequest, {
          documentPath: documentUri.fsPath,
          assetDirectory: sourceRequest.destination.directory ?? '.',
          workspaceContext: createNkmSourcePolicyOptions(documentUri).context,
          fileOps: this.createSourceAssetFileOps(),
          defaultFileName: 'model.glb',
          unmanagedSourceMessage:
            'Model source must be moved into the project, asset library, or a configured media root before saving.',
        }),
    });

    if (!result.ok || !result.durablePath) {
      return {
        ok: false,
        diagnostics: result.diagnostics.map((diagnostic) =>
          this.toAuthoringDiagnostic(diagnostic),
        ),
      };
    }

    return { ok: true, durablePath: result.durablePath };
  }

  private createModelProjectSourceAddRequest(
    request: ModelImportAssetAuthoringRequest,
    documentUri: vscode.Uri,
  ): ProjectSourceAddRequest {
    const fileName = path.basename(request.assetPath);
    return {
      requestId: `model-authoring-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      kind: 'programmatic',
      formatId: 'nkm',
      documentUri: documentUri.toString(),
      sourcePath: request.assetPath,
      browserFile: { name: fileName },
      target: { role: 'model' },
      destination: { kind: 'project', directory: '.', copyMode: 'link' },
      ingestMode: 'link',
      caller: 'neko-model.authoring.importAsset',
      metadata: { modelAdd: true, name: request.name ?? fileName },
    };
  }

  private async createNewTargetUri(
    request: ModelImportAssetAuthoringRequest,
  ): Promise<vscode.Uri | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) return undefined;

    const title = sanitizeFileStem(
      request.target?.title ??
        request.name ??
        path.basename(request.assetPath, path.extname(request.assetPath)) ??
        'Model Import',
    );
    for (let index = 0; index < 1000; index += 1) {
      const suffix = index === 0 ? '' : `-${index}`;
      const uri = vscode.Uri.joinPath(workspaceRoot, `${title}${suffix}.nkm`);
      if (!(await this.fileExists(uri))) return uri;
    }
    throw new Error(`Unable to allocate a new model project file for ${title}.`);
  }

  private toUri(value: string): vscode.Uri {
    return path.isAbsolute(value) ? vscode.Uri.file(value) : vscode.Uri.parse(value);
  }

  private async fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private createSourceAssetFileOps() {
    return {
      createDirectory: async (dirPath: string) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
      fileExists: async (filePath: string) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          return true;
        } catch {
          return false;
        }
      },
      writeFile: async (filePath: string, bytes: Uint8Array) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
    };
  }

  private toAuthoringDiagnostic(
    diagnostic: ProjectFileDiagnostic,
  ): NekoProjectAuthoringDiagnostic {
    return createNekoProjectAuthoringDiagnostic({
      code: toAuthoringDiagnosticCode(diagnostic.code),
      severity: diagnostic.severity,
      message: diagnostic.message,
      path: diagnostic.path,
      sourceId: diagnostic.sourceId,
      projectFileDiagnostic: diagnostic,
    });
  }
}

function toAuthoringDiagnosticCode(code: ProjectFileDiagnostic['code']) {
  if (code === 'runtime-handle-persisted') return 'runtime-handle-persisted';
  if (code === 'cache-source-persisted') return 'cache-source-persisted';
  if (code === 'write-failed') return 'write-failed';
  return 'source-resolution-failed';
}

function sanitizeFileStem(value: string): string {
  const sanitized = value.replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim();
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : 'Model Import';
}
