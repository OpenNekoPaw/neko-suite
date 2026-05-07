/**
 * Commands Module
 * VSCode 命令注册
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDefaultProject } from '@neko/shared';
import { createNewFile } from '@neko/shared/vscode/extension';
import type { VideoProjectOutlineProvider } from '../views/outlineProvider';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { getLogger, handleError } from '../base';

const logger = getLogger('Commands');
import { registerTimelineCommands } from './timeline-commands';

type GeneratedClipMediaType = 'image' | 'video' | 'audio';

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
      async (params: {
        assetPath: string;
        mediaType?: string;
        duration?: number;
        trackIndex?: number;
      }) => {
        const webview = videoEditorProvider.getActiveWebview();
        if (!webview) {
          void handleError(new Error(vscode.l10n.t('editor.warning.noProjectOpen')), {
            showToUser: true,
            severity: 'warning',
          });
          return;
        }
        const mediaType = inferGeneratedClipMediaType(params.assetPath, params.mediaType);

        webview.postMessage({
          type: 'importGeneratedClip',
          assetPath: params.assetPath,
          mediaType,
          duration: params.duration ?? (mediaType === 'image' ? 3 : undefined),
          trackIndex: params.trackIndex,
        });

        logger.info(`importGeneratedClip: ${params.assetPath} (${mediaType})`);
      },
    ),
  );

  // Register timeline commands (element, track, effect, transition, animation, render, export)
  registerTimelineCommands(context, videoEditorProvider);
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

  if (!webview) {
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

  // Get relative path from workspace
  const relativePath = vscode.workspace.asRelativePath(fileUri);

  // Send message to webview to add the media
  webview.postMessage({
    type: 'addMediaFile',
    path: relativePath,
    mediaType,
  });

  vscode.window.showInformationMessage(
    vscode.l10n.t('timeline.info.addingToTimeline', { filename: path.basename(relativePath) }),
  );
}

/**
 * Open a .nkv file in the video editor
 */
async function openInEditor(fileUri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
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

  // Read project data from document
  const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === docUri);
  if (!document) {
    void handleError(new Error('Cannot read project data: document not found.'), {
      showToUser: true,
    });
    return;
  }

  let project: import('@neko/shared').ProjectData;
  try {
    project = JSON.parse(document.getText()) as import('@neko/shared').ProjectData;
  } catch {
    void handleError(new Error('Cannot parse project data.'), { showToUser: true });
    return;
  }

  // Show save dialog
  const defaultName = project.name ? `${project.name}.mp4` : 'export.mp4';
  const saveUri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), defaultName)),
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
