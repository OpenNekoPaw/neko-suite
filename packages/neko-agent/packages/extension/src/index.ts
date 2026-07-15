/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as vscode from 'vscode';
import * as nodeOs from 'node:os';
import {
  ServiceCollection,
  setGlobalServices,
  getService,
  setRootLogger,
  setErrorHandler,
  getRootLogger,
} from './base';
import {
  createVSCodeLogger,
  VSCodeErrorHandler,
  inspectLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import {
  formatLocalMetadataUserDiagnostic,
  LogLevel,
  projectLocalMetadataUserDiagnostic,
  withTimeout,
  type NekoAgentAPI,
  type ProjectQualityFacade,
  type QualityProjectRef,
} from '@neko/shared';
import {
  createNodeGlobalResourceCacheMetadataBinding,
  type NodeGlobalResourceCacheMetadataBinding,
} from '@neko/shared/local-metadata/node';
import { builtinSkillLocales, getBuiltinSkills, registerBuiltinToolGroups } from '@neko/skills';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { ITaskManager } from './bootstrap';
import { createGeneratedAssetResourceResolver, setPlatformRootLogger } from '@neko/platform';
import { setRootLogger as setAgentRootLogger } from '@neko/agent';
import { ChatViewProvider } from './chat';
import {
  createExtensionConversationResume,
  type ExtensionConversationResumeBinding,
} from './chat/extensionConversationResume';
import { registerExtensionTools, buildEmbedFn } from './bootstrap/toolBootstrap';
import { registerAgentCoreCommands } from './commands/agentCoreCommands';
import { registerSkillCatalogActionCommands } from './commands/skillCatalogActions';
import {
  registerCreationQuickStartCommands,
  registerDocumentContextCommands,
} from './commands/agentContextCommands';
import {
  registerCanvasAmbientExtensionBridge,
  subscribeCanvasSelection,
} from './services/canvasAmbientExtensionBridge';
import {
  createAgentCapabilityRuntimeRegistries,
  createExternalResearchCapabilityProviderFromMcpConfig,
} from '@neko/agent/runtime';
import { registerEntityContributionAutomationCommand } from '@neko/entity/host-vscode';
import {
  bootstrapCapabilities,
  setCapabilityRuntimeContentAccessRuntime,
  setCapabilityRuntimeExternalProcessorRuntime,
} from './bootstrap/capabilityBootstrap';
import { createDocumentReadCapabilityProvider } from './tools/documentCapabilityProvider';
import { createMediaReadCapabilityProvider } from './tools/mediaCapabilityProvider';
import { createSemanticCoverageCapabilityProvider } from './tools/searchCapabilityProvider';
import { createQualityCapabilityProvider } from './tools/qualityCapabilityProvider';
import { createStatusBar } from './statusBar';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';
import {
  createVSCodeSemanticCoverageProvider,
  registerProjectSearchService,
} from '@neko/search/host-vscode';
import { createAgentProjectSearchAdapters } from './services/agentProjectSearchAdapters';
import { getSkillFileService } from './services/SkillFileService';
import { createSkillCatalogProvider } from './services/skillCatalogProvider';
import { ExternalProcessorRegistryService } from './services/externalProcessorRegistryService';
import { runResourceCacheStartupGc } from './services/resourceCacheStartupGcService';
import { getEngineClientProvider } from './services/engineClientProvider';
import { createExtensionAgentContentAccessRuntime } from './services/agentContentAccessRuntime';
import { createWorkspaceGeneratedAssetIndex } from './services/generatedAssetOpenResolver';
import {
  createHostContentMediaPathContext,
  createHostContentPathResolver,
  getHostContentAuthorizedReadRoots,
} from '@neko/shared/vscode/extension';
import {
  registerStreamLifecycleAcceptanceCommands,
  StreamLifecycleAcceptanceController,
} from './debug/streamLifecycleAcceptance';

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Off]: 'off',
};

const SHOW_LOGS_COMMAND = 'neko.agent.showLogs';
const LOCAL_METADATA_REVISION_POLL_MS = 2_000;

/**
 * Activate the extension
 */

const PROJECT_QUALITY_EXTENSION_BY_DOMAIN: Readonly<Record<QualityProjectRef['domain'], string>> = {
  sketch: 'neko.neko-sketch',
  cut: 'neko.neko-cut',
  audio: 'neko.neko-audio',
  model: 'neko.neko-model',
  puppet: 'neko.neko-puppet',
};

async function resolveOwningProjectQualityFacade(
  project: QualityProjectRef,
): Promise<ProjectQualityFacade | undefined> {
  const extensionId = PROJECT_QUALITY_EXTENSION_BY_DOMAIN[project.domain];
  const extension = vscode.extensions.getExtension<{
    readonly projectQuality?: ProjectQualityFacade;
  }>(extensionId);
  if (!extension) return undefined;
  const api = extension.isActive ? extension.exports : await extension.activate();
  return api?.projectQuality;
}

export async function activate(context: vscode.ExtensionContext): Promise<NekoAgentAPI> {
  // Initialize logger
  const logLevelSetting = inspectLogLevelSetting(context.extensionMode);
  const resolvedLogLevel = logLevelSetting.level;
  const logger = createVSCodeLogger('Neko Agent', 'NekoAgent', context, resolvedLogLevel, {
    showOutputCommand: SHOW_LOGS_COMMAND,
  });
  setRootLogger(logger);
  setPlatformRootLogger(logger.child('Platform'));
  setAgentRootLogger(logger.child('Agent'));

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  logger.info('Activating extension...');
  logger.info('Logger configured', {
    level: LOG_LEVEL_NAMES[resolvedLogLevel],
    extensionMode: context.extensionMode,
    extensionPath: context.extensionUri.fsPath,
    agentRuntimeLogger: logger.child('Agent').source,
    platformRuntimeLogger: logger.child('Platform').source,
    setting: {
      source: logLevelSetting.source,
      value: logLevelSetting.value,
      valid: logLevelSetting.valid,
      defaultValue: logLevelSetting.defaultValue,
      globalValue: logLevelSetting.globalValue,
      workspaceValue: logLevelSetting.workspaceValue,
      workspaceFolderValue: logLevelSetting.workspaceFolderValue,
    },
  });
  if (
    context.extensionMode === vscode.ExtensionMode.Development &&
    resolvedLogLevel !== LogLevel.Debug
  ) {
    logger.warn('Agent debug traces are disabled in the development extension host', {
      level: LOG_LEVEL_NAMES[resolvedLogLevel],
      setting: 'neko.logLevel',
      expected: 'debug',
    });
  }

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);
  context.subscriptions.push(services);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let conversationResume: ExtensionConversationResumeBinding | undefined;
  let globalResourceCache: NodeGlobalResourceCacheMetadataBinding | undefined;
  if (workspaceRoot) {
    try {
      conversationResume = await createExtensionConversationResume({
        homedir: nodeOs.homedir(),
        workDir: workspaceRoot,
      });
    } catch (error) {
      const diagnostic = projectLocalMetadataUserDiagnostic(error);
      if (!diagnostic) throw error;
      const message = formatLocalMetadataUserDiagnostic(diagnostic);
      await vscode.window.showErrorMessage(message);
      throw new Error(message, { cause: error });
    }
  } else {
    globalResourceCache = await createNodeGlobalResourceCacheMetadataBinding({
      homedir: nodeOs.homedir(),
    });
  }

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  let bootstrapResult: Awaited<ReturnType<typeof bootstrapCoreServices>>;
  try {
    bootstrapResult = await bootstrapCoreServices(
      services,
      context,
      conversationResume
        ? {
            taskStorage: conversationResume.taskStorage,
            taskRecoveryStorage: conversationResume.taskRecoveryStorage,
          }
        : undefined,
    );
  } catch (error) {
    await conversationResume?.disposeHost();
    throw error;
  }
  logServicesStatus(bootstrapResult);
  void runResourceCacheStartupGc({
    context,
    ...(conversationResume
      ? {
          manifestStores: {
            workspace: conversationResume.workspaceResourceCacheManifestStore,
            global: conversationResume.globalResourceCacheManifestStore,
          },
        }
      : globalResourceCache
        ? { manifestStores: { global: globalResourceCache.manifestStore } }
        : {}),
  })
    .catch((error) => {
      logger.warn('Failed to run resource cache startup GC', { error });
    })
    .finally(() => globalResourceCache?.dispose());

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  const capabilityRegistries = createAgentCapabilityRuntimeRegistries();
  registerBuiltinToolGroups(capabilityRegistries.toolGroupRegistry);
  const generatedAssetIndex =
    conversationResume && workspaceRoot
      ? await createWorkspaceGeneratedAssetIndex({
          manifestStore: conversationResume.workspaceResourceCacheManifestStore,
          workspaceRoot,
          homedir: nodeOs.homedir(),
          logger,
        })
      : undefined;
  const engineClientProvider = getEngineClientProvider();
  await engineClientProvider.setAuthorizedReadRoots?.(
    await getHostContentAuthorizedReadRoots({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
  );
  const agentContentAccess = createExtensionAgentContentAccessRuntime({
    context,
    engineClientProvider,
    workspaceRoot,
    ...(conversationResume
      ? { resourceCacheManifestStore: conversationResume.workspaceResourceCacheManifestStore }
      : {}),
    ...(generatedAssetIndex
      ? { resolveGeneratedAsset: createGeneratedAssetResourceResolver(generatedAssetIndex) }
      : {}),
    mediaPathContext: await createHostContentMediaPathContext({
      workspaceRoot,
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
    pathResolver: await createHostContentPathResolver({
      workspaceRoot,
      getExtension: vscode.extensions.getExtension,
      logger,
    }),
  });
  setCapabilityRuntimeContentAccessRuntime(agentContentAccess.runtime);

  // Register neko-agent host tools.
  registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform, context);

  const agentOwnedCapabilityContext = {
    extensionContext: context,
    mediaService: bootstrapResult.platform.media,
    configManager: bootstrapResult.platform.config,
    embedFn: buildEmbedFn(bootstrapResult.platform),
  };
  const capabilityDiscovery = bootstrapCapabilities(
    {
      toolRegistry: bootstrapResult.toolRegistry,
      skillRegistry: capabilityRegistries.skillRegistry,
      toolGroupRegistry: capabilityRegistries.toolGroupRegistry,
      artifactProfileRegistry: capabilityRegistries.artifactProfileRegistry,
      creationProfileRegistry: capabilityRegistries.creationProfileRegistry,
      providerExpressionProfileRegistry: capabilityRegistries.providerExpressionProfileRegistry,
      mediaService: agentOwnedCapabilityContext.mediaService,
      configManager: agentOwnedCapabilityContext.configManager,
      embedFn: agentOwnedCapabilityContext.embedFn,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    },
    context,
  );
  capabilityDiscovery.registerProvider(
    createDocumentReadCapabilityProvider(),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createMediaReadCapabilityProvider(),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createSemanticCoverageCapabilityProvider(),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createQualityCapabilityProvider({
      createService: () => bootstrapResult.platform.createService(),
      getContentAccessRuntime: () => agentContentAccess.runtime,
      projectQualityFacadeResolver: { resolve: resolveOwningProjectQualityFacade },
      resolveModelForPurpose: (purpose) =>
        bootstrapResult.platform.config.resolveModelRefForPurpose(purpose),
    }),
    agentOwnedCapabilityContext,
  );
  capabilityDiscovery.registerProvider(
    createExternalResearchCapabilityProviderFromMcpConfig({
      config:
        bootstrapResult.platform.config.getEffectiveAgentWorkspaceConfigSnapshot().externalResearch,
      mcpManager: bootstrapResult.mcpManager,
    }),
    agentOwnedCapabilityContext,
  );

  const externalProcessorRegistryService = new ExternalProcessorRegistryService({
    context,
    logger: logger.child('ExternalProcessorRegistry'),
  });
  setCapabilityRuntimeExternalProcessorRuntime(externalProcessorRegistryService.runtime);
  context.subscriptions.push(externalProcessorRegistryService);

  // Development acceptance traffic uses the canonical Timeline delivery path but
  // is isolated from product capabilities and conversation persistence.
  const streamLifecycleAcceptance =
    context.extensionMode === vscode.ExtensionMode.Development
      ? new StreamLifecycleAcceptanceController()
      : undefined;

  // Create chat view provider
  const chatViewProvider = new ChatViewProvider(context.extensionUri, context, {
    ...(conversationResume ? { conversationResume } : {}),
    ...(generatedAssetIndex ? { generatedAssetIndex } : {}),
  });
  const conversationResumeDiagnostics = chatViewProvider.getConversationResumeDiagnostics();
  if (conversationResumeDiagnostics.length > 0) {
    logger.warn('Some persisted conversations could not be restored', {
      diagnostics: conversationResumeDiagnostics,
    });
    void vscode.window.showWarningMessage(
      `${conversationResumeDiagnostics.length} persisted conversation(s) could not be restored. Their Journal data was preserved; review the Neko Agent logs for details.`,
    );
  }
  if (conversationResume) {
    const refreshSharedMetadata = (): void => {
      void chatViewProvider.refreshSharedMetadata().catch((error) => {
        logger.warn('Failed to refresh shared Agent metadata', { error });
      });
    };
    const revisionTimer = setInterval(refreshSharedMetadata, LOCAL_METADATA_REVISION_POLL_MS);
    context.subscriptions.push(
      { dispose: () => clearInterval(revisionTimer) },
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) refreshSharedMetadata();
      }),
    );
  }

  if (streamLifecycleAcceptance) {
    await registerStreamLifecycleAcceptanceCommands({
      context,
      chatViewProvider,
      controller: streamLifecycleAcceptance,
    });
  }

  // Register chat view
  context.subscriptions.push(
    chatViewProvider,
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider),
  );

  // Register commands
  registerAgentCoreCommands(context, chatViewProvider, services);

  // Creation quick-start commands — surface QuickPick / right-click entries
  // that funnel user intent into the Agent chat. Agent then picks the right
  // Skill to orchestrate atomic tools (no hard-coded pipeline routing).
  registerCreationQuickStartCommands(context, chatViewProvider);

  // Register document/media context menu commands (explorer/context)
  registerDocumentContextCommands(context, chatViewProvider);

  // Project cache/search service — host-side facade for Agent mention search.
  const projectSearchLogger = getRootLogger().child('ProjectSearch');
  registerProjectSearchService(context, {
    logger: projectSearchLogger,
    adapters: createAgentProjectSearchAdapters({
      logger: projectSearchLogger,
      ...(generatedAssetIndex ? { queryGeneratedAssets: () => generatedAssetIndex.list() } : {}),
      ...(conversationResume
        ? {
            searchProjection: {
              repository: conversationResume.searchDocuments,
              partition: conversationResume.searchPartition,
              hasProjection: async () => {
                if (!(await conversationResume.readSearchRevision())) return false;
                return (
                  await conversationResume.searchDocuments.list(conversationResume.searchPartition)
                ).some((document) => document.partition === 'media-library');
              },
              resolveFileKey: async (fileKey: string) => {
                try {
                  const resolved = await vscode.commands.executeCommand<unknown>(
                    'neko.assets.resolvePath',
                    fileKey,
                    {
                      owningWorkspaceRoot: workspaceRoot,
                      workspaceRoots: workspaceRoot ? [workspaceRoot] : [],
                    },
                  );
                  return typeof resolved === 'string' ? resolved : fileKey;
                } catch (error) {
                  projectSearchLogger.warn('Media search file key resolution failed', {
                    fileKey,
                    error,
                  });
                  return fileKey;
                }
              },
            },
            entityAssetProjection: {
              repository: conversationResume.entityAssetProjections,
              partition: conversationResume.entityAssetPartition,
              readRevision: () => conversationResume.readEntityAssetRevision(),
            },
          }
        : {}),
    }),
    semanticCoverageProviders: [
      createVSCodeSemanticCoverageProvider({
        logger: projectSearchLogger,
        ...(conversationResume
          ? {
              semanticProjection: {
                repository: conversationResume.semanticProjections,
                partition: conversationResume.semanticPartition,
              },
            }
          : {}),
      }),
    ],
  });
  context.subscriptions.push(
    registerEntityContributionAutomationCommand({
      logger: logger.child('EntityContributionAutomation'),
    }),
  );

  // Listen for extension changes to update tools (register disposable + avoid duplicates)
  let bridgeMetaToolsRegistered = true; // Already registered above
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      if (!bridgeMetaToolsRegistered) {
        registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform, context);
        bridgeMetaToolsRegistered = true;
        // Re-subscribe to canvas selection after late activation
        subscribeCanvasSelection(context);
      }
    }),
  );

  registerCanvasAmbientExtensionBridge(context, {
    onSelectionChanged: (nodes) => {
      chatViewProvider.sendAmbientCanvasContext(nodes);
    },
  });

  // Status bar — shows active LLM model, click to open chat
  context.subscriptions.push(createStatusBar(bootstrapResult.platform));

  await registerMarketInstallTargets(context);
  void externalProcessorRegistryService.refresh().catch((error) => {
    logger.warn('Failed to initialize external processor registry', { error });
  });

  getRootLogger().info('Extension activated');

  const dashboardBuiltinSkills = getBuiltinSkills({ locale: vscode.env.language });
  const skillCatalogProvider = createSkillCatalogProvider({
    builtinSkills: dashboardBuiltinSkills,
    locales: builtinSkillLocales,
  });
  const skillFileService = getSkillFileService();
  registerSkillCatalogActionCommands({
    context,
    chatViewProvider,
    skillFileService,
    skillCatalogProvider,
    builtinSkills: dashboardBuiltinSkills,
  });
  context.subscriptions.push(
    skillFileService.onSkillsChanged((result) => {
      skillCatalogProvider.updateScanResult(result);
    }),
  );
  void skillFileService
    .getSkills()
    .then((result) => skillCatalogProvider.updateScanResult(result))
    .catch((error) => {
      getRootLogger().warn('Failed to initialize Dashboard skill catalog', { error });
    });

  return {
    getSkills() {
      return skillCatalogProvider.getSkills();
    },
    async resolveGeneratedOutput(resourceRef) {
      if (
        resourceRef.kind !== 'generated' ||
        resourceRef.source.kind !== 'generated-asset' ||
        !resourceRef.source.generatedAssetId
      ) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output resolution requires generated-output ResourceRef identity.',
        };
      }
      const asset = generatedAssetIndex?.get(resourceRef.source.generatedAssetId);
      const lifecycle = asset?.lifecycle;
      if (!asset || !lifecycle) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output lifecycle metadata is unavailable.',
        };
      }
      if (
        lifecycle.resourceRef.id !== resourceRef.id ||
        lifecycle.contentDigest !== resourceRef.fingerprint.value
      ) {
        return {
          status: 'unavailable',
          diagnostic: 'Generated output ResourceRef no longer matches its lifecycle revision.',
        };
      }
      return {
        status: 'ready',
        assetId: lifecycle.assetId,
        revision: lifecycle.revision,
        contentDigest: lifecycle.contentDigest,
        mediaKind: lifecycle.mediaKind,
        mimeType: lifecycle.mimeType,
        taskId: lifecycle.generation.taskId,
        ...(lifecycle.generation.runId ? { runId: lifecycle.generation.runId } : {}),
        sourcePath: asset.path,
      };
    },
    async setGeneratedOutputReviewPin(resourceRef, input) {
      if (!agentContentAccess.resourceCache) {
        throw new Error('Generated output review pinning requires ResourceCache.');
      }
      const result = await agentContentAccess.resourceCache.updateLifecycle({
        ref: resourceRef,
        variant: { role: 'source' },
        pinned: input.pinned,
        sessionActive: input.pinned,
        ...(input.pinned ? { retentionHint: 'pinned' as const } : {}),
        reason: input.pinned ? 'canvas-generated-review-open' : 'canvas-generated-review-closed',
        ownerId: input.ownerId,
      });
      if (result.status !== 'ready') {
        throw new Error(result.error ?? 'Generated output review pin update failed.');
      }
    },
  };
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
  const logger = getRootLogger();
  logger.info('Deactivating extension...');

  const taskManager = getService(ITaskManager);
  if (!taskManager) {
    return;
  }

  await withTimeout(taskManager.dispose(), 3000).catch((error) => {
    logger.warn('Timed out while disposing task manager during deactivate', { error });
  });
}
