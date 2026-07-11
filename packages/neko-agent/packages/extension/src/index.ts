/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as vscode from 'vscode';
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
import { LogLevel, withTimeout, type ISkillProvider } from '@neko/shared';
import { builtinSkillLocales, getBuiltinSkills, registerBuiltinToolGroups } from '@neko/skills';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { ITaskManager } from './bootstrap';
import { setPlatformRootLogger } from '@neko/platform';
import { setRootLogger as setAgentRootLogger } from '@neko/agent';
import { ChatViewProvider } from './chat';
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

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<ISkillProvider> {
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

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);
  void runResourceCacheStartupGc({ context }).catch((error) => {
    logger.warn('Failed to run resource cache startup GC', { error });
  });

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  const capabilityRegistries = createAgentCapabilityRuntimeRegistries();
  registerBuiltinToolGroups(capabilityRegistries.toolGroupRegistry);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
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
    ...(streamLifecycleAcceptance ? { timelineSnapshotRouter: streamLifecycleAcceptance } : {}),
  });

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
    }),
    semanticCoverageProviders: [
      createVSCodeSemanticCoverageProvider({
        logger: projectSearchLogger,
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
