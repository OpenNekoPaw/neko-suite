/**
 * NekoCanvas Extension - Canvas editor and asset library for VSCode
 *
 * This is the main entry point for the NekoCanvas extension.
 * It provides canvas editing and asset management capabilities.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { CanvasEditorProvider } from './editor';
import { AssetLibraryProvider } from './views';
import type { NekoCanvasAPI, CanvasConfig } from './api';

// Extension state
let canvasEditorProvider: CanvasEditorProvider;
let assetLibraryProvider: AssetLibraryProvider;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): NekoCanvasAPI {
  console.log('[NekoCanvas] Activating extension...');

  // Create providers
  canvasEditorProvider = new CanvasEditorProvider(context);
  assetLibraryProvider = new AssetLibraryProvider(context);

  // Register custom editor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CanvasEditorProvider.viewType,
      canvasEditorProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Register asset library view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AssetLibraryProvider.viewType,
      assetLibraryProvider
    )
  );

  // Register commands
  registerCommands(context);

  console.log('[NekoCanvas] Extension activated');

  // Return API for other extensions
  const api: NekoCanvasAPI = {
    asset: {
      import: (filePath) => assetLibraryProvider.importAsset(filePath),
      list: (filter) => assetLibraryProvider.listAssets(filter),
      getById: (id) => assetLibraryProvider.getAssetById(id),
      delete: (id) => assetLibraryProvider.deleteAsset(id),
      update: (id, updates) => assetLibraryProvider.updateAsset(id, updates),
    },
    canvas: {
      create: (config) => createCanvas(config),
      addShape: (canvasId, shape) => canvasEditorProvider.addShape(shape),
      updateShape: (canvasId, shapeId, updates) => canvasEditorProvider.updateShape(shapeId, updates),
      deleteShape: (canvasId, shapeId) => canvasEditorProvider.deleteShape(shapeId),
    },
    events: {
      onDidChangeAssets: assetLibraryProvider.onDidChangeAssets,
      onDidChangeCanvas: canvasEditorProvider.onDidChangeCanvas,
    },
  };

  return api;
}

/**
 * Get default canvas data for new files
 */
function getCanvasTemplate(name: string): string {
  const data = {
    version: '1.0',
    name,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [],
    connections: [],
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // New Canvas - create file with inline rename (like neko-story)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.new', async (uri?: vscode.Uri) => {
      // Determine target folder from context menu uri or workspace root
      let targetFolder: vscode.Uri | undefined = uri;
      if (!targetFolder) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
          targetFolder = workspaceFolders[0]?.uri;
        }
      }
      if (!targetFolder) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.canvas.new.noFolder'));
        return;
      }

      // Generate a unique default file name (Untitled.jvc, Untitled-1.jvc, ...)
      const baseName = 'Untitled';
      const ext = '.jvc';
      let fileName = `${baseName}${ext}`;
      let fileUri = vscode.Uri.joinPath(targetFolder, fileName);
      let counter = 1;
      while (true) {
        try {
          await vscode.workspace.fs.stat(fileUri);
          // File exists, try next name
          fileName = `${baseName}-${counter}${ext}`;
          fileUri = vscode.Uri.joinPath(targetFolder, fileName);
          counter++;
        } catch {
          // File does not exist — use this name
          break;
        }
      }

      try {
        // Create file with template content
        const title = fileName.replace(/\.jvc$/, '');
        const content = getCanvasTemplate(title);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));

        // Reveal in explorer, wait for file tree to refresh, then trigger inline rename
        await vscode.commands.executeCommand('revealInExplorer', fileUri);
        // Small delay to ensure the file is selected in the explorer tree
        await new Promise(resolve => setTimeout(resolve, 200));
        await vscode.commands.executeCommand('renameFile');
      } catch (error) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.canvas.new.failed', String(error)));
      }
    })
  );

  // Add to Asset Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToAssetLibrary', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.canvas.addToAssetLibrary.noFile'));
        return;
      }

      await assetLibraryProvider.importAsset(uri.fsPath);
      vscode.window.showInformationMessage(
        vscode.l10n.t('neko.canvas.addToAssetLibrary.success', path.basename(uri.fsPath))
      );
    })
  );

  // Import Asset
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.asset.import', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: {
          'Media Files': ['mp4', 'mov', 'avi', 'mp3', 'wav', 'png', 'jpg', 'gif'],
          'All Files': ['*'],
        },
      });

      if (uris) {
        for (const uri of uris) {
          await assetLibraryProvider.importAsset(uri.fsPath);
        }
        vscode.window.showInformationMessage(
          vscode.l10n.t('neko.canvas.asset.import.success', String(uris.length))
        );
      }
    })
  );

  // Canvas keyboard shortcuts - forwarded to webview
  const keyboardActions = [
    'neko.canvas.deleteSelected',
    'neko.canvas.escape',
    'neko.canvas.selectAll',
    'neko.canvas.undo',
    'neko.canvas.redo',
  ];
  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.canvas.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        canvasEditorProvider.postKeyboardAction(action);
      })
    );
  }
}

/**
 * Create a new canvas file
 */
async function createCanvas(config: CanvasConfig): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder open');
  }

  const canvasFile = path.join(folders[0].uri.fsPath, `${config.name}.jvc`);
  const content = getCanvasTemplate(config.name);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(canvasFile),
    Buffer.from(content, 'utf-8')
  );
  return canvasFile;
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  console.log('[NekoCanvas] Deactivating extension...');
}
