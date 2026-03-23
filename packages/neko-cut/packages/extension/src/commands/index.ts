/**
 * Commands Module
 * VSCode 命令注册
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDefaultProject } from '@neko/shared';
import type { VideoProjectOutlineProvider } from '../views/outlineProvider';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { getLogger, handleError } from '../base';

const logger = getLogger('Commands');
import { registerTimelineCommands } from './timeline-commands';
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
    vscode.commands.registerCommand('neko.newProject', async (uri: vscode.Uri) => {
      await createNewProject(uri);
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
        vscode.window.showWarningMessage(vscode.l10n.t('editor.warning.noProjectOpen'));
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

  // Register timeline commands (element, track, effect, transition, animation, render, export)
  registerTimelineCommands(context, videoEditorProvider);
}

/**
 * Create a new .nkv project file
 */
async function createNewProject(folderUri: vscode.Uri): Promise<void> {
  // Ask for project name
  const projectName = await vscode.window.showInputBox({
    prompt: vscode.l10n.t('project.prompt.enterName'),
    value: vscode.l10n.t('project.defaultName'),
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return vscode.l10n.t('project.validation.nameEmpty');
      }
      // Check for invalid filename characters
      if (/[<>:"/\\|?*]/.test(value)) {
        return vscode.l10n.t('project.validation.invalidChars');
      }
      return null;
    },
  });

  if (!projectName) {
    return; // User cancelled
  }

  // Create the project file
  const fileName = `${projectName.replace(/\s+/g, '-').toLowerCase()}.nkv`;
  const fileUri = vscode.Uri.joinPath(folderUri, fileName);

  // Check if file already exists
  try {
    await vscode.workspace.fs.stat(fileUri);
    const overwrite = await vscode.window.showWarningMessage(
      vscode.l10n.t('project.warning.fileExists', { filename: fileName }),
      vscode.l10n.t('common.yes'),
      vscode.l10n.t('common.no'),
    );
    if (overwrite !== vscode.l10n.t('common.yes')) {
      return;
    }
  } catch {
    // File doesn't exist, which is fine
  }

  // Create default project content
  const projectData = createDefaultProject(projectName);
  const content = JSON.stringify(projectData, null, 2);

  // Write the file
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

  // Open the file in the video editor
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');

  vscode.window.showInformationMessage(
    vscode.l10n.t('project.success.created', { filename: fileName }),
  );
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
    vscode.window.showWarningMessage(vscode.l10n.t('editor.warning.noProjectOpen'));
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
    vscode.window.showErrorMessage(vscode.l10n.t('timeline.error.unsupportedType', { ext }));
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
    vscode.window.showWarningMessage(vscode.l10n.t('editor.warning.noProjectOpen'));
    return;
  }

  const exportService = editorProvider.getExportService(docUri);
  if (!exportService) {
    vscode.window.showErrorMessage('Export service not available for this document.');
    return;
  }

  if (exportService.isExporting()) {
    vscode.window.showWarningMessage('An export is already in progress.');
    return;
  }

  // Read project data from document
  const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === docUri);
  if (!document) {
    vscode.window.showErrorMessage('Cannot read project data: document not found.');
    return;
  }

  let project: import('@neko/shared').ProjectData;
  try {
    project = JSON.parse(document.getText()) as import('@neko/shared').ProjectData;
  } catch {
    vscode.window.showErrorMessage('Cannot parse project data.');
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
