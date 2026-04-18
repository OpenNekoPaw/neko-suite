/**
 * NekoCanvas Extension - Canvas editor and asset library for VSCode
 *
 * This is the main entry point for the NekoCanvas extension.
 * It provides canvas editing and asset management capabilities.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import {
  applyStoryboardPayloadToCanvas,
  type ApplyCanvasStoryboardOptions,
  type CanvasStoryboardPayload,
  type CreatedCanvasStoryboard,
} from '@neko/shared';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  createNewFile,
} from '@neko/shared/vscode/extension';
import type { AssetEntity, AssetFile, NekoAssetsAPI } from '@neko/shared';
import { NEKO_EXTENSION_IDS } from '@neko/shared';
import { getRootLogger, setRootLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';
import { CanvasEditorProvider } from './editor';
import { broadcastQuietMode } from './services/batchGenerationScheduler';
import { CanvasOutlineProvider, CanvasStatusBar } from './views';
import type { NekoCanvasAPI, CanvasConfig } from './api';
import type { ISkillProvider, SkillDef } from '@neko/shared';
import { createNekoCanvasCapabilityProvider } from './agentCapabilityProvider';

// Extension state
let canvasEditorProvider: CanvasEditorProvider;
let canvasOutlineProvider: CanvasOutlineProvider;
let canvasStatusBar: CanvasStatusBar;

/** Cached assets API reference (resolved once, reused across calls). */
let assetsAPI: NekoAssetsAPI | undefined;

async function getAssetsAPI(): Promise<NekoAssetsAPI | undefined> {
  if (assetsAPI) return assetsAPI;
  const ext = vscode.extensions.getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS);
  if (!ext) return undefined;
  if (!ext.isActive) await ext.activate();
  assetsAPI = ext.exports;
  return assetsAPI;
}

async function getAssetEntities(): Promise<AssetEntity[]> {
  try {
    // Prefer typed API when available
    const api = await getAssetsAPI();
    if (api) return api.getAllEntities();
    // Fallback: command-level proxy (backward compat with older neko-assets)
    const entities = await vscode.commands.executeCommand<AssetEntity[]>(
      'neko.assets.getAllEntities',
    );
    return Array.isArray(entities) ? entities : [];
  } catch (error) {
    throw new Error(`neko-assets proxy unavailable: ${String(error)}`);
  }
}

function mapAssetMediaTypeToCanvasType(
  mediaType: AssetFile['mediaType'],
): import('./api').Asset['type'] {
  switch (mediaType) {
    case 'video':
    case 'audio':
    case 'image':
      return mediaType;
    case 'text':
      return 'text';
    default:
      return 'other';
  }
}

function pickPreferredAssetFile(entity: AssetEntity): AssetFile | undefined {
  const variants = entity.defaultVariantId
    ? [
        entity.variants.find((variant) => variant.id === entity.defaultVariantId),
        ...entity.variants.filter((variant) => variant.id !== entity.defaultVariantId),
      ]
    : entity.variants;

  for (const variant of variants) {
    if (!variant) continue;
    const preferred =
      variant.files.find((file) => file.purpose === 'main') ??
      variant.files.find((file) => file.purpose === 'preview') ??
      variant.files[0];
    if (preferred) {
      return preferred;
    }
  }

  return undefined;
}

function mapAssetEntityToCanvasAsset(entity: AssetEntity): import('./api').Asset {
  const file = pickPreferredAssetFile(entity);
  return {
    id: entity.id,
    name: entity.name,
    type: file ? mapAssetMediaTypeToCanvasType(file.mediaType) : 'other',
    path: file?.path ?? '',
    thumbnail:
      entity.variants.find((variant) => variant.id === entity.defaultVariantId)?.thumbnailPath ??
      entity.variants.find((variant) => typeof variant.thumbnailPath === 'string')?.thumbnailPath,
    metadata: file?.metadata,
    tags: entity.tags,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function matchesAssetFilter(
  asset: import('./api').Asset,
  filter: import('./api').AssetFilter | undefined,
): boolean {
  if (!filter) return true;
  if (filter.type && asset.type !== filter.type) return false;
  if (filter.tags && filter.tags.some((tag) => !asset.tags?.includes(tag))) return false;
  if (filter.search) {
    const query = filter.search.toLowerCase();
    const haystacks = [asset.name, asset.path, ...(asset.tags ?? [])];
    if (!haystacks.some((value) => value.toLowerCase().includes(query))) {
      return false;
    }
  }
  return true;
}

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

  // Return API for other extensions
  // Asset operations now delegate to neko-assets via commands
  const api: NekoCanvasAPI & ISkillProvider = {
    asset: {
      import: async (filePath) => {
        try {
          await vscode.commands.executeCommand('neko.assets.importFile', vscode.Uri.file(filePath));
        } catch (error) {
          throw new Error(`Failed to import asset via neko-assets: ${String(error)}`);
        }

        const importedPath = filePath.replace(/\\/g, '/');
        const entities = await getAssetEntities();
        const importedEntity = entities.find((entity) =>
          entity.variants.some((variant) =>
            variant.files.some((file) => file.path.replace(/\\/g, '/') === importedPath),
          ),
        );

        if (!importedEntity) {
          throw new Error(
            'Asset imported via neko-assets, but imported entity could not be resolved.',
          );
        }

        return mapAssetEntityToCanvasAsset(importedEntity);
      },
      list: async (filter) => {
        const entities = await getAssetEntities();
        return entities
          .map(mapAssetEntityToCanvasAsset)
          .filter((asset) => matchesAssetFilter(asset, filter));
      },
      getById: async (id) => {
        const entities = await getAssetEntities();
        const entity = entities.find((candidate) => candidate.id === id);
        return entity ? mapAssetEntityToCanvasAsset(entity) : undefined;
      },
    },
    canvas: {
      create: (config) => createCanvas(config),
      addShape: (canvasId, shape) => canvasEditorProvider.addShape(shape),
      updateShape: (canvasId, shapeId, updates) =>
        canvasEditorProvider.updateShape(shapeId, updates),
      deleteShape: (canvasId, shapeId) => canvasEditorProvider.deleteShape(shapeId),
    },
    storyboard: {
      import: async (payload, options) => {
        const created = await importStoryboardToCanvas(api, payload, options);
        canvasEditorProvider.reportStoryboardImport(payload, created);
        return created;
      },
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

  // Register commands
  registerCommands(context, api.storyboard.import);

  // Register plugin slash commands into neko-agent chat panel
  registerAgentSlashCommands(context);

  logger.info('Extension activated');

  // Register capability provider with neko-agent (if installed)
  try {
    const provider = createNekoCanvasCapabilityProvider(api);
    void vscode.commands.executeCommand('neko.agent.registerCapabilities', provider);
  } catch {
    // neko-agent not installed — silently ignore
  }

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
function registerCommands(
  context: vscode.ExtensionContext,
  importStoryboard: (
    payload: CanvasStoryboardPayload,
    options?: ApplyCanvasStoryboardOptions,
  ) => Promise<CreatedCanvasStoryboard>,
): void {
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
        void handleError(new Error(vscode.l10n.t('neko.canvas.addToAssetLibrary.noFile')), {
          showToUser: true,
        });
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
          void handleError(new Error('neko.canvas.importAsset: missing asset path'), {
            showToUser: true,
            severity: 'warning',
          });
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.importStoryboard',
      async (
        payload?: CanvasStoryboardPayload,
        options?: ApplyCanvasStoryboardOptions,
      ): Promise<CreatedCanvasStoryboard> => {
        if (!payload) {
          throw new Error('neko.canvas.importStoryboard: missing storyboard payload');
        }

        const created = await importStoryboard(payload, options);
        getRootLogger().info(
          `importStoryboard: mode=${created.mode} scenes=${created.scenesCreated} shots=${created.totalShots}`,
        );
        return created;
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
          void handleError(
            new Error(
              'No active canvas editor — open the canvas first, then send back from Sketch.',
            ),
            { showToUser: true, severity: 'warning' },
          );
        }
      },
    ),
  );

  // Orchestrator coordination — neko-agent's Workflow Plan handler fires
  // this command on plan state transitions.  We route it to all live
  // BatchGenerationSchedulers so their pump pauses while a plan is
  // executing (avoids double-queue with the orchestrator's batchGenerate
  // stage running the same generateForNode requests).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.canvas.orchestrator.planStateChanged',
      (payload?: {
        status?: 'executing' | 'paused' | 'completed' | 'aborted' | 'failed';
        planId?: string;
        pipelineId?: string;
      }) => {
        if (!payload || typeof payload.status !== 'string') return;
        // Any non-terminal "work is active" state pauses canvas generation.
        const quiet =
          payload.status === 'executing' || payload.status === 'paused'
            ? `workflow plan ${payload.planId ?? ''}`.trim()
            : undefined;
        broadcastQuietMode(quiet);
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

async function importStoryboardToCanvas(
  api: NekoCanvasAPI,
  payload: CanvasStoryboardPayload,
  options?: ApplyCanvasStoryboardOptions,
): Promise<CreatedCanvasStoryboard> {
  return applyStoryboardPayloadToCanvas(api, payload, options);
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
      const nodeIds = (await canvasEditorProvider.listNodes('shot')).map((n) => n.id);
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
