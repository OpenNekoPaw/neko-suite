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
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { withTimeout, type ISkillProvider, type SkillDef } from '@neko/shared';
import { builtinSkills } from '@neko/agent/skill';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { ITaskManager } from './bootstrap';
import { setPlatformRootLogger } from '@neko/platform';
import { setRootLogger as setAgentRootLogger } from '@neko/agent';
import { ChatViewProvider } from './chat';
import { registerExtensionTools, buildEmbedFn } from './bootstrap/toolBootstrap';
import { registerAgentCoreCommands } from './commands/agentCoreCommands';
import {
  registerCreationQuickStartCommands,
  registerDocumentContextCommands,
} from './commands/agentContextCommands';
import {
  registerCanvasAmbientExtensionBridge,
  subscribeCanvasSelection,
} from './services/canvasAmbientExtensionBridge';
import { createAgentCapabilityRuntimeRegistries } from '@neko/agent/runtime';
import { bootstrapCapabilities } from './bootstrap/capabilityBootstrap';
import { createStatusBar } from './statusBar';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<ISkillProvider> {
  // Initialize logger
  const logger = createVSCodeLogger(
    'Neko Agent',
    'NekoAgent',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);
  setPlatformRootLogger(logger.child('Platform'));
  setAgentRootLogger(logger.child('Agent'));

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  logger.info('Activating extension...');

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);
  context.subscriptions.push(services);

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);

  // Register tools from other Neko extensions
  registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform);

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  const capabilityRegistries = createAgentCapabilityRuntimeRegistries();

  bootstrapCapabilities(
    {
      toolRegistry: bootstrapResult.toolRegistry,
      skillRegistry: capabilityRegistries.skillRegistry,
      toolGroupRegistry: capabilityRegistries.toolGroupRegistry,
      mediaService: bootstrapResult.platform.media,
      configManager: bootstrapResult.platform.config,
      embedFn: buildEmbedFn(bootstrapResult.platform),
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    },
    context,
  );

  // Create chat view provider
  const chatViewProvider = new ChatViewProvider(context.extensionUri, context);

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

  // Listen for extension changes to update tools (register disposable + avoid duplicates)
  let bridgeMetaToolsRegistered = true; // Already registered above
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      if (!bridgeMetaToolsRegistered) {
        registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform);
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

  getRootLogger().info('Extension activated');

  const PERSONA_SKILL_NAMES = new Set([
    'creation-persona',
    'execution-persona',
    'iteration-persona',
  ]);

  return {
    getSkills(): SkillDef[] {
      return builtinSkills
        .filter((s) => s.enabled && !PERSONA_SKILL_NAMES.has(s.name))
        .map((s) => ({
          id: s.name,
          name: s.name
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          description: s.description.split('.')[0] ?? s.description,
          icon: s.icon,
          command: 'neko.agent.invokeSkill',
          tags: s.allowedTools?.length ? ['ai', ...(s.command ? ['slash-command'] : [])] : ['ai'],
        }));
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
