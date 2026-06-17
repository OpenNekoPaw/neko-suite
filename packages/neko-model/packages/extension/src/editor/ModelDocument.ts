import * as vscode from 'vscode';
import {
  createDefaultNkmProject,
  createDefaultProjectFormatCodecRegistry,
  isWorkspaceMediaPathResolvedLocal,
  nkmSourcePathPolicy,
  ProjectFileStore,
  resolveWorkspaceMediaPath,
  type NkmProjectData,
} from '@neko/shared';
import { createVSCodeProjectFileIoAdapter } from '@neko/shared/vscode/extension';
import * as path from 'path';
import { getLogger } from '../logger';

const logger = getLogger('ModelDocument');
const projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
const projectFileStore = new ProjectFileStore({
  registry: createDefaultProjectFormatCodecRegistry(),
  fileOps: projectFileAdapter.fileOps,
});

/**
 * ModelDocument — Custom document for .nkm project files.
 *
 * Holds NkmProjectData and tracks dirty state.
 * Follows the same pattern as PuppetEditorProvider's document handling.
 *
 * For raw .gltf/.glb/.vrm files, an NkmProjectData is created on-the-fly
 * with the model path as `model.src`. The user can "Save As .nkm" to persist.
 */
export class ModelDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  private _projectData: NkmProjectData;
  private _isDirty = false;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _onDidDispose = new vscode.EventEmitter<void>();
  readonly onDidDispose = this._onDidDispose.event;

  private constructor(uri: vscode.Uri, projectData: NkmProjectData) {
    this.uri = uri;
    this._projectData = projectData;
  }

  /** Create from a .nkm project file */
  static async fromNkm(uri: vscode.Uri): Promise<ModelDocument> {
    const result = await loadNkmProject(uri);
    if (!result.project) {
      throw new Error(formatProjectFileDiagnostics(result.diagnostics, 'Failed to load .nkm file'));
    }

    return new ModelDocument(uri, result.project);
  }

  /** Create from a raw model file (.gltf/.glb/.vrm) */
  static fromModelFile(uri: vscode.Uri): ModelDocument {
    const name = path.basename(uri.fsPath, path.extname(uri.fsPath));
    const project = createDefaultNkmProject(name, uri.fsPath);
    return new ModelDocument(uri, project);
  }

  get projectData(): NkmProjectData {
    return this._projectData;
  }

  get isDirty(): boolean {
    return this._isDirty;
  }

  get isNkmFile(): boolean {
    return this.uri.fsPath.endsWith('.nkm');
  }

  /** Update project data and mark dirty */
  updateProjectData(updates: Partial<NkmProjectData>): void {
    this._projectData = { ...this._projectData, ...updates };
    this._isDirty = true;
    this._onDidChange.fire();
  }

  /** Update face parameters */
  updateFaceParams(params: Record<string, number>): void {
    this._projectData.faceParams = { ...this._projectData.faceParams, ...params };
    this._isDirty = true;
    this._onDidChange.fire();
  }

  /** Update editor state (opaque) */
  updateEditorState(state: Record<string, unknown>): void {
    this._projectData.editorState = state;
    this._isDirty = true;
    this._onDidChange.fire();
  }

  /** Serialize to JSON for saving */
  toJSON(): string {
    return JSON.stringify(this._projectData, null, 2);
  }

  /** Save to the document's URI */
  async save(): Promise<void> {
    if (!this.isNkmFile) {
      logger.warn('Cannot save non-.nkm file directly; use Save As');
      return;
    }

    await saveNkmProject(this.uri, this._projectData);
    this._isDirty = false;
  }

  /** Save to a specific URI */
  async saveAs(targetUri: vscode.Uri): Promise<void> {
    await saveNkmProject(targetUri, this._projectData);
    this._isDirty = false;
  }

  /** Revert to saved state */
  async revert(): Promise<void> {
    if (!this.isNkmFile) return;

    const result = await loadNkmProject(this.uri);
    if (!result.project) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to revert .nkm file'),
      );
    }
    this._projectData = result.project;
    this._isDirty = false;
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}

export interface NkmProjectLoadResult {
  readonly project?: NkmProjectData;
  readonly readOnly: boolean;
  readonly diagnostics: readonly { readonly message: string; readonly code?: string }[];
}

export async function loadNkmProject(uri: vscode.Uri): Promise<NkmProjectLoadResult> {
  const result = await projectFileStore.load<NkmProjectData>({
    filePath: uri.fsPath,
    formatId: 'nkm',
    sourcePolicy: nkmSourcePathPolicy,
    sourcePolicyOptions: createNkmSourcePolicyOptions(uri),
  });

  return {
    project: result.document,
    readOnly: result.readOnly,
    diagnostics: result.diagnostics,
  };
}

export async function saveNkmProject(uri: vscode.Uri, project: NkmProjectData): Promise<void> {
  const result = await projectFileStore.save({
    filePath: uri.fsPath,
    formatId: 'nkm',
    document: project,
    sourcePolicy: nkmSourcePathPolicy,
    sourcePolicyOptions: createNkmSourcePolicyOptions(uri),
  });

  if (!result.ok) {
    throw new Error(formatProjectFileDiagnostics(result.diagnostics, 'Failed to save .nkm file'));
  }
}

export async function updateNkmProject(
  uri: vscode.Uri,
  update: (project: NkmProjectData) => NkmProjectData,
): Promise<NkmProjectData | undefined> {
  const loaded = await loadNkmProject(uri);
  if (!loaded.project) {
    logger.warn(formatProjectFileDiagnostics(loaded.diagnostics, 'Cannot update .nkm file'));
    return undefined;
  }

  const next = update(loaded.project);
  await saveNkmProject(uri, next);
  return next;
}

export async function resolveNkmProjectModelSource(uri: vscode.Uri): Promise<string | undefined> {
  const loaded = await loadNkmProject(uri);
  const src = loaded.project?.model.src;
  if (!src) return undefined;

  const resolved = resolveWorkspaceMediaPath({
    source: src,
    context: createNkmSourcePolicyOptions(uri).context,
  });

  return isWorkspaceMediaPathResolvedLocal(resolved) ? resolved.path : undefined;
}

export function createNkmSourcePolicyOptions(
  uri: vscode.Uri,
): Parameters<ProjectFileStore['save']>[0]['sourcePolicyOptions'] {
  const documentDir = path.dirname(uri.fsPath);
  const context = projectFileAdapter.createWorkspaceMediaPathContext({
    documentUri: uri,
    pathVariables: new Map([['PROJECT', documentDir]]),
    allowedRoots: [
      documentDir,
      ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    ],
  });
  const pathVariables = new Map(context.pathVariables ?? []);
  pathVariables.set('PROJECT', documentDir);
  return {
    context: {
      ...context,
      owningWorkspaceRoot: documentDir,
      documentDir,
      pathVariables,
    },
  };
}

function formatProjectFileDiagnostics(
  diagnostics: readonly { readonly message: string }[],
  fallback: string,
): string {
  if (diagnostics.length === 0) return fallback;
  return `${fallback}: ${diagnostics.map((diagnostic) => diagnostic.message).join('; ')}`;
}
