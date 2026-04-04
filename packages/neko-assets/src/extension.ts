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
import {
  AssetLibrary,
  JsonFileStorage,
  RuleClassifier,
  AssetDiffService,
  PathResolver,
} from '@neko/asset';
import { LLMClassifier } from './services/LLMClassifier';
import type { IFileSystem } from '@neko/asset';
import { detectMediaType, resolveStorageLayout, migrateStorageLayout } from '@neko/shared';
import { createEngineMetadataExtractor } from './services/EngineMetadataExtractor';
import { ThumbnailService } from './services/ThumbnailService';
import { MediaMetadataCache } from './services/MediaMetadataCache';
import { MediaLibrarySearchService } from './services/MediaLibrarySearchService';
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
    // Ensure parent directory exists (e.g. .neko/assets/ on first run)
    await fs.mkdir(path.dirname(filePath), { recursive: true });
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
      const layout = resolveStorageLayout(workspaceRoot);

      // One-time migration from legacy paths
      try {
        const migrated = await migrateStorageLayout(workspaceRoot, {
          exists: async (p) => {
            try {
              await fs.access(p);
              return true;
            } catch {
              return false;
            }
          },
          rename: (o, n) => fs.rename(o, n),
          mkdir: (p, opts) => fs.mkdir(p, opts).then(() => {}),
        });
        if (migrated.length > 0) {
          logger.info(`Storage migration: ${migrated.join('; ')}`);
        }
      } catch (err) {
        logger.warn('Storage migration failed (non-fatal):', err);
      }

      const storage = new JsonFileStorage({
        filePath: layout.project.assetLibrary,
        fs: nodeFileSystem,
        autoSaveDelay: 1000,
      });

      // Initialize ThumbnailService
      thumbnailService = new ThumbnailService(layout.project.cache.thumbnails);
      context.subscriptions.push(thumbnailService);

      library = new AssetLibrary({
        storage,
        classifier: new LLMClassifier(new RuleClassifier()),
        metadataExtractor,
        thumbnailGenerator: (filePath) => thumbnailService!.generate(filePath),
        fileAccessChecker: createFileAccessChecker(),
      });

      await library.initialize();
      logger.info(`AssetLibrary initialized at ${layout.project.assetLibrary}`);

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
    const assetManagerProvider = new AssetManagerTreeProvider(library, thumbnailService!);
    const assetHistoryProvider = new AssetHistoryTreeProvider(library, thumbnailService!);

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

    // Register asset manager context menu commands (entity/variant CRUD)
    registerAssetManagerCommands(context, library, assetManagerProvider, assetHistoryProvider);
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

    // Initialize PathResolver for portable cache keys
    const cachePathResolver = new PathResolver();
    cachePathResolver.setVariables(await settingsService.getPathVariableMap());
    settingsService.onDidChange(async () => {
      cachePathResolver.setVariables(await settingsService.getPathVariableMap());
    });

    // Initialize persistent metadata cache
    const metadataCache = new MediaMetadataCache(
      resolveStorageLayout(workspaceRoot).project.cache.mediaMetadata,
      cachePathResolver,
    );
    await metadataCache.load();
    context.subscriptions.push(metadataCache);

    // Initialize search service
    const searchService = new MediaLibrarySearchService(settingsService, metadataCache);

    // Register Media Library TreeView
    const mediaLibraryProvider = new MediaLibraryTreeProvider({
      settingsService,
      thumbnailService: thumbnailService!,
      metadataExtractor,
      metadataCache,
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

    // Register search command
    registerSearchCommand(context, searchService);
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
// Asset Manager Context Menu Commands (entity / variant CRUD)
// =============================================================================

function registerAssetManagerCommands(
  context: vscode.ExtensionContext,
  lib: AssetLibrary,
  assetManagerProvider: AssetManagerTreeProvider,
  assetHistoryProvider: AssetHistoryTreeProvider,
): void {
  const refresh = () => {
    assetManagerProvider.refresh();
    assetHistoryProvider.refresh();
  };

  // --- helpers ---------------------------------------------------------------

  /** Extract entity from EntityItem duck-typed argument */
  function getEntity(item: unknown) {
    if (item && typeof item === 'object' && 'entity' in item) {
      return (item as { entity: import('@neko/shared').AssetEntity }).entity;
    }
    return null;
  }

  /** Extract entity + variant from VariantItem duck-typed argument */
  function getVariant(item: unknown) {
    if (item && typeof item === 'object' && 'entity' in item && 'variant' in item) {
      const typed = item as {
        entity: import('@neko/shared').AssetEntity;
        variant: import('@neko/shared').AssetVariant;
      };
      return { entity: typed.entity, variant: typed.variant };
    }
    return null;
  }

  /** Resolve the primary file path of an entity (first file of first variant) */
  function primaryFilePath(entity: import('@neko/shared').AssetEntity): string | null {
    const storedPath = entity.variants[0]?.files[0]?.path;
    if (!storedPath) return null;
    return lib.resolvePath(storedPath);
  }

  // --- entity commands -------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.entity.preview', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await vscode.commands.executeCommand('neko.assets.previewMedia', vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.entity.addToTimeline', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await vscode.commands.executeCommand('neko.assets.addToTimeline', vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.entity.addToCanvas', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await vscode.commands.executeCommand('neko.assets.addToCanvas', vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.entity.rename', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new name',
        value: entity.name,
        valueSelection: [0, entity.name.length],
      });
      if (!newName || newName === entity.name) return;
      try {
        await lib.updateEntity(entity.id, { name: newName });
        await lib.flush();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.entity.addVariant', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const variantName = await vscode.window.showInputBox({
        prompt: 'Enter variant name',
        placeHolder: 'e.g., 4K, Draft, v2',
      });
      if (!variantName) return;
      try {
        await lib.addVariant(entity.id, { name: variantName });
        await lib.flush();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.entity.delete', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${entity.name}"? This cannot be undone.`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;
      try {
        await lib.deleteEntity(entity.id);
        await lib.flush();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // --- variant commands ------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.variant.preview', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const storedPath = result.variant.files[0]?.path;
      if (!storedPath) return;
      const filePath = lib.resolvePath(storedPath);
      await vscode.commands.executeCommand('neko.assets.previewMedia', vscode.Uri.file(filePath));
    }),

    vscode.commands.registerCommand('neko.assets.variant.addFile', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        title: 'Select file to add to variant',
      });
      if (!uris?.[0]) return;
      try {
        await lib.addFile(result.variant.id, uris[0].fsPath);
        await lib.flush();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.variant.rename', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const newName = await vscode.window.showInputBox({
        prompt: 'Enter new variant name',
        value: result.variant.name,
        valueSelection: [0, result.variant.name.length],
      });
      if (!newName || newName === result.variant.name) return;
      try {
        await lib.updateVariant(result.entity.id, result.variant.id, { name: newName });
        await lib.flush();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.variant.delete', async (item?: unknown) => {
      const result = getVariant(item);
      if (!result) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete variant "${result.variant.name}"? This cannot be undone.`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;
      try {
        await lib.deleteVariant(result.entity.id, result.variant.id);
        await lib.flush();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),
  );

  // --- directory command -----------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.directory.reveal', (item?: unknown) => {
      if (item && typeof item === 'object' && 'dirPath' in item) {
        const dirPath = (item as { dirPath: string }).dirPath;
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dirPath));
      }
    }),
  );

  // --- recent entity commands ------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.recentEntity.addToTimeline',
      async (item?: unknown) => {
        if (item && typeof item === 'object' && 'resourceUri' in item) {
          const uri = (item as { resourceUri: vscode.Uri }).resourceUri;
          if (uri) {
            await vscode.commands.executeCommand('neko.assets.addToTimeline', uri);
          }
        }
      },
    ),

    vscode.commands.registerCommand(
      'neko.assets.recentEntity.addToCanvas',
      async (item?: unknown) => {
        if (item && typeof item === 'object' && 'resourceUri' in item) {
          const uri = (item as { resourceUri: vscode.Uri }).resourceUri;
          if (uri) {
            await vscode.commands.executeCommand('neko.assets.addToCanvas', uri);
          }
        }
      },
    ),
  );
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
        await library.flush();
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

/**
 * Derive a UPPER_SNAKE_CASE variable name from a human-readable library name.
 * Strips non-ASCII characters, normalizes spaces, uppercases, and snake-cases.
 * Falls back to "MEDIA_LIB" if the result would be empty.
 */
function suggestVariableName(name: string): string {
  const snake = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // remove non-ASCII / special chars
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_') // collapse spaces to underscore
    .replace(/^[0-9]/, 'LIB_$&'); // must start with a letter
  return snake || 'MEDIA_LIB';
}

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
        title: t('mediaLibrary.add.title'),
      });
      if (!name) return;

      const suggestedVar = suggestVariableName(name);
      const variable = await vscode.window.showInputBox({
        prompt: t('mediaLibrary.add.variablePrompt'),
        placeHolder: t('mediaLibrary.add.variablePlaceholder'),
        title: t('mediaLibrary.add.title'),
        value: suggestedVar,
        valueSelection: [0, suggestedVar.length],
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
          await library.flush();

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

  // Add to Agent from Library — delegates to neko-agent via cross-extension command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.assets.addToAgent',
      async (item?: unknown, selectedItems?: unknown[]) => {
        const items = getMediaFileItems(item, selectedItems);
        if (items.length === 0) return;

        for (const fileItem of items) {
          await vscode.commands.executeCommand(
            'neko.agent.addToContext',
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
// Search Command
// =============================================================================

interface MediaSearchQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  mediaType: string;
}

function registerSearchCommand(
  context: vscode.ExtensionContext,
  searchService: MediaLibrarySearchService,
): void {
  const { t } = require('./i18n');

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.searchMediaLibrary', () => {
      const quickPick = vscode.window.createQuickPick<MediaSearchQuickPickItem>();
      quickPick.placeholder = t('mediaLibrary.search.placeholder');
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      let searchTimer: ReturnType<typeof setTimeout> | undefined;

      quickPick.onDidChangeValue((value) => {
        if (searchTimer) clearTimeout(searchTimer);
        if (value.length < 2) {
          quickPick.items = [];
          return;
        }
        // Debounce search
        searchTimer = setTimeout(async () => {
          quickPick.busy = true;
          try {
            const results = await searchService.search(value);
            quickPick.items = results.map((r) => {
              const iconMap: Record<string, string> = {
                video: 'file-media',
                audio: 'unmute',
                image: 'file',
                document: 'file-text',
              };
              const icon = iconMap[r.mediaType] ?? 'file';

              let detail: string | undefined;
              if (r.metadata) {
                const parts: string[] = [];
                if (r.metadata.width && r.metadata.height) {
                  parts.push(`${r.metadata.width}×${r.metadata.height}`);
                }
                if (r.metadata.duration) {
                  const d = r.metadata.duration;
                  const m = Math.floor(d / 60);
                  const s = Math.round(d % 60);
                  parts.push(`${m}:${s.toString().padStart(2, '0')}`);
                }
                if (r.metadata.fileSize > 0) {
                  const mb = r.metadata.fileSize / (1024 * 1024);
                  parts.push(
                    mb >= 1
                      ? `${mb.toFixed(1)} MB`
                      : `${(r.metadata.fileSize / 1024).toFixed(0)} KB`,
                  );
                }
                if (parts.length > 0) detail = parts.join('  ·  ');
              }

              return {
                label: `$(${icon}) ${r.fileName}`,
                description: r.libraryName,
                detail,
                filePath: r.filePath,
                mediaType: r.mediaType,
              };
            });
            if (results.length === 0) {
              quickPick.items = [
                {
                  label: t('mediaLibrary.search.noResults'),
                  filePath: '',
                  mediaType: '',
                },
              ];
            }
          } catch {
            // Search failed silently
          } finally {
            quickPick.busy = false;
          }
        }, 200);
      });

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (!selected || !selected.filePath) return;

        const uri = vscode.Uri.file(selected.filePath);
        if (selected.mediaType === 'video') {
          vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
        } else if (selected.mediaType === 'audio') {
          vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
        } else {
          vscode.commands.executeCommand('vscode.open', uri);
        }

        quickPick.dispose();
      });

      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    }),
  );
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
      vscode.commands.executeCommand('neko.assetHistory.focus');
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

  // Contract absolute path → portable path (${VAR}/rest or relative)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.contractPath', (absolutePath: string) => {
      if (!library) return absolutePath;
      return library.contractPath(absolutePath);
    }),
  );

  // Resolve portable path → absolute path
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.resolvePath', (storedPath: string) => {
      if (!library) return storedPath;
      return library.resolvePath(storedPath);
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
