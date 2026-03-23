/**
 * 视频编辑器模型
 * 实现 IEditorModel 接口，包装 .nkv 文档
 */

import * as vscode from 'vscode';
import { BaseEditorModel, EditorCapabilities, IModelChangeEvent } from '../common/editorModel';
import { ProjectData, createDefaultProject, loadNkv } from '@neko/shared';
import { getLogger } from '../../base';

const logger = getLogger('VideoEditorModel');

// =============================================================================
// 视频编辑器模型
// =============================================================================

export class VideoEditorModel extends BaseEditorModel {
  private _content: ProjectData;
  private _pendingEdit: Promise<void> | null = null;
  /** Counter for internal saves, incremented before edit, decremented after event processed */
  private _internalSaveCounter: number = 0;

  constructor(document: vscode.TextDocument) {
    super(document, 'video');
    this._content = this.parseDocument();
  }

  /**
   * Check if an internal save is in progress
   * Used by videoEditorProvider to skip reload on document change events
   */
  get isInternalSave(): boolean {
    return this._internalSaveCounter > 0;
  }

  /**
   * Decrement internal save counter (called after document change event is processed)
   */
  decrementInternalSaveCounter(): void {
    if (this._internalSaveCounter > 0) {
      this._internalSaveCounter--;
    }
  }

  // -------------------------------------------------------------------------
  // 能力定义
  // -------------------------------------------------------------------------

  get capabilities(): EditorCapabilities {
    return {
      hasTimeline: true,
      hasLayers: true,
      hasScenes: false,
      supportedExportFormats: ['mp4', 'webm'],
      supportsUndoRedo: true,
      supportsSelection: true,
    };
  }

  // -------------------------------------------------------------------------
  // 内容操作
  // -------------------------------------------------------------------------

  getContent<T>(): T {
    return this._content as T;
  }

  async setContent<T>(content: T): Promise<void> {
    const projectData = content as ProjectData;
    this._content = projectData;

    // 序列化编辑操作，避免并发冲突
    const doEdit = async (): Promise<void> => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      // Increment counter before edit to prevent reload on document change
      // Counter is decremented by videoEditorProvider after processing the event
      this._internalSaveCounter++;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            this.document.uri,
            new vscode.Range(0, 0, this.document.lineCount, 0),
            JSON.stringify(this._content, null, 2),
          );

          const success = await vscode.workspace.applyEdit(edit);
          if (success) {
            // Do NOT fire change event here - save should not trigger webview update
            // The webview already has the latest state
            return;
          }

          // applyEdit 返回 false，等待后重试
          await new Promise((resolve) => setTimeout(resolve, 50 * (i + 1)));
        } catch (error) {
          lastError = error as Error;
          // 等待后重试
          await new Promise((resolve) => setTimeout(resolve, 50 * (i + 1)));
        }
      }

      // 所有重试失败后，记录警告并重置计数器
      logger.warn('Failed to apply edit after retries:', lastError?.message);
      // Decrement counter since no document change event will be fired
      if (this._internalSaveCounter > 0) {
        this._internalSaveCounter--;
      }
    };

    // 等待之前的编辑完成
    if (this._pendingEdit) {
      await this._pendingEdit;
    }

    this._pendingEdit = doEdit();
    await this._pendingEdit;
    this._pendingEdit = null;
  }

  // -------------------------------------------------------------------------
  // 项目特定方法
  // -------------------------------------------------------------------------

  /**
   * 获取项目数据（类型安全版本）
   */
  getProjectData(): ProjectData {
    return this._content;
  }

  /**
   * 更新项目数据
   */
  async updateProjectData(data: ProjectData): Promise<boolean> {
    await this.setContent(data);
    return true;
  }

  /**
   * Update in-memory content without writing to document.
   * Used for incremental sync from Webview operations.
   */
  applyIncrementalUpdate(newContent: ProjectData): void {
    this._content = newContent;
  }

  /**
   * 重新加载文档内容
   */
  reload(): void {
    this._content = this.parseDocument();
    this._onDidChange.fire({
      model: this,
      changeType: 'content',
      changes: this._content,
    });
  }

  // -------------------------------------------------------------------------
  // 私有方法
  // -------------------------------------------------------------------------

  private parseDocument(): ProjectData {
    const text = this.document.getText();

    if (!text || text.trim() === '') {
      return createDefaultProject();
    }

    const result = loadNkv(text);

    if (!result.validation.valid) {
      logger.warn(
        'NKV validation errors:',
        result.validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
      );
    }

    if (result.migration) {
      logger.info(
        `Migrated NKV from ${result.migration.fromVersion} to ${result.migration.toVersion}`,
      );
    }

    return result.project;
  }
}

// =============================================================================
// 视频编辑器模型 Provider
// =============================================================================

import { IEditorModelProvider } from '../common/editorRegistry';
import { IEditorModel } from '../common/editorModel';

export class VideoEditorModelProvider implements IEditorModelProvider {
  createModel(document: vscode.TextDocument): IEditorModel {
    return new VideoEditorModel(document);
  }
}
