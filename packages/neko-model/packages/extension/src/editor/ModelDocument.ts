import * as vscode from 'vscode';
import type { NkmProjectData } from '@neko/shared';
import { createDefaultNkmProject } from '@neko/shared';
import * as path from 'path';
import { getLogger } from '../logger';

const logger = getLogger('ModelDocument');

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
    const data = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(data);
    const parsed = JSON.parse(text) as NkmProjectData;

    // Migrate v1 → v2 (new fields have defaults in createDefaultNkmProject)
    if (parsed.version < 2) {
      parsed.version = 2;
      parsed.faceParams ??= {};
      parsed.customClips ??= [];
      parsed.camera ??= null;
      parsed.editorState ??= {};
    }

    return new ModelDocument(uri, parsed);
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

    const content = new TextEncoder().encode(this.toJSON());
    await vscode.workspace.fs.writeFile(this.uri, content);
    this._isDirty = false;
  }

  /** Save to a specific URI */
  async saveAs(targetUri: vscode.Uri): Promise<void> {
    const content = new TextEncoder().encode(this.toJSON());
    await vscode.workspace.fs.writeFile(targetUri, content);
    this._isDirty = false;
  }

  /** Revert to saved state */
  async revert(): Promise<void> {
    if (!this.isNkmFile) return;

    const data = await vscode.workspace.fs.readFile(this.uri);
    const text = new TextDecoder().decode(data);
    this._projectData = JSON.parse(text) as NkmProjectData;
    this._isDirty = false;
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
    this._onDidDispose.fire();
    this._onDidDispose.dispose();
  }
}
