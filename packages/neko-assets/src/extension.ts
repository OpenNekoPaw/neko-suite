/**
 * Neko Assets Extension
 *
 * VSCode extension entry point for unified asset management.
 *
 * Responsibilities:
 * - Initialize AssetLibrary with JsonFileStorage
 * - Connect engine probeMedia for rich metadata extraction
 * - Register FileDecorationProvider for Explorer tree enhancement
 * - Register context menu commands (add to timeline/canvas)
 * - Register existing commands (sync, push, pull, LFS, preview)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AssetLibrary, JsonFileStorage, RuleClassifier, AssetDiffService } from '@neko/asset';
import { LLMClassifier } from './services/LLMClassifier';
import type { IFileSystem } from '@neko/asset';
import { detectMediaType } from '@neko/shared';
import { createEngineMetadataExtractor } from './services/EngineMetadataExtractor';
import { ThumbnailService } from './services/ThumbnailService';
import { AssetHealthMonitor, createFileAccessChecker } from './services/AssetHealthMonitor';
import { MediaLibrarySettingsService } from './services/MediaLibrarySettingsService';
import { AssetFileDecorationProvider } from './providers/AssetFileDecorationProvider';
import { AssetManagerTreeProvider } from './providers/AssetManagerTreeProvider';
import { AssetHistoryTreeProvider } from './providers/AssetHistoryTreeProvider';
import { MediaLibraryTreeProvider } from './providers/MediaLibraryTreeProvider';
import { VscodeGitService } from './services/VscodeGitService';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import { setRootLogger, getLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';

const logger = getLogger('Extension');

// =============================================================================
// Extension State
// =============================================================================

let library: AssetLibrary | null = null;
let diffService: AssetDiffService | null = null;
let thumbnailService: ThumbnailService | null = null;

// =============================================================================
// Node.js IFileSystem Adapter
// =============================================================================

const nodeFileSystem: IFileSystem = {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  },
  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  },
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  },
};

// =============================================================================
// Activation
// =============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const rootLogger = createVSCodeLogger('Neko Assets', 'NekoAssets', context);
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));

  logger.info('Activating extension...');

  // 0. Initialize i18n
  const { getVSCodeLocale } = await import('@neko/shared/vscode/extension/i18n-bridge.ts');
  const locale = getVSCodeLocale();
  const { initI18n } = await import('./i18n');
  initI18n(locale);
  logger.info(`i18n initialized with locale: ${locale}`);

  // Create metadata extractor (used by both AssetLibrary and MediaLibrary)
  const metadataExtractor = createEngineMetadataExtractor();

  // 1. Initialize AssetLibrary
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    try {
      const storagePath = path.join(workspaceRoot, '.neko', 'assets', 'library.json');

      const storage = new JsonFileStorage({
        filePath: storagePath,
        fs: nodeFileSystem,
        autoSaveDelay: 1000,
      });

      // Initialize ThumbnailService
      thumbnailService = new ThumbnailService(workspaceRoot);
      context.subscriptions.push(thumbnailService);

      library = new AssetLibrary({
        storage,
        classifier: new LLMClassifier(new RuleClassifier()),
        metadataExtractor,
        thumbnailGenerator: (filePath) => thumbnailService!.generate(filePath),
        fileAccessChecker: createFileAccessChecker(),
      });

      await library.initialize();
      logger.info(`AssetLibrary initialized at ${storagePath}`);

      // Initialize AssetDiffService with Git integration
      const gitService = new VscodeGitService();
      diffService = new AssetDiffService(storage, gitService, undefined, {
        statFile: async (filePath: string) => {
          try {
            const stats = await fs.stat(filePath);
            return { size: stats.size };
          } catch {
            return null;
          }
        },
      });
      logger.info('AssetDiffService initialized with Git integration');

      // Initialize Asset Health Monitor
      const healthMonitor = new AssetHealthMonitor(library);
      healthMonitor.registerCommands(context);
      context.subscriptions.push(healthMonitor);

      // Run initial health check (non-blocking)
      healthMonitor.runInitialCheck();
    } catch (error) {
      logger.error('Failed to initialize AssetLibrary:', error);
    }
  }

  // 2. Register FileDecorationProvider
  if (library) {
    const decorationProvider = new AssetFileDecorationProvider(library);
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));

    // 3. Register Activity Bar tree views
    const assetManagerProvider = new AssetManagerTreeProvider(library);
    const assetHistoryProvider = new AssetHistoryTreeProvider(library);

    context.subscriptions.push(
      vscode.window.createTreeView('neko.assetManager', {
        treeDataProvider: assetManagerProvider,
        showCollapseAll: true,
      }),
      vscode.window.createTreeView('neko.assetHistory', {
        treeDataProvider: assetHistoryProvider,
      }),
      assetManagerProvider,
      assetHistoryProvider,
    );

    // Refresh tree views when library changes
    context.subscriptions.push(
      vscode.commands.registerCommand('neko.assets.refreshViews', () => {
        assetManagerProvider.refresh();
        assetHistoryProvider.refresh();
      }),
    );
  }

  // 4. Initialize Media Library Settings (P1)
  if (library && workspaceRoot) {
    const settingsService = new MediaLibrarySettingsService(workspaceRoot);
    await settingsService.load();
    context.subscriptions.push(settingsService);

    // Sync path variables into library
    library.updatePathVariables(await settingsService.getPathVariableMap());
    settingsService.onDidChange(async () => {
      library!.updatePathVariables(await settingsService.getPathVariableMap());
    });

    // Register Media Library TreeView
    const mediaLibraryProvider = new MediaLibraryTreeProvider({
      settingsService,
      thumbnailService: thumbnailService!,
      metadataExtractor,
    });
    const mediaLibraryTree = vscode.window.createTreeView('neko.mediaLibraries', {
      treeDataProvider: mediaLibraryProvider,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: mediaLibraryProvider,
    });
    context.subscriptions.push(mediaLibraryTree, mediaLibraryProvider);

    // Register media library commands
    registerMediaLibraryCommands(context, settingsService);
  }

  // 5. Register asset action commands
  registerAssetCommands(context);

  // 6. Register existing commands (sync, push, pull, LFS, preview)
  registerLegacyCommands(context);

  // 7. Register internal API commands (for cross-extension access)
  registerInternalCommands(context);

  logger.info('Extension activated');
}

// =============================================================================
// Asset Action Commands
// =============================================================================

function registerAssetCommands(context: vscode.ExtensionContext): void {
  // Add to Timeline (neko-cut)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.addToTimeline', async (uri?: vscode.Uri) => {
      if (!uri) return;

      const mediaType = detectMediaType(uri.fsPath);
      if (mediaType !== 'video' && mediaType !== 'audio' && mediaType !== 'image') {
        vscode.window.showWarningMessage('Only media files can be added to the timeline.');
        return;
      }

      try {
        await vscode.commands.executeCommand('neko.cut.addElement', {
          path: uri.fsPath,
          type: mediaType,
        });
      } catch {
        vscode.window.showErrorMessage('Failed to add to timeline. Is neko-cut active?');
      }
    }),
  );

  // Add to Canvas (neko-canvas)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.addToCanvas', async (uri?: vscode.Uri) => {
      if (!uri) return;

      try {
        await vscode.commands.executeCommand('neko.canvas.addNode', {
          path: uri.fsPath,
          type: 'MediaNode',
        });
      } catch {
        vscode.window.showErrorMessage('Failed to add to canvas. Is neko-canvas active?');
      }
    }),
  );

  // Import to Asset Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.importFile', async (uri?: vscode.Uri) => {
      if (!uri || !library) return;

      try {
        const result = await library.importFile(uri.fsPath);
        vscode.window.showInformationMessage(
          `Imported: ${result.entity.name} (${result.isNewEntity ? 'new entity' : 'existing entity'})`,
        );
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );
}

// =============================================================================
// Media Library Commands (P1)
// =============================================================================

function registerMediaLibraryCommands(
  context: vscode.ExtensionContext,
  settingsService: MediaLibrarySettingsService,
): void {
  const { t } = require('./i18n');

  // Add Media Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.addMediaLibrary', async () => {
      const dirUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: t('mediaLibrary.add.title'),
      });
      if (!dirUri?.[0]) return;

      const name = await vscode.window.showInputBox({
        prompt: t('mediaLibrary.add.namePrompt'),
        placeHolder: t('mediaLibrary.add.namePlaceholder'),
      });
      if (!name) return;

      const variable = await vscode.window.showInputBox({
        prompt: t('mediaLibrary.add.variablePrompt'),
        placeHolder: t('mediaLibrary.add.variablePlaceholder'),
        validateInput: (v) => {
          if (!/^[A-Z_][A-Z0-9_]*$/.test(v)) {
            return t('mediaLibrary.add.variableError');
          }
          return undefined;
        },
      });
      if (!variable) return;

      try {
        await settingsService.addLibrary({
          name,
          path: dirUri[0].fsPath,
          variable,
        });
        vscode.window.showInformationMessage(t('mediaLibrary.add.success', { name }));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(t('mediaLibrary.add.error', { error: msg }));
      }
    }),
  );

  // Remove Media Library
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.removeMediaLibrary', async (item?: unknown) => {
      // Get variable from tree item context or show picker
      let variable: string | undefined;
      if (item && typeof item === 'object' && 'library' in item) {
        variable = (item as { library: { variable: string } }).library.variable;
      } else {
        const libraries = await settingsService.getResolvedLibraries();
        const picked = await vscode.window.showQuickPick(
          libraries.map((l) => ({
            label: l.name,
            description: `\${${l.variable}}`,
            variable: l.variable,
          })),
          { title: t('mediaLibrary.remove.selectTitle') },
        );
        variable = picked?.variable;
      }
      if (!variable) return;

      await settingsService.removeLibrary(variable);
      vscode.window.showInformationMessage(t('mediaLibrary.remove.success'));
    }),
  );

  // Set Local Override
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.setLocalOverride', async (item?: unknown) => {
      let variable: string | undefined;
      if (item && typeof item === 'object' && 'library' in item) {
        variable = (item as { library: { variable: string } }).library.variable;
      } else {
        const libraries = await settingsService.getResolvedLibraries();
        const picked = await vscode.window.showQuickPick(
          libraries.map((l) => ({
            label: l.name,
            description: `\${${l.variable}}`,
            variable: l.variable,
          })),
          { title: t('mediaLibrary.override.selectTitle') },
        );
        variable = picked?.variable;
      }
      if (!variable) return;

      const dirUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: t('mediaLibrary.override.dialogTitle').replace('${variable}', variable),
      });
      if (!dirUri?.[0]) return;

      await settingsService.setLocalOverride(variable, dirUri[0].fsPath);
      vscode.window.showInformationMessage(
        t('mediaLibrary.override.success').replace('${variable}', variable),
      );
    }),
  );

  // Import from Library (context menu on media library files)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.importFromLibrary',
      async (item?: unknown, selectedItems?: unknown[]) => {
        if (!library) return;

        // Extract MediaFileItem objects from selection
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        try {
          const results: string[] = [];
          for (const fileItem of items) {
            const result = await library.importFile(fileItem.filePath, { autoClassify: true });
            results.push(result.entity.name);
          }

          if (results.length === 1) {
            vscode.window.showInformationMessage(
              t('mediaLibrary.import.success', { name: results[0] }),
            );
          } else {
            vscode.window.showInformationMessage(
              t('mediaLibrary.import.successMultiple', { count: results.length }),
            );
          }
          vscode.commands.executeCommand('neko.assets.refreshViews');
        } catch (error) {
          await handleError(error, { showToUser: true });
        }
      },
    ),
  );

  // Reveal File in OS
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.revealFileInOS', async (item?: unknown) => {
      const items = getMediaFileItems(item, undefined);
      if (items.length === 0) return;
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(items[0].filePath));
    }),
  );

  // Copy File Path
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.copyFilePath', async (item?: unknown) => {
      const items = getMediaFileItems(item, undefined);
      if (items.length === 0) return;
      await vscode.env.clipboard.writeText(items[0].filePath);
      vscode.window.showInformationMessage(t('mediaLibrary.copyPath.success'));
    }),
  );

  // Preview Media Library File
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.previewMediaLibraryFile',
      async (item?: unknown) => {
        const items = getMediaFileItems(item, undefined);
        if (items.length === 0) return;

        const filePath = items[0].filePath;
        const mediaType = detectMediaType(filePath);
        const uri = vscode.Uri.file(filePath);

        if (mediaType === 'video') {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (mediaType === 'audio') {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        } else {
          await vscode.commands.executeCommand('vscode.open', uri);
        }
      },
    ),
  );

  // Add to Timeline from Library
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.addToTimelineFromLibrary',
      async (item?: unknown, selectedItems?: unknown[]) => {
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        for (const fileItem of items) {
          await vscode.commands.executeCommand(
            'neko.assets.addToTimeline',
            vscode.Uri.file(fileItem.filePath),
          );
        }
      },
    ),
  );

  // Add to Canvas from Library
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.addToCanvasFromLibrary',
      async (item?: unknown, selectedItems?: unknown[]) => {
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        for (const fileItem of items) {
          await vscode.commands.executeCommand(
            'neko.assets.addToCanvas',
            vscode.Uri.file(fileItem.filePath),
          );
        }
      },
    ),
  );

  // Refresh Media Libraries
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.refreshMediaLibraries', () => {
      vscode.commands.executeCommand('neko.assets.refreshViews');
    }),
  );
}

/**
 * Extract MediaFileItem objects from tree selection.
 * Handles both single-click (item) and multi-select (selectedItems).
 */
function getMediaFileItems(item: unknown, selectedItems?: unknown[]): Array<{ filePath: string }> {
  const items: Array<{ filePath: string }> = [];

  // Multi-select takes priority
  if (selectedItems && selectedItems.length > 0) {
    for (const selected of selectedItems) {
      if (selected && typeof selected === 'object' && 'filePath' in selected) {
        items.push(selected as { filePath: string });
      }
    }
  } else if (item && typeof item === 'object' && 'filePath' in item) {
    items.push(item as { filePath: string });
  }

  return items;
}

// =============================================================================
// Legacy Commands (preserved from original extension.ts)
// =============================================================================

function registerLegacyCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.sync', () => {
      vscode.window.showInformationMessage('Syncing assets...');
    }),
    vscode.commands.registerCommand('neko.assets.push', () => {
      vscode.window.showInformationMessage('Pushing to cloud...');
    }),
    vscode.commands.registerCommand('neko.assets.pull', () => {
      vscode.window.showInformationMessage('Pulling from cloud...');
    }),
    vscode.commands.registerCommand('neko.assets.initLfs', async () => {
      const terminal = vscode.window.createTerminal('Git LFS');
      terminal.sendText('git lfs install');
      terminal.show();
    }),
    vscode.commands.registerCommand('neko.assets.trackLfs', async () => {
      const pattern = await vscode.window.showInputBox({
        prompt: 'Enter file pattern to track (e.g., *.mp4)',
        value: '*.mp4',
      });
      if (pattern) {
        const terminal = vscode.window.createTerminal('Git LFS');
        terminal.sendText(`git lfs track "${pattern}"`);
        terminal.show();
      }
    }),
    vscode.commands.registerCommand('neko.assets.triggerRender', () => {
      vscode.window.showInformationMessage('CI/CD render triggered');
    }),
    vscode.commands.registerCommand('neko.assets.viewHistory', () => {
      vscode.window.showInformationMessage('Asset history - Coming soon');
    }),
    // Preview media files with neko-preview
    vscode.commands.registerCommand('neko.assets.previewMedia', async (uri?: vscode.Uri) => {
      if (!uri) {
        const fileUri = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectMany: false,
          filters: {
            'Media Files': [
              'mp4',
              'mov',
              'avi',
              'mkv',
              'webm',
              'm4v',
              'ts',
              'flv',
              'wmv',
              'mp3',
              'wav',
              'ogg',
              'flac',
              'aac',
              'm4a',
              'wma',
              'opus',
            ],
          },
        });
        if (!fileUri?.[0]) return;
        uri = fileUri[0];
      }

      const mediaType = detectMediaType(uri.fsPath);

      try {
        if (mediaType === 'video') {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (mediaType === 'audio') {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        }
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );
}

// =============================================================================
// Internal API Commands (cross-extension access)
// =============================================================================

function registerInternalCommands(context: vscode.ExtensionContext): void {
  // Get all entities (used by neko-canvas AssetLibraryProvider)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getAllEntities', async () => {
      if (!library) return [];
      try {
        return await library.getAllEntities();
      } catch (error) {
        logger.error('getAllEntities failed:', error);
        return [];
      }
    }),
  );

  // Compare two variants (used by neko-cut DiffViewer)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.compareVariants',
      async (entityId: string, variantIdA: string, variantIdB: string) => {
        if (!diffService) return null;
        try {
          return await diffService.compareVariants(entityId, variantIdA, variantIdB);
        } catch (error) {
          logger.error('compareVariants failed:', error);
          return null;
        }
      },
    ),
  );

  // Compare two files/paths (general diff)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.compare',
      async (request: import('@neko/shared').AssetDiffRequest) => {
        if (!diffService) return null;
        try {
          return await diffService.compare(request);
        } catch (error) {
          logger.error('compare failed:', error);
          return null;
        }
      },
    ),
  );

  // Get version history for a file
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getVersionHistory', async (filePath: string) => {
      if (!diffService) return [];
      try {
        return await diffService.getVersionHistory(filePath);
      } catch (error) {
        logger.error('getVersionHistory failed:', error);
        return [];
      }
    }),
  );

  // Compare with Git version
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.compareWithGit',
      async (filePath: string, ref?: string) => {
        if (!diffService) return null;
        try {
          return await diffService.compareWithGit(filePath, ref);
        } catch (error) {
          logger.error('compareWithGit failed:', error);
          return null;
        }
      },
    ),
  );

  // Generate thumbnail for a file (used by other extensions)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.generateThumbnail', async (filePath: string) => {
      if (!thumbnailService) return null;
      try {
        return await thumbnailService.generate(filePath);
      } catch (error) {
        logger.error('generateThumbnail failed:', error);
        return null;
      }
    }),
  );

  // Get cached thumbnail path for a file
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getThumbnailPath', async (filePath: string) => {
      if (!thumbnailService) return null;
      try {
        return await thumbnailService.getCached(filePath);
      } catch (error) {
        logger.error('getThumbnailPath failed:', error);
        return null;
      }
    }),
  );
}

// =============================================================================
// Deactivation
// =============================================================================

export async function deactivate(): Promise<void> {
  if (library) {
    try {
      await library.flush();
    } catch (error) {
      logger.error('Failed to flush library on deactivate:', error);
    }
    library = null;
  }
}
