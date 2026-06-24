/**
 * Commands Module
 * VSCode 命令注册
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDefaultProject, type ProjectSourceAddResult } from '@neko/shared';
import { createNewFile } from '@neko/shared/vscode/extension';
import type { VideoProjectOutlineProvider } from '../views/outlineProvider';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { getLogger, handleError } from '../base';
import { addCutProjectSource } from '../editor/video/cutProjectSourceIngest';

const logger = getLogger('Commands');
import { registerTimelineCommands } from './timeline-commands';

type GeneratedClipMediaType = 'image' | 'video' | 'audio';
const TIMELINE_EDITOR_READY_TIMEOUT_MS = 5000;
const TIMELINE_EDITOR_READY_POLL_MS = 50;

function inferGeneratedClipMediaType(
  assetPath: string,
  mediaTypeHint?: string,
): GeneratedClipMediaType {
  if (mediaTypeHint === 'image' || mediaTypeHint === 'video' || mediaTypeHint === 'audio') {
    return mediaTypeHint;
  }

  const ext = path.extname(assetPath).toLowerCase();
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  return 'video';
}

/**
 * Register all extension commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  _outlineProvider: VideoProjectOutlineProvider,
  videoEditorProvider: VideoEditorProvider,
): void {
  // Command: New Video Project
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.newProject', async (uri?: vscode.Uri) => {
      await createNewFile({
        targetFolder: uri,
        ext: '.nkv',
        template: (title) => JSON.stringify(createDefaultProject(title), null, 2),
        noFolderErrorMessage: vscode.l10n.t('neko.newProject.noFolder'),
        onCreated: async (fileUri) => {
          logger.info(`Created video project: ${fileUri.fsPath}`);
          await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
        },
      });
    }),
  );

  // Command: Add to Timeline
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToTimeline', async (uri: vscode.Uri) => {
      await addToTimeline(uri, videoEditorProvider);
    }),
  );

  // Command: Open in Video Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.openInEditor', async (uri: vscode.Uri) => {
      await openInEditor(uri);
    }),
  );

  // Command: Select element from outline (internal)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.selectElement',
      async (trackId: string, elementId: string) => {
        // Get the active webview and send a message to select the element
        const webview = videoEditorProvider.getActiveWebview();

        if (!webview) {
          logger.warn('No active webview found for element selection');
          return;
        }

        // Send message to webview to select and jump to the element
        webview.postMessage({
          type: 'selectElement',
          trackId,
          elementId,
        });

        logger.debug(`Selecting element: track=${trackId}, element=${elementId}`);
      },
    ),
  );

  // Command: Show Export Panel (triggered from status bar)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.showExportPanel', async () => {
      const webview = videoEditorProvider.getActiveWebview();

      if (!webview) {
        // No active webview — try to reopen the document with active export
        const exportDocUri = videoEditorProvider.getExportingDocumentUri();
        if (exportDocUri) {
          const uri = vscode.Uri.parse(exportDocUri);
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoEditor');
          // The webview ready handler will auto-show the export panel
          return;
        }
        void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }

      // Focus the video editor panel first
      await videoEditorProvider.focusActiveEditor();

      // Send message to webview to open export panel
      webview.postMessage({
        type: 'showExportPanel',
      });
    }),
  );

  // Command: Export Video (non-Webview, uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.exportVideo', async () => {
      await exportVideoCommand(videoEditorProvider);
    }),
  );

  // Command: Import a generated media clip (image/video) into the active timeline
  // Used by neko-agent after AI generation completes (canvas_generate_image / sketch.generate)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.cut.importGeneratedClip',
      async (params?: {
        assetPath?: string;
        data?: string;
        type?: string;
        name?: string;
        mediaType?: string;
        duration?: number;
        trackIndex?: number;
      }) => {
        if (!params) {
          void handleError(new Error('Generated clip import requires assetPath or data bytes.'), {
            showToUser: true,
          });
          return;
        }
        await ensureTimelineEditorForGeneratedClip(params, videoEditorProvider);
        const webview = videoEditorProvider.getActiveWebview();
        const documentUri = videoEditorProvider.getActiveDocumentVsCodeUri();
        if (!webview || !documentUri) {
          void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
            showToUser: true,
            severity: 'warning',
          });
          return;
        }
        const assetPath = params.assetPath;
        const fileName = params.name
          ? ensureMediaFileExtension(params.name, params.mediaType ?? params.type)
          : assetPath
            ? path.basename(assetPath)
            : ensureMediaFileExtension('generated-clip', params.mediaType ?? params.type);
        const mediaType = inferGeneratedClipMediaType(
          assetPath ?? fileName,
          params.mediaType ?? params.type,
        );
        const bytes = typeof params.data === 'string' ? dataUrlToBytes(params.data) : undefined;
        if (!bytes && !assetPath) {
          void handleError(new Error('Generated clip import requires assetPath or data bytes.'), {
            showToUser: true,
          });
          return;
        }

        const result = await addCutProjectSource(documentUri, {
          requestId: `cut-import-generated-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          kind: 'generated-output',
          formatId: 'nkv',
          ...(assetPath ? { sourcePath: assetPath } : {}),
          ...(bytes ? { bytes } : {}),
          browserFile: {
            name: fileName,
            type: mimeTypeForMedia(fileName, mediaType),
            ...(bytes ? { size: bytes.byteLength } : {}),
          },
          destination: {
            kind: 'project',
            directory: 'media',
            copyMode: bytes ? 'copy' : 'link',
          },
          ingestMode: bytes ? 'create-asset' : 'link',
          metadata: {
            addToTimeline: true,
            mediaType,
            ...(params.duration !== undefined
              ? { duration: params.duration }
              : mediaType === 'image'
                ? { duration: 3 }
                : {}),
            ...(params.trackIndex !== undefined ? { trackIndex: params.trackIndex } : {}),
            name: fileName,
            sourceCommand: 'neko.cut.importGeneratedClip',
          },
        });
        await postProjectSourceAddResult(webview, result);

        logger.info(`importGeneratedClip: ${assetPath ?? fileName} (${mediaType})`);
      },
    ),
  );

  // Register timeline commands (element, track, effect, transition, animation, render, export)
  registerTimelineCommands(context, videoEditorProvider);
}

async function ensureTimelineEditorForGeneratedClip(
  params: {
    readonly assetPath?: string;
    readonly name?: string;
    readonly mediaType?: string;
    readonly type?: string;
  },
  editorProvider: VideoEditorProvider,
): Promise<void> {
  if (editorProvider.getActiveWebview() && editorProvider.getActiveDocumentVsCodeUri()) {
    await editorProvider.focusActiveEditor();
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const title = createGeneratedClipProjectName(params);
  const fileUri = await createAvailableTimelineFileUri(workspaceFolder.uri, title);
  await vscode.workspace.fs.writeFile(
    fileUri,
    Buffer.from(JSON.stringify(createDefaultProject(title), null, 2), 'utf-8'),
  );
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
  await waitForTimelineEditorReady(editorProvider, fileUri);
}

async function waitForTimelineEditorReady(
  editorProvider: VideoEditorProvider,
  fileUri: vscode.Uri,
): Promise<void> {
  const startedAt = Date.now();
  const documentUri = fileUri.toString();
  while (Date.now() - startedAt < TIMELINE_EDITOR_READY_TIMEOUT_MS) {
    if (
      editorProvider.getActiveDocumentVsCodeUri()?.toString() === documentUri &&
      editorProvider.getActiveWebview()
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, TIMELINE_EDITOR_READY_POLL_MS));
  }
  throw new Error('Timeline editor did not become ready before import.');
}

function createGeneratedClipProjectName(params: {
  readonly assetPath?: string;
  readonly name?: string;
  readonly mediaType?: string;
  readonly type?: string;
}): string {
  const sourceName =
    params.name?.trim() || (params.assetPath ? path.parse(params.assetPath).name : '');
  const mediaType = params.mediaType ?? params.type;
  const generatedName =
    mediaType === 'audio'
      ? 'Agent Audio Timeline'
      : mediaType === 'image'
        ? 'Agent Image Timeline'
        : 'Agent Timeline';
  return sanitizeTimelineFileName(sourceName).slice(0, 80) || generatedName;
}

async function createAvailableTimelineFileUri(
  folderUri: vscode.Uri,
  name: string,
): Promise<vscode.Uri> {
  const baseName = sanitizeTimelineFileName(name) || 'Agent Timeline';
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? '' : ` ${index + 1}`;
    const candidate = vscode.Uri.joinPath(folderUri, `${baseName}${suffix}.nkv`);
    try {
      await vscode.workspace.fs.stat(candidate);
    } catch {
      return candidate;
    }
  }
  return vscode.Uri.joinPath(folderUri, `${baseName}-${Date.now()}.nkv`);
}

function sanitizeTimelineFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Add a media file to the current timeline
 */
async function addToTimeline(
  fileUri: vscode.Uri,
  editorProvider: VideoEditorProvider,
): Promise<void> {
  // Get the active webview
  const webview = editorProvider.getActiveWebview();
  const documentUri = editorProvider.getActiveDocumentVsCodeUri();

  if (!webview || !documentUri) {
    void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
      showToUser: true,
      severity: 'warning',
    });
    return;
  }

  // Get file extension and determine media type
  const ext = path.extname(fileUri.fsPath).toLowerCase();
  let mediaType: 'video' | 'audio' | 'image';

  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) {
    mediaType = 'video';
  } else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) {
    mediaType = 'audio';
  } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
    mediaType = 'image';
  } else {
    void handleError(new Error(vscode.l10n.t('timeline.error.unsupportedType', { ext })), {
      showToUser: true,
    });
    return;
  }

  const result = await addCutProjectSource(documentUri, {
    requestId: `cut-add-to-timeline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind: 'programmatic',
    formatId: 'nkv',
    sourcePath: fileUri.fsPath,
    browserFile: {
      name: path.basename(fileUri.fsPath),
      type: mimeTypeForMedia(fileUri.fsPath, mediaType),
    },
    destination: {
      kind: 'project',
      directory: 'media',
      copyMode: 'link',
    },
    ingestMode: 'link',
    metadata: {
      addToTimeline: true,
      mediaType,
      name: path.basename(fileUri.fsPath),
      sourceCommand: 'neko.addToTimeline',
    },
  });
  await postProjectSourceAddResult(webview, result);
  if (!result.ok) return;

  vscode.window.showInformationMessage(
    vscode.l10n.t('timeline.info.addingToTimeline', {
      filename: path.basename(result.durablePath ?? fileUri.fsPath),
    }),
  );
}

/**
 * Open a .nkv file in the video editor
 */
async function openInEditor(fileUri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
}

async function postProjectSourceAddResult(
  webview: vscode.Webview,
  result: ProjectSourceAddResult,
): Promise<void> {
  await webview.postMessage({ type: 'project:sourceAdded', result });
  if (!result.ok) {
    const message =
      result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
      result.diagnostics[0]?.message ??
      'Failed to add media to timeline.';
    void handleError(new Error(message), { showToUser: true });
  }
}

function dataUrlToBytes(data: string): Uint8Array {
  const base64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  return Buffer.from(base64, 'base64');
}

function ensureMediaFileExtension(name: string, mediaTypeHint?: string): string {
  if (path.extname(name)) return name;
  if (mediaTypeHint === 'image') return `${name}.png`;
  if (mediaTypeHint === 'audio') return `${name}.wav`;
  return `${name}.mp4`;
}

function mimeTypeForMedia(filePath: string, mediaType: GeneratedClipMediaType): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (mediaType === 'image') return 'image/png';
  if (mediaType === 'audio') return 'audio/wav';
  return 'video/mp4';
}

/**
 * Export video using ExportService (non-Webview path)
 *
 * Shows a save dialog, reads project data from the active document,
 * and runs the export with a VSCode progress notification.
 */
async function exportVideoCommand(editorProvider: VideoEditorProvider): Promise<void> {
  const docUri = editorProvider.getActiveDocumentUri();
  if (!docUri) {
    void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
      showToUser: true,
      severity: 'warning',
    });
    return;
  }

  const exportService = editorProvider.getExportService(docUri);
  if (!exportService) {
    void handleError(new Error('Export service not available for this document.'), {
      showToUser: true,
    });
    return;
  }

  if (exportService.isExporting()) {
    void handleError(new Error('An export is already in progress.'), {
      showToUser: true,
      severity: 'warning',
    });
    return;
  }

  const project = editorProvider.getProjectDataForDocument(docUri);
  if (!project) {
    void handleError(new Error('Cannot read project data: document not found.'), {
      showToUser: true,
    });
    return;
  }

  // Show save dialog
  const defaultName = project.name ? `${project.name}.mp4` : 'export.mp4';
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(
      path.join(path.dirname(vscode.Uri.parse(docUri).fsPath), defaultName),
    ),
    filters: {
      'MP4 Video': ['mp4'],
      'WebM Video': ['webm'],
      'MOV Video': ['mov'],
      'MKV Video': ['mkv'],
    },
  });

  if (!saveUri) return; // User cancelled

  const ext = path.extname(saveUri.fsPath).toLowerCase().slice(1);
  const formatMap: Record<string, 'mp4' | 'webm' | 'mov' | 'mkv'> = {
    mp4: 'mp4',
    webm: 'webm',
    mov: 'mov',
    mkv: 'mkv',
  };
  const format = formatMap[ext] ?? 'mp4';

  const config: import('@neko/shared').ExportStartConfig = {
    outputPath: saveUri.fsPath,
    format,
    width: project.resolution?.width ?? 1920,
    height: project.resolution?.height ?? 1080,
    fps: project.fps ?? 30,
    quality: 'medium',
    audioBitrate: 192000,
  };

  // Run export with progress notification
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Exporting ${path.basename(saveUri.fsPath)}`,
      cancellable: true,
    },
    async (progress, token) => {
      return new Promise<void>((resolve) => {
        const disposables: vscode.Disposable[] = [];

        // Subscribe to events
        disposables.push(
          exportService.onDidProgress((p) => {
            progress.report({
              message: `${p.progress}% — Frame ${p.currentFrame}/${p.totalFrames}`,
              increment: undefined,
            });
          }),
        );

        disposables.push(
          exportService.onDidComplete((result) => {
            cleanup();
            if (result.success) {
              vscode.window.showInformationMessage(
                `Export completed: ${path.basename(saveUri.fsPath)}`,
              );
            }
            resolve();
          }),
        );

        disposables.push(
          exportService.onDidError((error) => {
            cleanup();
            handleError(error, { showToUser: true, severity: 'error' });
            resolve();
          }),
        );

        disposables.push(
          exportService.onDidCancel(() => {
            cleanup();
            vscode.window.showInformationMessage('Export cancelled.');
            resolve();
          }),
        );

        // Handle cancellation from progress notification
        token.onCancellationRequested(() => {
          exportService.cancelExport().catch(() => {});
        });

        function cleanup() {
          for (const d of disposables) {
            d.dispose();
          }
        }

        // Start the export
        exportService.startExport(project, config).catch((error) => {
          cleanup();
          handleError(error, { showToUser: true, severity: 'error' });
          resolve();
        });
      });
    },
  );
}
