/**
 * Commands Module
 * VSCode 命令注册
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDefaultProject, DEFAULT_CANVAS_DATA } from '@neko/shared';
import type { VideoProjectOutlineProvider } from '../views/outlineProvider';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import { registerTimelineCommands } from './timeline-commands';
import { getService } from '../base';
import { IAssetService, type AssetService } from '../services/AssetService';

/**
 * Asset Library View Provider interface (optional)
 */
interface AssetLibraryViewProvider {
  postMessage(message: Record<string, unknown>): void;
}

/**
 * Register all extension commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  _outlineProvider: VideoProjectOutlineProvider,
  videoEditorProvider: VideoEditorProvider,
  assetLibraryProvider?: AssetLibraryViewProvider
): void {
  // Command: New Video Project
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.newProject', async (uri: vscode.Uri) => {
      await createNewProject(uri);
    })
  );

  // Command: New Canvas
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.new', async (uri: vscode.Uri) => {
      await createNewCanvas(uri);
    })
  );

  // Command: Add to Timeline
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToTimeline', async (uri: vscode.Uri) => {
      await addToTimeline(uri, videoEditorProvider);
    })
  );

  // Command: Add to Asset Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToAssetLibrary', async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
      await addToAssetLibrary(uri, uris, assetLibraryProvider);
    })
  );

  // Command: Open in Video Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.openInEditor', async (uri: vscode.Uri) => {
      await openInEditor(uri);
    })
  );

  // Command: Select element from outline (internal)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.selectElement', async (trackId: string, elementId: string) => {
      // Get the active webview and send a message to select the element
      const webview = videoEditorProvider.getActiveWebview();

      if (!webview) {
        console.warn('No active webview found for element selection');
        return;
      }

      // Send message to webview to select and jump to the element
      webview.postMessage({
        type: 'selectElement',
        trackId,
        elementId,
      });

      console.log(`Selecting element: track=${trackId}, element=${elementId}`);
    })
  );

  // Command: Show Export Panel (triggered from status bar)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.showExportPanel', async () => {
      const webview = videoEditorProvider.getActiveWebview();

      if (!webview) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('editor.warning.noProjectOpen')
        );
        return;
      }

      // Focus the video editor panel first
      await videoEditorProvider.focusActiveEditor();

      // Send message to webview to open export panel
      webview.postMessage({
        type: 'showExportPanel',
      });
    })
  );

  // Command: Export Video (non-Webview, uses ExportService directly)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.exportVideo', async () => {
      await exportVideoCommand(videoEditorProvider);
    })
  );

  // Register timeline commands (element, track, effect, transition, animation, render, export)
  registerTimelineCommands(context, videoEditorProvider);
}

/**
 * Create a new .jvi project file
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
  const fileName = `${projectName.replace(/\s+/g, '-').toLowerCase()}.jvi`;
  const fileUri = vscode.Uri.joinPath(folderUri, fileName);

  // Check if file already exists
  try {
    await vscode.workspace.fs.stat(fileUri);
    const overwrite = await vscode.window.showWarningMessage(
      vscode.l10n.t('project.warning.fileExists', { filename: fileName }),
      vscode.l10n.t('common.yes'),
      vscode.l10n.t('common.no')
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

  vscode.window.showInformationMessage(vscode.l10n.t('project.success.created', { filename: fileName }));
}

/**
 * Create a new .jvc canvas file
 */
async function createNewCanvas(folderUri: vscode.Uri): Promise<void> {
  // Ask for canvas name
  const canvasName = await vscode.window.showInputBox({
    prompt: 'Enter canvas name',
    value: 'New Canvas',
    validateInput: (value) => {
      if (!value || value.trim() === '') {
        return 'Canvas name cannot be empty';
      }
      if (/[<>:"/\\|?*]/.test(value)) {
        return 'Canvas name contains invalid characters';
      }
      return null;
    },
  });

  if (!canvasName) {
    return; // User cancelled
  }

  // Create the canvas file
  const fileName = `${canvasName.replace(/\\s+/g, '-').toLowerCase()}.jvc`;
  const fileUri = vscode.Uri.joinPath(folderUri, fileName);

  // Check if file already exists
  try {
    await vscode.workspace.fs.stat(fileUri);
    const overwrite = await vscode.window.showWarningMessage(
      `File "${fileName}" already exists. Overwrite?`,
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return;
    }
  } catch {
    // File doesn't exist, which is fine
  }

  // Create default canvas content
  const canvasData = { ...DEFAULT_CANVAS_DATA, name: canvasName };
  const content = JSON.stringify(canvasData, null, 2);

  // Write the file
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

  // Open the file in the canvas editor
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.canvasEditor');

  vscode.window.showInformationMessage(`Canvas "${fileName}" created successfully`);
}

/**
 * Add a media file to the current timeline
 */
async function addToTimeline(fileUri: vscode.Uri, editorProvider: VideoEditorProvider): Promise<void> {
  // Get the active webview
  const webview = editorProvider.getActiveWebview();

  if (!webview) {
    vscode.window.showWarningMessage(
      vscode.l10n.t('editor.warning.noProjectOpen')
    );
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
    vscode.l10n.t('timeline.info.addingToTimeline', { filename: path.basename(relativePath) })
  );
}

/**
 * Open a .jvi file in the video editor
 */
async function openInEditor(fileUri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'neko.videoEditor');
}

/**
 * Add media file(s) to the asset library
 */
async function addToAssetLibrary(uri: vscode.Uri, uris?: vscode.Uri[], assetLibraryProvider?: AssetLibraryViewProvider): Promise<void> {
  const assetService = getService<AssetService>(IAssetService);
  if (!assetService) {
    vscode.window.showErrorMessage(vscode.l10n.t('assetLibrary.error.serviceUnavailable'));
    return;
  }

  // Get all URIs (handle both single and multi-select)
  const allUris = uris && uris.length > 0 ? uris : [uri];
  const supportedExtensions = [
    // Video
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v',
    // Audio
    '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
    // Image
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg',
    // Text
    '.txt', '.md', '.json', '.srt', '.vtt', '.ass', '.ssa',
  ];

  // Filter to supported files
  const validUris = allUris.filter(u => {
    const ext = path.extname(u.fsPath).toLowerCase();
    return supportedExtensions.includes(ext);
  });

  if (validUris.length === 0) {
    vscode.window.showWarningMessage(vscode.l10n.t('assetLibrary.warning.noSupportedFiles'));
    return;
  }

  // Import files with progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('assetLibrary.progress.adding'),
      cancellable: false,
    },
    async (progress) => {
      let imported = 0;
      const total = validUris.length;

      for (const fileUri of validUris) {
        try {
          progress.report({
            message: `${imported + 1}/${total}: ${path.basename(fileUri.fsPath)}`,
            increment: (100 / total),
          });

          await assetService.importFile(fileUri.fsPath, { autoClassify: true });
          imported++;
        } catch (error) {
          console.error(`[AssetLibrary] Failed to import ${fileUri.fsPath}:`, error);
          vscode.window.showErrorMessage(
            vscode.l10n.t('assetLibrary.error.importFailed', { filename: path.basename(fileUri.fsPath) })
          );
        }
      }

      if (imported > 0) {
        vscode.window.showInformationMessage(
          vscode.l10n.t('assetLibrary.success.added', { count: imported })
        );

        // Notify webview to refresh asset list
        if (assetLibraryProvider) {
          assetLibraryProvider.postMessage({
            type: 'asset:importResults',
            payload: [],  // Empty payload triggers refresh
          });
        }
      }
    }
  );
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
    vscode.window.showWarningMessage(
      vscode.l10n.t('editor.warning.noProjectOpen')
    );
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
  const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === docUri);
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
    mp4: 'mp4', webm: 'webm', mov: 'mov', mkv: 'mkv',
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
          exportService.onDidProgress(p => {
            progress.report({
              message: `${p.progress}% — Frame ${p.currentFrame}/${p.totalFrames}`,
              increment: undefined,
            });
          })
        );

        disposables.push(
          exportService.onDidComplete(result => {
            cleanup();
            if (result.success) {
              vscode.window.showInformationMessage(
                `Export completed: ${path.basename(saveUri.fsPath)}`
              );
            }
            resolve();
          })
        );

        disposables.push(
          exportService.onDidError(error => {
            cleanup();
            vscode.window.showErrorMessage(`Export failed: ${error}`);
            resolve();
          })
        );

        disposables.push(
          exportService.onDidCancel(() => {
            cleanup();
            vscode.window.showInformationMessage('Export cancelled.');
            resolve();
          })
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
        exportService.startExport(project, config).catch(error => {
          cleanup();
          vscode.window.showErrorMessage(`Failed to start export: ${error}`);
          resolve();
        });
      });
    }
  );
}
