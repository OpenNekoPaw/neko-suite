/**
 * Commands Module
 * VSCode 命令注册
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDefaultProject, DEFAULT_CANVAS_DATA } from '@neko/shared';
import { ToolRegistry } from '@neko/agent';
import type { VideoProjectOutlineProvider } from '../views/outlineProvider';
import type { VideoEditorProvider } from '../editor/video/videoEditorProvider';
import type { ChatViewProvider } from '../chat/chatProvider';
import type { AssetLibraryViewProvider } from '../assetLibrary/assetLibraryViewProvider';
import { registerTimelineCommands } from './timeline-commands';
import { registerAICommands } from './ai-commands';
import { registerScriptCommands } from './scriptCommands';
import { getService } from '../base';
import { IAssetService, type AssetService } from '../services/AssetService';

/**
 * Register all extension commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  _outlineProvider: VideoProjectOutlineProvider,
  videoEditorProvider: VideoEditorProvider,
  toolRegistry?: ToolRegistry,
  chatProvider?: ChatViewProvider,
  assetLibraryProvider?: AssetLibraryViewProvider
): void {
  // Command: New Video Project
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.newProject', async (uri: vscode.Uri) => {
      await createNewProject(uri);
    })
  );

  // Command: New Canvas
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.canvas.new', async (uri: vscode.Uri) => {
      await createNewCanvas(uri);
    })
  );

  // Command: Add to Timeline
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.addToTimeline', async (uri: vscode.Uri) => {
      await addToTimeline(uri, videoEditorProvider);
    })
  );

  // Command: Add to Asset Library
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.addToAssetLibrary', async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
      await addToAssetLibrary(uri, uris, assetLibraryProvider);
    })
  );

  // Command: Open in Video Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.openInEditor', async (uri: vscode.Uri) => {
      await openInEditor(uri);
    })
  );

  // Command: Open AI Assistant in secondary sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.openAIAssistant', async () => {
      // Focus the AI Assistant view and move it to secondary sidebar
      await vscode.commands.executeCommand('uniedit.aiAssistant.focus');
      await vscode.commands.executeCommand('workbench.action.moveViewToSecondarySidebar', 'uniedit.aiAssistant');
    })
  );

  // Command: Select element from outline (internal)
  context.subscriptions.push(
    vscode.commands.registerCommand('uniedit.selectElement', async (trackId: string, elementId: string) => {
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
    vscode.commands.registerCommand('uniedit.showExportPanel', async () => {
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

  // Register timeline commands (element, track, effect, transition, animation, render, export)
  registerTimelineCommands(context, videoEditorProvider);

  // Register AI commands (generation, analysis, document)
  if (toolRegistry) {
    registerAICommands(context, toolRegistry);
  }

  // Register script commands (editor context menu)
  if (chatProvider) {
    registerScriptCommands(context, chatProvider);
  }
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
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'uniedit.videoEditor');

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
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'uniedit.canvasEditor');

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
  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'uniedit.videoEditor');
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
