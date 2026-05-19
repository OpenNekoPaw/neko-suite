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
  buildAssetBindingCandidate,
  buildCancelEntityBindingPlan,
  buildDeleteAssetPlan,
  buildRepresentationPackageDetail,
  parseProjectAssetEntityId,
} from '@neko/asset';
import { LLMClassifier } from './services/LLMClassifier';
import type { IFileSystem } from '@neko/asset';
import * as os from 'os';
import {
  detectMediaType,
  resolveStorageLayout,
  migrateStorageLayout,
  parseEntityUri,
} from '@neko/shared';
import type { ResolvedEntityRef } from '@neko/shared';
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
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import {
  CharacterRegistryService,
  createVSCodeEntityServices,
  resolveCharacterRegistryPath,
  type EntityAssetBindingService,
} from '@neko/entity/host-vscode';
import { setRootLogger, getLogger } from './utils/logger';
import { setErrorHandler, handleError } from './utils/errorHandler';
import { openAssetPreview } from './utils/preview';

const logger = getLogger('Extension');

// =============================================================================
// Extension State
// =============================================================================

let library: AssetLibrary | null = null;
let diffService: AssetDiffService | null = null;
let thumbnailService: ThumbnailService | null = null;
let mediaSettingsService:
  | import('./services/MediaLibrarySettingsService').MediaLibrarySettingsService
  | null = null;
let healthMonitor: AssetHealthMonitor | null = null;
/** Entity change event emitter — module-level so command handlers + API can both fire */
let entityChangeEmitter: import('vscode').EventEmitter<void> | null = null;

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

export async function activate(
  context: vscode.ExtensionContext,
): Promise<import('@neko/shared').NekoAssetsAPI> {
  const rootLogger = createVSCodeLogger(
    'Neko Assets',
    'NekoAssets',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(rootLogger);
  setErrorHandler(new VSCodeErrorHandler(rootLogger));
  watchLogLevel(rootLogger, context);

  logger.info('Activating extension...');

  // 0. Initialize i18n
  const { getVSCodeLocale } = await import('@neko/shared/vscode/extension');
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
      const layout = resolveStorageLayout(workspaceRoot, os.homedir());

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
        fileAccessChecker: createFileAccessChecker((p) => library?.resolvePath(p) ?? p),
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

      // Initialize Asset Health Monitor (initial check deferred until path variables are loaded)
      healthMonitor = new AssetHealthMonitor(library);
      healthMonitor.registerCommands(context);
      context.subscriptions.push(healthMonitor);
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
    mediaSettingsService = settingsService;
    await settingsService.load();
    context.subscriptions.push(settingsService);

    // Sync path variables into library (must happen before health check)
    library.updatePathVariables(await settingsService.getPathVariableMap());
    settingsService.onDidChange(async () => {
      library!.updatePathVariables(await settingsService.getPathVariableMap());
    });

    // Run initial health check now that path variables are available
    healthMonitor?.runInitialCheck();

    // Initialize PathResolver for portable cache keys
    const cachePathResolver = new PathResolver();
    cachePathResolver.setVariables(await settingsService.getPathVariableMap());
    settingsService.onDidChange(async () => {
      cachePathResolver.setVariables(await settingsService.getPathVariableMap());
    });

    // Initialize persistent metadata cache
    const metadataCache = new MediaMetadataCache(
      resolveStorageLayout(workspaceRoot, os.homedir()).project.cache.mediaMetadata,
      cachePathResolver,
    );
    await metadataCache.load();
    context.subscriptions.push(metadataCache);

    // Initialize search service with persistent index
    const storageLayout = resolveStorageLayout(workspaceRoot, os.homedir());
    const searchService = new MediaLibrarySearchService(
      settingsService,
      metadataCache,
      storageLayout.project.cache.searchIndex,
    );
    context.subscriptions.push(searchService);
    void searchService.warmup().catch((error) => {
      logger.warn('Media library search warmup failed (non-fatal):', error);
    });

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

  // 8. Build typed extension API (returned to VSCode as exports)
  const _onDidChangeEntities = new vscode.EventEmitter<void>();
  const _onDidChangeMediaLibraryRoots = new vscode.EventEmitter<void>();

  // Bridge command for components that can't import entityChangeEmitter directly
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.entityChanged', () => {
      _onDidChangeEntities.fire();
    }),
  );
  entityChangeEmitter = _onDidChangeEntities;
  context.subscriptions.push(_onDidChangeEntities);

  if (mediaSettingsService) {
    context.subscriptions.push(
      mediaSettingsService.onDidChange(() => {
        _onDidChangeEntities.fire();
        _onDidChangeMediaLibraryRoots.fire();
      }),
    );
  }

  const api: import('@neko/shared').NekoAssetsAPI = {
    getAllEntities: async () => (library ? library.getAllEntities() : []),
    importFile: async (uri) => {
      if (!library) return undefined;
      try {
        const result = await library.importFile(uri.fsPath);
        await library.flush();
        _onDidChangeEntities.fire();
        return result.entity;
      } catch {
        return undefined;
      }
    },
    getThumbnailPath: async (filePath) => {
      if (!thumbnailService) return undefined;
      return (await thumbnailService.getCached(filePath)) ?? undefined;
    },
    getMediaLibraryRoots: async () =>
      mediaSettingsService ? mediaSettingsService.getWebviewResourceRoots() : [],
    resolveEntityUri: async (uri) => {
      if (!library) return undefined;
      const parsed = parseEntityUri(uri);
      if (!parsed) return undefined;

      const entities = await library.getAllEntities();
      const entity = entities.find((e) => e.id === parsed.entityId);
      if (!entity) return undefined;

      for (const variant of entity.variants) {
        const file = variant.files.find((f) => f.purpose === parsed.purpose);
        if (file) {
          return {
            entityId: parsed.entityId,
            variantId: variant.id,
            filePath: file.path,
            resolvedPath: library.resolvePath(file.path),
            mediaType: file.mediaType,
          };
        }
      }
      if (parsed.purpose === 'thumbnail') {
        const variant = entity.variants.find((v) => typeof v.thumbnailPath === 'string');
        if (variant?.thumbnailPath) {
          return {
            entityId: parsed.entityId,
            variantId: variant.id,
            filePath: variant.thumbnailPath,
            resolvedPath: variant.thumbnailPath,
            mediaType: 'image' as const,
          };
        }
      }
      return undefined;
    },
    getCharacterThumbnail: async (name) => {
      if (!library) return undefined;
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return undefined;

      try {
        const registry = new CharacterRegistryService(resolveCharacterRegistryPath(wsRoot));
        const record = await registry.resolveByName(name);
        if (!record) return undefined;

        const assetIds = [
          ...(record.defaults?.assetEntityId ? [record.defaults.assetEntityId] : []),
          ...(record.bindings?.assetEntityIds ?? []),
        ];
        if (assetIds.length === 0) return undefined;

        const entities = await library.getAllEntities();
        for (const id of assetIds) {
          const entity = entities.find((e) => e.id === id);
          if (!entity) continue;
          for (const variant of entity.variants) {
            if (variant.thumbnailPath) return variant.thumbnailPath;
            const thumbFile = variant.files.find((f) => f.purpose === 'thumbnail');
            if (thumbFile) return library.resolvePath(thumbFile.path);
          }
        }
      } catch {
        return undefined;
      }
      return undefined;
    },
    getBindingCandidate: async (entityId) => {
      if (!library) return undefined;
      const entity = await library.getEntity(entityId);
      return entity ? buildAssetBindingCandidate(entity) : undefined;
    },
    getRepresentationPackageDetail: async (entityId) => {
      if (!library) return undefined;
      const entity = await library.getEntity(entityId);
      return entity ? buildRepresentationPackageDetail(entity) : undefined;
    },
    onDidChangeEntities: _onDidChangeEntities.event,
    onDidChangeMediaLibraryRoots: _onDidChangeMediaLibraryRoots.event,
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.getCharacterThumbnail', (name: string) =>
      api.getCharacterThumbnail(name),
    ),
    vscode.commands.registerCommand('neko.assets.getMediaLibraryRoots', () =>
      api.getMediaLibraryRoots(),
    ),
  );

  logger.info('Extension activated, API exported');
  return api;
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

  function getBindingService(): EntityAssetBindingService | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return workspaceRoot
      ? createVSCodeEntityServices({ projectRoot: workspaceRoot }).bindings
      : undefined;
  }

  async function listBindingsForAsset(entityId: string) {
    const bindingService = getBindingService();
    if (!bindingService) return [];
    const bindings = await bindingService.list();
    return bindings.filter((binding) => parseProjectAssetEntityId(binding.assetRef) === entityId);
  }

  // --- entity commands -------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.entity.preview', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const filePath = primaryFilePath(entity);
      if (!filePath) return;
      await openAssetPreview(vscode.Uri.file(filePath));
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
        entityChangeEmitter?.fire();
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
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand(
      'neko.assets.entity.showBindingCandidates',
      async (item?: unknown) => {
        const entity = getEntity(item);
        if (!entity) return;
        const candidate = buildAssetBindingCandidate(entity);
        await vscode.window.showQuickPick(
          candidate.suggestedRoles.map((role) => ({
            label: `$(link) ${role}`,
            description: candidate.assetRef,
            detail: `${Math.round(candidate.confidence * 100)}% · ${candidate.reason}`,
          })),
          {
            title: `Binding candidates for ${entity.name}`,
            placeHolder:
              candidate.suggestedRoles.length > 0
                ? 'Select a representation role to inspect'
                : candidate.reason,
          },
        );
      },
    ),

    vscode.commands.registerCommand(
      'neko.assets.entity.showRepresentationPackage',
      async (item?: unknown) => {
        const entity = getEntity(item);
        if (!entity) return;
        const detail = buildRepresentationPackageDetail(entity);
        const fileItems = detail.files.map((file) => ({
          label: `$(${file.role === 'thumbnail' ? 'file-media' : 'file'}) ${file.role}`,
          description: file.path,
          detail: `${file.mediaType ?? 'unknown'} · ${file.assetRef}`,
        }));
        const summary = {
          label: '$(symbol-structure) Package summary',
          description: detail.representationKinds.join(', ') || 'unknown representation',
          detail: [
            `Capabilities: ${detail.capabilities.join(', ') || 'none'}`,
            `Missing: ${detail.missingRoles.join(', ') || 'none'}`,
          ].join('\n'),
        };
        await vscode.window.showQuickPick([summary, ...fileItems], {
          title: `Representation package: ${entity.name}`,
          placeHolder: 'Component files, capabilities, and missing roles',
        });
      },
    ),

    vscode.commands.registerCommand('neko.assets.entity.cancelBinding', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const bindingService = getBindingService();
      if (!bindingService) return;
      const bindings = await listBindingsForAsset(entity.id);
      if (bindings.length === 0) {
        vscode.window.showInformationMessage(`No entity binding points to "${entity.name}".`);
        return;
      }

      const picked = await vscode.window.showQuickPick(
        bindings.map((binding) => ({
          label: `$(debug-disconnect) ${binding.entityId} · ${binding.role}`,
          description: binding.assetRef,
          detail: 'Cancels the binding only. The asset entity and files remain in the library.',
          binding,
        })),
        { title: `Cancel binding for ${entity.name}` },
      );
      if (!picked) return;

      const plan = buildCancelEntityBindingPlan(picked.binding);
      const confirm = await vscode.window.showWarningMessage(
        `Cancel binding ${plan.bindingId}? This will not delete "${entity.name}".`,
        { modal: true },
        'Cancel Binding',
      );
      if (confirm !== 'Cancel Binding') return;

      try {
        await bindingService.remove(plan.bindingId);
        entityChangeEmitter?.fire();
        refresh();
      } catch (error) {
        await handleError(error, { showToUser: true });
      }
    }),

    vscode.commands.registerCommand('neko.assets.entity.delete', async (item?: unknown) => {
      const entity = getEntity(item);
      if (!entity) return;
      const bindings = await listBindingsForAsset(entity.id);
      const plan = buildDeleteAssetPlan(entity, bindings);
      const bindingNote =
        plan.bindingIds.length > 0
          ? ` It has ${plan.bindingIds.length} entity binding(s); cancel bindings separately if you only want to unlink.`
          : '';
      const confirm = await vscode.window.showWarningMessage(
        `Delete "${entity.name}"? This removes the asset entity and does not mean "cancel binding."${bindingNote}`,
        { modal: true },
        'Delete',
      );
      if (confirm !== 'Delete') return;
      try {
        await lib.deleteEntity(entity.id);
        await lib.flush();
        entityChangeEmitter?.fire();
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
      await openAssetPreview(vscode.Uri.file(filePath));
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
        entityChangeEmitter?.fire();
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
        entityChangeEmitter?.fire();
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
        entityChangeEmitter?.fire();
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
        void handleError(new Error('Only media files can be added to the timeline.'), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }

      try {
        await vscode.commands.executeCommand('neko.cut.addElement', {
          path: uri.fsPath,
          type: mediaType,
        });
      } catch {
        void handleError(new Error('Failed to add to timeline. Is neko-cut active?'), {
          showToUser: true,
        });
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
        void handleError(new Error('Failed to add to canvas. Is neko-canvas active?'), {
          showToUser: true,
        });
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
        entityChangeEmitter?.fire();
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
        void handleError(error instanceof Error ? error : new Error(String(error)), {
          showToUser: true,
        });
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
          entityChangeEmitter?.fire();

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
        await openAssetPreview(vscode.Uri.file(filePath));
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

  // Type filter labels and their AssetMediaType values
  const TYPE_FILTERS: Array<{ label: string; types: import('@neko/shared').AssetMediaType[] }> = [
    { label: '$(filter) All', types: [] },
    { label: '$(file-media) Video', types: ['video'] },
    { label: '$(unmute) Audio', types: ['audio'] },
    { label: '$(file) Image', types: ['image'] },
    { label: '$(file-text) Document', types: ['document', 'text'] },
  ];

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.assets.searchMediaLibrary', () => {
      const quickPick = vscode.window.createQuickPick<MediaSearchQuickPickItem>();
      quickPick.placeholder = t('mediaLibrary.search.placeholder');
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      // Type filter state — buttons in the QuickPick title bar
      let activeFilterIndex = 0;
      quickPick.buttons = TYPE_FILTERS.map((f, i) => ({
        iconPath:
          i === activeFilterIndex
            ? new vscode.ThemeIcon('check')
            : new vscode.ThemeIcon('circle-outline'),
        tooltip: f.label,
      }));

      const getActiveTypes = () => TYPE_FILTERS[activeFilterIndex]?.types ?? [];

      let searchTimer: ReturnType<typeof setTimeout> | undefined;
      let lastQuery = '';

      const doSearch = async (value: string) => {
        if (value.length < 2) {
          quickPick.items = [];
          return;
        }
        quickPick.busy = true;
        try {
          const activeTypes = getActiveTypes();
          const results = await searchService.search(value, {
            types: activeTypes.length > 0 ? activeTypes : undefined,
          });

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
                  mb >= 1 ? `${mb.toFixed(1)} MB` : `${(r.metadata.fileSize / 1024).toFixed(0)} KB`,
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
      };

      quickPick.onDidChangeValue((value) => {
        lastQuery = value;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => void doSearch(value), 200);
      });

      quickPick.onDidTriggerButton((button) => {
        const idx = quickPick.buttons.indexOf(button);
        if (idx >= 0 && idx !== activeFilterIndex) {
          activeFilterIndex = idx;
          quickPick.buttons = TYPE_FILTERS.map((f, i) => ({
            iconPath:
              i === activeFilterIndex
                ? new vscode.ThemeIcon('check')
                : new vscode.ThemeIcon('circle-outline'),
            tooltip: f.label,
          }));
          // Re-search with new filter
          if (lastQuery.length >= 2) {
            void doSearch(lastQuery);
          }
        }
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
            'Preview Files': [
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
              'pdf',
              'epub',
              'cbz',
              'cbr',
              'docx',
              'doc',
            ],
          },
        });
        if (!fileUri?.[0]) return;
        uri = fileUri[0];
      }

      try {
        await openAssetPreview(uri);
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
