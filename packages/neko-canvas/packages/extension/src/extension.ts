/**
 * NekoCanvas Extension - Canvas editor and asset library for VSCode
 *
 * This is the main entry point for the NekoCanvas extension.
 * It provides canvas editing and asset management capabilities.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  createNewFile,
} from '@neko/shared/vscode/extension';
import { CanvasEditorProvider } from './editor';
import { CanvasOutlineProvider, CanvasStatusBar } from './views';
import type { NekoCanvasAPI, CanvasConfig } from './api';
import type { ISkillProvider, SkillDef } from '@neko/shared';
import { setRootLogger, getRootLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';

// Extension state
let canvasEditorProvider: CanvasEditorProvider;
let canvasOutlineProvider: CanvasOutlineProvider;
let canvasStatusBar: CanvasStatusBar;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): NekoCanvasAPI & ISkillProvider {
  const rootLogger = createVSCodeLogger('Neko Canvas', 'NekoCanvas', context);
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  const logger = getRootLogger();

  logger.info('Activating extension...');

  // Create providers
  canvasEditorProvider = new CanvasEditorProvider(context);
  canvasOutlineProvider = new CanvasOutlineProvider();
  canvasStatusBar = new CanvasStatusBar();

  // Wire providers into editor provider for data sync
  canvasEditorProvider.setProviders({
    outline: canvasOutlineProvider,
    statusBar: canvasStatusBar,
  });

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
      },
    ),
  );

  // Register outline tree view
  context.subscriptions.push(
    vscode.window.createTreeView('neko.canvasOutline', {
      treeDataProvider: canvasOutlineProvider,
      showCollapseAll: true,
    }),
  );

  // Register disposables
  context.subscriptions.push(canvasOutlineProvider);
  context.subscriptions.push(canvasStatusBar);

  // Show/hide status bar based on active editor
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      // Custom editors don't trigger this, but when switching away to a text editor, hide
      canvasStatusBar.hide();
    }),
  );

  // Register commands
  registerCommands(context);

  // Register plugin slash commands into neko-agent chat panel
  registerAgentSlashCommands(context);

  logger.info('Extension activated');

  // Return API for other extensions
  // Asset operations now delegate to neko-assets via commands
  const api: NekoCanvasAPI & ISkillProvider = {
    asset: {
      import: async (filePath) => {
        await vscode.commands.executeCommand('neko.assets.importFile', vscode.Uri.file(filePath));
        const name = filePath.split('/').pop() || 'Unknown';
        return {
          id: '',
          name,
          type: 'other',
          path: filePath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      list: async () => [],
      getById: async () => undefined,
      delete: async () => {},
      update: async () => {},
    },
    canvas: {
      create: (config) => createCanvas(config),
      addShape: (canvasId, shape) => canvasEditorProvider.addShape(shape),
      updateShape: (canvasId, shapeId, updates) =>
        canvasEditorProvider.updateShape(shapeId, updates),
      deleteShape: (canvasId, shapeId) => canvasEditorProvider.deleteShape(shapeId),
    },
    nodes: {
      list: (type) => canvasEditorProvider.listNodes(type),
      get: (nodeId) => canvasEditorProvider.getNode(nodeId),
      update: (nodeId, data) => canvasEditorProvider.updateNode(nodeId, data),
      create: (type, position, data) => canvasEditorProvider.createNode(type, position, data),
      generateImage: (nodeId, cellId) => canvasEditorProvider.generateImageForNode(nodeId, cellId),
      generateBatch: (nodeIds) => canvasEditorProvider.generateBatchForNodes(nodeIds),
      onSelectionChange: canvasEditorProvider.onSelectionChange,
    },
    events: {
      onDidChangeAssets: new vscode.EventEmitter<import('./api').AssetChangeEvent>().event,
      onDidChangeCanvas: canvasEditorProvider.onDidChangeCanvas,
    },

    // ── P3: ISkillProvider ────────────────────────────────────────────────────
    getSkills(): readonly SkillDef[] {
      return [
        {
          id: 'batch-generate',
          name: 'Batch Generate Images',
          description:
            'Trigger AI image generation for all shot nodes on the active storyboard canvas. ' +
            'Runs up to 2 generations in parallel with automatic retry on failure.',
          icon: '$(images)',
          command: 'neko.nekocanvas.slashCommand.batch',
          tags: ['generation', 'image', 'storyboard', 'batch'],
        },
        {
          id: 'export-storyboard',
          name: 'Export Storyboard',
          description:
            'Export the current storyboard canvas as a PDF document or ZIP archive of shot images.',
          icon: '$(package)',
          command: 'neko.nekocanvas.slashCommand.export',
          tags: ['export', 'storyboard', 'pdf', 'zip'],
        },
        {
          id: 'generate-selected',
          name: 'Generate Image for Selected Shot',
          description:
            'Trigger AI image generation for the currently selected shot node on the canvas.',
          icon: '$(sparkle)',
          command: 'neko.canvas.generateSelected',
          tags: ['generation', 'image', 'shot'],
        },
      ];
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
      try {
        await createNewFile({
          targetFolder: uri,
          ext: '.nkc',
          template: (title) => getCanvasTemplate(title),
          noFolderErrorMessage: vscode.l10n.t('neko.canvas.new.noFolder'),
        });
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // Add to Asset Library — delegate to neko-assets
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.addToAssetLibrary', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(vscode.l10n.t('neko.canvas.addToAssetLibrary.noFile'));
        return;
      }

      await vscode.commands.executeCommand('neko.assets.importFile', uri);
      vscode.window.showInformationMessage(
        vscode.l10n.t('neko.canvas.addToAssetLibrary.success', path.basename(uri.fsPath)),
      );
    }),
  );

  // Import Asset — delegate to neko-assets
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.asset.import', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: {
          'Media Files': [
            'mp4',
            'mov',
            'avi',
            'mkv',
            'webm',
            'mp3',
            'wav',
            'ogg',
            'flac',
            'aac',
            'png',
            'jpg',
            'jpeg',
            'gif',
            'webp',
          ],
          'All Files': ['*'],
        },
      });

      if (uris) {
        for (const uri of uris) {
          await vscode.commands.executeCommand('neko.assets.importFile', uri);
        }
        vscode.window.showInformationMessage(
          vscode.l10n.t('neko.canvas.asset.import.success', String(uris.length)),
        );
      }
    }),
  );

  // Import GeneratedAsset from another plugin (ADR-5 P0)
  // Receives a GeneratedAsset JSON payload (or { path } shorthand) from agent/other extensions
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.importAsset',
      async (asset?: { path?: string; type?: string }) => {
        if (!asset?.path) {
          vscode.window.showWarningMessage('neko.canvas.importAsset: missing asset path');
          return;
        }

        // Forward to the active canvas editor via a public method
        const accepted = canvasEditorProvider.postImportAsset(asset);
        if (!accepted) {
          vscode.window.showInformationMessage(
            'Open a canvas file (.nkc) first, then try "Send to Canvas" again.',
          );
          return;
        }

        logger.info(`importAsset: received ${asset.path} (${asset.type ?? 'unknown'})`);
      },
    ),
  );

  // Canvas keyboard shortcuts - forwarded to webview
  const keyboardActions = [
    'neko.canvas.deleteSelected',
    'neko.canvas.escape',
    'neko.canvas.selectAll',
    'neko.canvas.undo',
    'neko.canvas.redo',
    'neko.canvas.copy',
    'neko.canvas.cut',
    'neko.canvas.paste',
    'neko.canvas.duplicate',
    'neko.canvas.generateSelected',
  ];
  for (const commandId of keyboardActions) {
    const action = commandId.replace('neko.canvas.', '');
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        canvasEditorProvider.postKeyboardAction(action);
      }),
    );
  }

  // Outline commands - select node/connection from tree view
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.selectNodeFromOutline', (nodeId: string) => {
      canvasEditorProvider.postKeyboardAction('selectNode:' + nodeId);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.selectConnectionFromOutline',
      (connectionId: string) => {
        canvasEditorProvider.postKeyboardAction('selectConnection:' + connectionId);
      },
    ),
  );

  // Zoom reset command (triggered from status bar)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.resetZoom', () => {
      canvasEditorProvider.postKeyboardAction('resetZoom');
    }),
  );

  // Round-trip: receive an edited image back from neko-sketch and update the shot node
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.updateNodeImage',
      (args: { nodeId: string; imageData: string; cellId?: string }) => {
        const { nodeId, imageData, cellId } = args;
        const delivered = canvasEditorProvider.postUpdateNodeImage(nodeId, imageData, cellId);
        if (!delivered) {
          vscode.window.showWarningMessage(
            'No active canvas editor — open the canvas first, then send back from Sketch.',
          );
        }
      },
    ),
  );

  // Preview media files with neko-preview (hardware-accelerated customEditor)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.canvas.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
      const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'];
      const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];

      try {
        if (videoExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (audioExts.includes(ext)) {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        }
      } catch (error) {
        logger.error(`Failed to open media preview: ${error}`);
      }
    }),
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

  const canvasFile = path.join(folders[0].uri.fsPath, `${config.name}.nkc`);
  const content = getCanvasTemplate(config.name);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(canvasFile), Buffer.from(content, 'utf-8'));
  return canvasFile;
}

/**
 * Register plugin slash commands into the neko-agent chat panel.
 * Uses the `neko.agent.registerSlashCommands` VSCode command API.
 * Also registers the handler commands that neko-agent invokes on selection.
 */
function registerAgentSlashCommands(context: vscode.ExtensionContext): void {
  // Register command handlers that neko-agent will call via invokePluginSlashCommand
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.nekocanvas.slashCommand.batch', async (args?: string) => {
      // Trigger batch image generation for selected shots
      const nodeIds = canvasEditorProvider.listNodes('shot').map((n) => n.id);
      if (nodeIds.length === 0) {
        vscode.window.showInformationMessage(
          'No shot nodes found. Add shot nodes to the canvas first.',
        );
        return;
      }
      await canvasEditorProvider.generateBatchForNodes(nodeIds);
      getRootLogger().info(`/batch: queued ${nodeIds.length} shots`, { args });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.nekocanvas.slashCommand.export',
      async (_args?: string) => {
        // Export storyboard — show quick pick for format
        const choice = await vscode.window.showQuickPick(
          [
            { label: '$(file-pdf) PDF', description: 'Export storyboard as PDF', value: 'pdf' },
            {
              label: '$(file-zip) ZIP',
              description: 'Export shot images as ZIP archive',
              value: 'zip',
            },
          ],
          { placeHolder: 'Select export format' },
        );
        if (!choice) return;
        await vscode.commands.executeCommand('neko.canvas.exportStoryboard', choice.value);
      },
    ),
  );

  // Register the slash commands with neko-agent (fires after agent extension activates)
  const doRegister = () => {
    vscode.commands
      .executeCommand('neko.agent.registerSlashCommands', 'neko.nekocanvas', [
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch generate images for all shot nodes',
          icon: '🖼️',
        },
        {
          id: 'export',
          name: '/export',
          description: 'Export storyboard to PDF or ZIP',
          icon: '📦',
        },
      ])
      .then(undefined, () => {
        // neko-agent not installed — silently ignore
      });
  };

  // Try immediately (agent may already be active)
  doRegister();

  // Re-register if extensions change (late activation of neko-agent)
  context.subscriptions.push(vscode.extensions.onDidChange(doRegister));
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
