/**
 * 消息处理器
 * 处理 Extension Host 和 WebView 之间的消息通信
 *
 * 职责：编辑器核心消息（保存、文件请求、导出）
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VideoEditorModel } from './videoEditorModel';
import {
  MessageFromWebview,
  ProjectData,
  ContextMenuItem,
  applyOperation,
  type EditOperation,
} from '@neko/shared';
import { getLogger } from '../../base';

const logger = getLogger('MessageHandler');

/**
 * Handles messages between Extension Host and WebView
 */
export class MessageHandler {
  // 当前导出文件的写入流
  private _exportWriteStream: fs.WriteStream | null = null;
  private _exportFilePath: string | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly model: VideoEditorModel,
    private readonly _context: vscode.ExtensionContext,
  ) {}

  /**
   * Handle incoming messages from the webview
   */
  public async handleMessage(message: MessageFromWebview): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.sendUpdate();
        break;

      case 'save':
        await this.handleSave(message.content);
        break;

      case 'requestFile':
        await this.handleRequestFile(message.path);
        break;

      case 'addMediaToTimeline':
        await this.handleAddMedia(message.path);
        break;

      case 'saveBlob':
        await this.handleSaveBlob(message.data, message.filename, message.mimeType);
        break;

      case 'selectExportPath':
        await this.handleSelectExportPath(message.filename, message.format);
        break;

      case 'saveBlobToPath':
        await this.handleSaveBlobToPath(message.data, message.path, message.mimeType);
        break;

      case 'showExportDialog':
        await this.handleShowExportDialog(message.filename, message.format);
        break;

      case 'writeExportChunk':
        await this.handleWriteExportChunk(message.data);
        break;

      case 'finalizeExport':
        await this.handleFinalizeExport(message.success, message.error);
        break;

      case 'cancelExport':
        await this.handleCancelExport();
        break;

      case 'showContextMenu':
        await this.handleShowContextMenu(message.menuId, message.items);
        break;

      case 'readFileRange':
        await this.handleReadFileRange(message.requestId, message.path, message.start, message.end);
        break;

      case 'operationApplied':
        this.handleOperationApplied(message.operation);
        break;

      // These are handled by videoEditorProvider before reaching messageHandler
      case 'export:start':
      case 'export:cancel':
      case 'export:queryGlobalStatus':
      case 'validateFile':
        break;

      default:
        logger.warn(`Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  /**
   * Send updated content to WebView
   */
  public sendUpdate(): void {
    this.webview.postMessage({
      type: 'update',
      content: this.model.getProjectData(),
    });
  }

  /**
   * Send error message to WebView
   */
  public sendError(message: string): void {
    this.webview.postMessage({
      type: 'error',
      message,
    });
  }

  // ==========================================================================
  // 增量同步处理
  // ==========================================================================

  /**
   * Handle incremental operation sync from Webview.
   * Applies the operation to in-memory model without writing to document.
   */
  private handleOperationApplied(operation: EditOperation): void {
    try {
      const currentData = this.model.getProjectData();
      const newData = applyOperation(currentData as any, operation) as ProjectData;
      this.model.applyIncrementalUpdate(newData);
    } catch (e) {
      logger.error('Incremental sync failed', e);
      // Non-fatal: full save on Cmd+S will resync
    }
  }

  // ==========================================================================
  // 编辑器核心处理方法
  // ==========================================================================

  /**
   * Handle save request from WebView
   */
  private async handleSave(content: ProjectData): Promise<void> {
    try {
      const normalizedContent = this.normalizePathsForSave(content);
      const success = await this.model.updateProjectData(normalizedContent);
      if (success) {
        this.webview.postMessage({ type: 'saved' });
      } else {
        this.sendError('Failed to save project');
      }
    } catch (error) {
      logger.error('Save error', error);
      this.sendError(`Save error: ${error}`);
    }
  }

  /**
   * Convert absolute paths to relative paths for portable .nkv files
   * Paths are relative to the .nkv file location, not workspace root
   */
  private normalizePathsForSave(content: ProjectData): ProjectData {
    // Get the directory containing the .nkv file
    const jviDir = path.dirname(this.model.uri.fsPath);
    const normalized = JSON.parse(JSON.stringify(content)) as ProjectData;

    for (const track of normalized.tracks) {
      for (const element of track.elements) {
        if ('src' in element && typeof element.src === 'string') {
          element.src = this.toRelativePath(element.src, jviDir);
        }
      }
    }

    return normalized;
  }

  /**
   * Convert an absolute path to a relative path from the given base directory
   */
  private toRelativePath(filePath: string, baseDir: string): string {
    if (!path.isAbsolute(filePath)) {
      return filePath;
    }

    const normalizedPath = path.normalize(filePath);
    const normalizedBase = path.normalize(baseDir);

    // Check if file is within or accessible from base directory
    let relativePath = path.relative(baseDir, filePath);
    relativePath = relativePath.split(path.sep).join('/');

    return relativePath;
  }

  /**
   * Resolve a media path to absolute path
   * Paths in .nkv files are relative to the .nkv file location
   */
  private resolveMediaPath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Resolve relative to .nkv file directory
    const jviDir = path.dirname(this.model.uri.fsPath);
    const resolved = path.resolve(jviDir, filePath);
    return resolved;
  }

  /**
   * Handle file request from WebView
   * Uses webview URI for all media types (video, audio, image)
   * Avoids base64 encoding for better performance
   */
  private async handleRequestFile(filePath: string): Promise<void> {
    try {
      // Resolve path relative to .nkv file
      const absolutePath = this.resolveMediaPath(filePath);
      const fileUri = vscode.Uri.file(absolutePath);

      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        logger.error(`File not found: ${absolutePath}`);
        this.sendError(`File not found: ${filePath}`);
        return;
      }

      // Use webview URI for all media types (no base64 encoding)
      const webviewUri = this.webview.asWebviewUri(fileUri);
      this.webview.postMessage({
        type: 'fileUri',
        path: filePath,
        uri: webviewUri.toString(),
      });
    } catch (error) {
      logger.error('File request error', error);
      this.sendError(`Failed to load file: ${filePath}`);
    }
  }

  /**
   * Handle adding media to timeline
   */
  private async handleAddMedia(relativePath: string): Promise<void> {
    try {
      const ext = path.extname(relativePath).toLowerCase();
      let mediaType: 'video' | 'audio' | 'image';

      if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
        mediaType = 'video';
      } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
        mediaType = 'audio';
      } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        mediaType = 'image';
      } else {
        this.sendError(`Unsupported file type: ${ext}`);
        return;
      }

      this.webview.postMessage({
        type: 'fileAdded',
        path: relativePath,
        mediaType,
      });
    } catch (error) {
      logger.error('Add media error', error);
      this.sendError(`Failed to add media: ${relativePath}`);
    }
  }

  /**
   * Handle showing VSCode native context menu
   */
  private async handleShowContextMenu(menuId: string, items: ContextMenuItem[]): Promise<void> {
    try {
      const quickPickItems: vscode.QuickPickItem[] = items
        .filter((item) => !item.separator)
        .map((item) => ({
          label: item.label,
          description: item.shortcut,
          detail: item.disabled ? '(disabled)' : undefined,
        }));

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an action',
        canPickMany: false,
      });

      const selectedItem = items.find((item) => item.label === selected?.label);

      this.webview.postMessage({
        type: 'contextMenuResult',
        menuId,
        selectedId: selectedItem?.id,
      });
    } catch (error) {
      logger.error('Context menu error', error);
      this.webview.postMessage({
        type: 'contextMenuResult',
        menuId,
        selectedId: undefined,
      });
    }
  }

  // ==========================================================================
  // 导出处理方法
  // ==========================================================================

  /**
   * Handle showing export dialog and preparing write stream
   */
  private async handleShowExportDialog(filename: string, format: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
        filters: { Video: [format] },
        title: 'Export Video',
      });

      if (!saveUri) {
        this.webview.postMessage({
          type: 'exportDialogResult',
          success: false,
          cancelled: true,
        });
        return;
      }

      this._exportFilePath = saveUri.fsPath;
      this._exportWriteStream = fs.createWriteStream(this._exportFilePath);

      this._exportWriteStream.on('error', (error) => {
        logger.error('Write stream error', error);
        this.webview.postMessage({
          type: 'exportStreamError',
          error: error.message,
        });
      });

      this.webview.postMessage({
        type: 'exportDialogResult',
        success: true,
        path: saveUri.fsPath,
      });
    } catch (error) {
      logger.error('Show export dialog error', error);
      this.webview.postMessage({
        type: 'exportDialogResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to show export dialog',
      });
    }
  }

  /**
   * Handle writing export chunk to file
   */
  private async handleWriteExportChunk(data: ArrayBuffer): Promise<void> {
    if (!this._exportWriteStream || !this._exportFilePath) {
      logger.error('No export stream available');
      this.webview.postMessage({
        type: 'exportChunkResult',
        success: false,
        error: 'No export stream available',
      });
      return;
    }

    try {
      const buffer = Buffer.from(data);
      const canContinue = this._exportWriteStream.write(buffer);

      if (!canContinue) {
        await new Promise<void>((resolve) => {
          this._exportWriteStream!.once('drain', resolve);
        });
      }

      this.webview.postMessage({
        type: 'exportChunkResult',
        success: true,
      });
    } catch (error) {
      logger.error('Write chunk error:', error);
      this.webview.postMessage({
        type: 'exportChunkResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write chunk',
      });
    }
  }

  /**
   * Handle finalizing export
   */
  private async handleFinalizeExport(success: boolean, error?: string): Promise<void> {
    const filePath = this._exportFilePath;

    try {
      if (this._exportWriteStream) {
        await new Promise<void>((resolve, reject) => {
          this._exportWriteStream!.end((err: Error | null | undefined) => {
            if (err) reject(err);
            else resolve();
          });
        });
        this._exportWriteStream = null;
      }

      if (success && filePath) {
        this.webview.postMessage({
          type: 'exportComplete',
          success: true,
          path: filePath,
        });

        const selection = await vscode.window.showInformationMessage(
          `Video exported successfully: ${path.basename(filePath)}`,
          'Open File',
          'Open Folder',
        );

        if (selection === 'Open File') {
          vscode.env.openExternal(vscode.Uri.file(filePath));
        } else if (selection === 'Open Folder') {
          vscode.env.openExternal(vscode.Uri.file(path.dirname(filePath)));
        }
      } else {
        this.webview.postMessage({
          type: 'exportComplete',
          success: false,
          error: error || 'Export failed',
        });

        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (err) {
      logger.error('Finalize export error:', err);
      this.webview.postMessage({
        type: 'exportComplete',
        success: false,
        error: err instanceof Error ? err.message : 'Failed to finalize export',
      });
    } finally {
      this._exportFilePath = null;
    }
  }

  /**
   * Handle canceling export
   */
  private async handleCancelExport(): Promise<void> {
    try {
      const filePath = this._exportFilePath;

      if (this._exportWriteStream) {
        this._exportWriteStream.destroy();
        this._exportWriteStream = null;
      }

      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      this._exportFilePath = null;

      this.webview.postMessage({
        type: 'exportCancelled',
      });
    } catch (error) {
      logger.error('Cancel export error:', error);
    }
  }

  /**
   * Handle saving blob data from WebView (WebCodecs export)
   * Supports both binary ArrayBuffer (preferred) and base64 string (legacy)
   */
  private async handleSaveBlob(
    data: ArrayBuffer | string,
    filename: string,
    mimeType: string,
  ): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

      const extMap: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'image/gif': 'gif',
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      };
      const ext = extMap[mimeType] || 'mp4';

      // Determine if this is an image or video
      const isImage = mimeType.startsWith('image/');
      const filterLabel = isImage ? 'Image' : 'Video';
      const title = isImage ? 'Save Screenshot' : 'Save Exported Video';

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
        filters: { [filterLabel]: [ext] },
        title,
      });

      if (!saveUri) {
        this.webview.postMessage({
          type: 'blobSaveResult',
          success: false,
          cancelled: true,
        });
        return;
      }

      // Handle both binary (preferred) and base64 (legacy) formats
      let buffer: Buffer;
      if (typeof data === 'string') {
        // Legacy: base64 encoded string
        buffer = Buffer.from(data, 'base64');
      } else if (data instanceof ArrayBuffer) {
        // Preferred: direct ArrayBuffer
        buffer = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        // TypedArray or DataView
        buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      } else if (typeof data === 'object' && data !== null) {
        // Structured clone result (object with numeric keys)
        const values = Object.values(data as Record<string, number>);
        buffer = Buffer.from(values);
      } else {
        throw new Error('Invalid data format for blob save');
      }

      await vscode.workspace.fs.writeFile(saveUri, buffer);

      this.webview.postMessage({
        type: 'blobSaveResult',
        success: true,
        path: saveUri.fsPath,
      });

      const successMessage = isImage
        ? `Screenshot saved successfully: ${path.basename(saveUri.fsPath)}`
        : `Video exported successfully: ${path.basename(saveUri.fsPath)}`;

      const selection = await vscode.window.showInformationMessage(
        successMessage,
        'Open File',
        'Open Folder',
      );

      if (selection === 'Open File') {
        vscode.env.openExternal(saveUri);
      } else if (selection === 'Open Folder') {
        vscode.env.openExternal(vscode.Uri.file(path.dirname(saveUri.fsPath)));
      }
    } catch (error) {
      logger.error('Save blob error:', error);
      this.webview.postMessage({
        type: 'blobSaveResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file',
      });
    }
  }

  /**
   * Handle selecting export path before export starts
   * Shows save dialog and returns the selected path
   */
  private async handleSelectExportPath(filename: string, format: string): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

      const extMap: Record<string, string> = {
        mp4: 'mp4',
        webm: 'webm',
        gif: 'gif',
      };
      const ext = extMap[format] || 'mp4';

      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
        filters: { Video: [ext] },
        title: '选择导出位置',
      });

      if (!saveUri) {
        this.webview.postMessage({
          type: 'exportPathSelected',
          success: false,
          cancelled: true,
        });
        return;
      }

      this.webview.postMessage({
        type: 'exportPathSelected',
        success: true,
        path: saveUri.fsPath,
      });
    } catch (error) {
      logger.error('Select export path error:', error);
      this.webview.postMessage({
        type: 'exportPathSelected',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to select export path',
      });
    }
  }

  /**
   * Handle saving blob data to a pre-selected path (no dialog)
   */
  private async handleSaveBlobToPath(
    data: ArrayBuffer | string,
    filePath: string,
    mimeType: string,
  ): Promise<void> {
    try {
      // Handle both binary (preferred) and base64 (legacy) formats
      let buffer: Buffer;
      if (typeof data === 'string') {
        // Legacy: base64 encoded string
        buffer = Buffer.from(data, 'base64');
      } else if (data instanceof ArrayBuffer) {
        // Preferred: direct ArrayBuffer
        buffer = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        // TypedArray or DataView
        buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      } else if (typeof data === 'object' && data !== null) {
        // Structured clone result (object with numeric keys)
        const values = Object.values(data as Record<string, number>);
        buffer = Buffer.from(values);
      } else {
        throw new Error('Invalid data format for blob save');
      }

      const saveUri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.writeFile(saveUri, buffer);

      this.webview.postMessage({
        type: 'blobSaveResult',
        success: true,
        path: filePath,
      });

      // Determine if this is an image or video
      const isImage = mimeType.startsWith('image/');
      const successMessage = isImage
        ? `Screenshot saved successfully: ${path.basename(filePath)}`
        : `Video exported successfully: ${path.basename(filePath)}`;

      const selection = await vscode.window.showInformationMessage(
        successMessage,
        'Open File',
        'Open Folder',
      );

      if (selection === 'Open File') {
        vscode.env.openExternal(saveUri);
      } else if (selection === 'Open Folder') {
        vscode.env.openExternal(vscode.Uri.file(path.dirname(filePath)));
      }
    } catch (error) {
      logger.error('Save blob to path error:', error);
      this.webview.postMessage({
        type: 'blobSaveResult',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save file',
      });
    }
  }

  /**
   * Handle file range read request (for testing on-demand loading)
   * Uses Node.js fs API to read specific byte range from file
   */
  private async handleReadFileRange(
    requestId: string,
    filePath: string,
    start: number,
    end: number,
  ): Promise<void> {
    try {
      // Resolve path relative to .nkv file
      const absolutePath = this.resolveMediaPath(filePath);

      // Get file stats
      const stats = fs.statSync(absolutePath);
      const fileSize = stats.size;

      // Validate range
      const actualStart = Math.max(0, start);
      const actualEnd = Math.min(end, fileSize - 1);

      if (actualStart > actualEnd || actualStart >= fileSize) {
        this.webview.postMessage({
          type: 'fileRangeResult',
          requestId,
          success: false,
          error: `Invalid range: ${start}-${end} for file size ${fileSize}`,
        });
        return;
      }

      // Read specific range using Node.js fs
      const length = actualEnd - actualStart + 1;
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(absolutePath, 'r');

      try {
        fs.readSync(fd, buffer, 0, length, actualStart);
      } finally {
        fs.closeSync(fd);
      }

      // Convert to base64 for transfer
      const base64Data = buffer.toString('base64');

      logger.debug(
        `readFileRange: path=${filePath}, requested=${start}-${end}, actual=${actualStart}-${actualEnd}, size=${length}, fileSize=${fileSize}`,
      );

      this.webview.postMessage({
        type: 'fileRangeResult',
        requestId,
        success: true,
        data: base64Data,
        actualStart,
        actualEnd,
        fileSize,
      });
    } catch (error) {
      logger.error('File range read error:', error);
      this.webview.postMessage({
        type: 'fileRangeResult',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file range',
      });
    }
  }
}
