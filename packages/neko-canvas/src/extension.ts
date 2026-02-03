/**
 * NekoCanvas Extension - Canvas editor and asset library for VSCode
 *
 * This is the main entry point for the NekoCanvas extension.
 * It provides canvas editing and asset management capabilities.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // New Canvas
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.new', async (uri?: vscode.Uri) => {
      let targetFolder: string;
      if (uri) {
        targetFolder = uri.fsPath;
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showErrorMessage('Please open a folder first');
          return;
        }
        targetFolder = folders[0].uri.fsPath;
      }

      const canvasName = await vscode.window.showInputBox({
        prompt: 'Enter canvas name',
        value: 'Untitled',
      });

      if (!canvasName) return;

      const canvasFile = path.join(targetFolder, `${canvasName}.jvc`);
      const defaultCanvas = {
        version: '1.0.0',
        name: canvasName,
        width: 1920,
        height: 1080,
        backgroundColor: '#ffffff',
        shapes: [],
      };

      try {
        fs.writeFileSync(canvasFile, JSON.stringify(defaultCanvas, null, 2));
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(canvasFile));
        await vscode.commands.executeCommand('vscode.openWith', doc.uri, 'neko.canvasEditor');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create canvas: ${error}`);
      }
    })
  );

  // Add to Asset Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToAssetLibrary', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      await assetLibraryProvider.importAsset(uri.fsPath);
      vscode.window.showInformationMessage(`Added ${path.basename(uri.fsPath)} to asset library`);
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
        vscode.window.showInformationMessage(`Imported ${uris.length} asset(s)`);
      }
    })
  );
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
  const canvasData = {
    version: '1.0.0',
    name: config.name,
    width: config.width,
    height: config.height,
    backgroundColor: config.backgroundColor || '#ffffff',
    shapes: [],
  };

  fs.writeFileSync(canvasFile, JSON.stringify(canvasData, null, 2));
  return canvasFile;
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  console.log('[NekoCanvas] Deactivating extension...');
}
