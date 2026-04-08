/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  ServiceCollection,
  setGlobalServices,
  setRootLogger,
  setErrorHandler,
  getRootLogger,
} from './base';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import { bootstrapCoreServices, logServicesStatus, IPlatform } from './bootstrap';
import type { ChatMessage } from '@neko/platform';
import { setPlatformRootLogger } from '@neko/platform';
import { setRootLogger as setAgentRootLogger } from '@neko/agent';
import { ChatViewProvider } from './chat';
import { registerExtensionTools, buildEmbedFn } from './bootstrap/toolBootstrap';
import {
  setCanvasSelection,
  clearCanvasSelection,
  onDidChangeCanvasSelection,
  recordCanvasChange,
} from './services/canvasAmbientContext';
import { NEKO_EXTENSION_IDS } from '@neko/shared';
import type {
  CreativeEntityRef,
  NekoAgentAPI,
  NekoCanvasAPI,
  NekoStoryAPI,
  OccurrenceIndexEntry,
} from '@neko/shared';
import { bootstrapPipeline } from './pipeline/pipeline-bootstrap';
import { bootstrapCapabilities } from './bootstrap/capabilityBootstrap';
import { getSkillFileService } from './services/SkillFileService';
import { createStatusBar } from './statusBar';
import { getSlashCommandRegistry } from './services/slashCommandRegistry';
import type { PluginSlashCommandDef } from './services/slashCommandRegistry';
import type { Platform } from '@neko/platform';
import {
  extractCharacterIdsFromCanvasNode,
  extractObjectIdsFromCanvasNode,
  projectCharacterOccurrencesFromCanvasNode,
  projectObjectOccurrencesFromCanvasNode,
  projectSceneOccurrencesFromCanvasNode,
} from './utils/entityBinding';
import { GeneratedAssetIndex, resolveGeneratedDir } from './services/generatedAssetIndex';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<NekoAgentAPI> {
  // Initialize logger
  const logger = createVSCodeLogger('Neko Agent', 'NekoAgent', context);
  setRootLogger(logger);
  setPlatformRootLogger(logger.child('Platform'));
  setAgentRootLogger(logger.child('Agent'));

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));

  logger.info('Activating extension...');

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);

  // Register tools from other Neko extensions
  registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform);

  // Initialize Pipeline orchestration layer (L2)
  bootstrapPipeline(bootstrapResult.platform, bootstrapResult.toolRegistry);

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  bootstrapCapabilities(
    {
      toolRegistry: bootstrapResult.toolRegistry,
      mediaService: bootstrapResult.platform.media,
      configManager: bootstrapResult.platform.config,
      embedFn: buildEmbedFn(bootstrapResult.platform),
    },
    context,
  );

  // Create chat view provider
  const chatViewProvider = new ChatViewProvider(context.extensionUri, context);

  // Register chat view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider),
  );

  // Register commands
  registerCommands(context, chatViewProvider, services);

  // Register pipeline commands
  registerPipelineCommands(context, chatViewProvider);

  // Register document/media context menu commands (explorer/context)
  registerDocumentContextCommands(context, chatViewProvider);

  // Listen for extension changes to update tools (register disposable + avoid duplicates)
  let extensionToolsRegistered = true; // Already registered above
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      if (!extensionToolsRegistered) {
        registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform);
        extensionToolsRegistered = true;
        // Re-subscribe to canvas selection after late activation
        subscribeCanvasSelection(context);
      }
    }),
  );

  // Subscribe to canvas selection changes for ambient context injection
  subscribeCanvasSelection(context);

  // Broadcast canvas selection changes to webview for ambient chip display
  context.subscriptions.push(
    onDidChangeCanvasSelection((nodes) => {
      chatViewProvider.sendAmbientCanvasContext(nodes);
    }),
  );

  // Status bar — shows active LLM model, click to open chat
  context.subscriptions.push(createStatusBar(bootstrapResult.platform));

  const generatedAssetIndex = createGeneratedAssetIndex();
  if (generatedAssetIndex) {
    context.subscriptions.push({
      dispose: () => {
        generatedAssetIndex.dispose();
      },
    });
  }

  getRootLogger().info('Extension activated');

  return createAgentApi(generatedAssetIndex);
}

function createGeneratedAssetIndex(): GeneratedAssetIndex | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return undefined;
  }

  try {
    const generatedDir = resolveGeneratedDir(workspaceRoot);
    return new GeneratedAssetIndex(generatedDir);
  } catch {
    getRootLogger().warn('Failed to initialize generated asset index for extension API');
    return undefined;
  }
}

function createAgentApi(assetIndex?: GeneratedAssetIndex): NekoAgentAPI {
  const findCharacterOccurrences = async (characterId: string) => {
    const results: OccurrenceIndexEntry[] = [];
    const storyApi = await getStoryApi();
    if (storyApi) {
      results.push(...(await storyApi.entities.findCharacterOccurrences(characterId)));
    }

    const canvasApi = await getCanvasApi();
    if (canvasApi) {
      const canvasDocumentUri = await canvasApi.canvas.getActiveDocumentUri();
      const nodes = await canvasApi.nodes.list();
      for (const node of nodes) {
        results.push(
          ...projectCharacterOccurrencesFromCanvasNode(node, characterId, canvasDocumentUri),
        );
      }
    }

    if (assetIndex) {
      await assetIndex.load();
      results.push(...assetIndex.listOccurrencesByCharacterId(characterId));
    }

    return dedupeOccurrences(results);
  };

  const findOccurrences = async (entity: CreativeEntityRef) => {
    if (entity.kind === 'character') {
      return findCharacterOccurrences(entity.id);
    }

    if (entity.kind === 'scene') {
      const results: OccurrenceIndexEntry[] = [];
      const storyApi = await getStoryApi();
      if (storyApi) {
        results.push(...(await storyApi.entities.findOccurrences(entity)));
      }

      const canvasApi = await getCanvasApi();
      if (canvasApi) {
        const canvasDocumentUri = await canvasApi.canvas.getActiveDocumentUri();
        const nodes = await canvasApi.nodes.list();
        for (const node of nodes) {
          results.push(
            ...projectSceneOccurrencesFromCanvasNode(node, entity.id, canvasDocumentUri),
          );
        }
      }

      return dedupeOccurrences(results);
    }

    if (entity.kind === 'object') {
      const results: OccurrenceIndexEntry[] = [];
      const canvasApi = await getCanvasApi();
      if (canvasApi) {
        const canvasDocumentUri = await canvasApi.canvas.getActiveDocumentUri();
        const nodes = await canvasApi.nodes.list();
        for (const node of nodes) {
          results.push(
            ...projectObjectOccurrencesFromCanvasNode(node, entity.id, canvasDocumentUri),
          );
        }
      }

      if (assetIndex) {
        await assetIndex.load();
        results.push(...assetIndex.listOccurrencesByObjectId(entity.id));
      }

      return dedupeOccurrences(results);
    }

    return [];
  };

  return {
    entities: {
      findOccurrences,
      findCharacterOccurrences,
    },
  };
}

async function getStoryApi(): Promise<NekoStoryAPI | undefined> {
  const storyExt = vscode.extensions.getExtension<NekoStoryAPI>(NEKO_EXTENSION_IDS.NEKO_STORY);
  if (!storyExt) {
    return undefined;
  }

  try {
    return storyExt.isActive ? storyExt.exports : ((await storyExt.activate()) as NekoStoryAPI);
  } catch {
    return undefined;
  }
}

async function getCanvasApi(): Promise<NekoCanvasAPI | undefined> {
  const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>(NEKO_EXTENSION_IDS.NEKO_CANVAS);
  if (!canvasExt) {
    return undefined;
  }

  try {
    return canvasExt.isActive ? canvasExt.exports : ((await canvasExt.activate()) as NekoCanvasAPI);
  } catch {
    return undefined;
  }
}

function dedupeOccurrences(entries: readonly OccurrenceIndexEntry[]): OccurrenceIndexEntry[] {
  const seen = new Set<string>();
  const results: OccurrenceIndexEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.source}:${entry.sourceId}:${entry.locator.uri ?? ''}:${entry.locator.lineStart ?? -1}:${entry.locator.nodeId ?? ''}:${entry.entity.kind}:${entry.entity.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(entry);
  }

  return results;
}

/**
 * Subscribe to NekoCanvas selection changes for ambient context injection.
 * Also subscribes to asset and canvas change events (P1) so the agent can
 * track mutations between interactions.
 * Safe to call multiple times — only one subscription per activation.
 */
function subscribeCanvasSelection(context: vscode.ExtensionContext): void {
  const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
  if (!canvasExt) return;

  const activate = canvasExt.isActive ? Promise.resolve(canvasExt.exports) : canvasExt.activate();

  activate
    .then((api) => {
      if (!api) return;

      // Selection → ambient chip injection
      if (api.nodes?.onSelectionChange) {
        context.subscriptions.push(
          api.nodes.onSelectionChange((nodes) => setCanvasSelection(nodes)),
        );
      }

      // Asset changes → ring buffer for ambient context injection
      if (api.events?.onDidChangeAssets) {
        context.subscriptions.push(
          api.events.onDidChangeAssets((ev) =>
            recordCanvasChange({
              domain: 'assets',
              changeType: ev.type,
              id: ev.assetId,
              timestamp: Date.now(),
            }),
          ),
        );
      }

      // Canvas node/shape changes → ring buffer
      if (api.events?.onDidChangeCanvas) {
        context.subscriptions.push(
          api.events.onDidChangeCanvas((ev) =>
            recordCanvasChange({
              domain: 'canvas',
              changeType: ev.type,
              id: ev.nodeId ?? ev.shapeId,
              timestamp: Date.now(),
            }),
          ),
        );
      }
    })
    .catch(() => {
      // neko-canvas not available — ambient context simply stays empty
    });
}

// Tool registration moved to ./bootstrap/toolBootstrap.ts

/** Default max tokens for the internal chat command. */
const INTERNAL_CHAT_DEFAULT_MAX_TOKENS = 1000;

/**
 * Discover new Ollama models and add them to ~/.neko/config.json.
 *
 * Called by the neko.agent.refreshModels command after a GGUF model
 * is registered with Ollama via neko-market ModelInstallTarget.
 */
async function refreshOllamaModels(platform: Platform): Promise<void> {
  const providers = platform.config.getProviders().filter((p) => p.type === 'ollama');
  if (providers.length === 0) return;

  let added = 0;
  for (const provider of providers) {
    try {
      const apiUrl = (provider.apiUrl ?? 'http://localhost:11434/api').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) continue;

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const existing = new Set(platform.config.getModelsByProvider(provider.id).map((m) => m.name));

      for (const { name } of data.models ?? []) {
        if (!existing.has(name)) {
          await platform.config.setModel({
            id: `${provider.id}-${name}`,
            name,
            providerId: provider.id,
            capabilities: ['chat'],
            enabled: true,
          });
          added++;
        }
      }
    } catch {
      // Ollama not running or not reachable — ignore
    }
  }

  getRootLogger().info(`Ollama model refresh: +${added} new model(s)`);
}

/**
 * Register extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  services: ServiceCollection,
): void {
  // Open AI Chat
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chat', () => {
      vscode.commands.executeCommand('neko.aiAssistant.focus');
    }),
  );

  // Send message to AI Assistant
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.sendMessage', async (message: string) => {
      await chatViewProvider.sendMessageToAssistant(message, true);
    }),
  );

  // Attach agent context from any sub-package (canvas node, cut clip, story selection, etc.)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.sendContext',
      async (payload: import('@neko/shared').AgentContextPayload) => {
        await chatViewProvider.sendContextPayload(payload);
      },
    ),
  );

  // Generate Image (placeholder)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateImage', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the image you want to generate',
        placeHolder: 'A beautiful sunset over mountains...',
      });

      if (prompt) {
        await chatViewProvider.sendMessageToAssistant(`Generate an image: ${prompt}`, true);
      }
    }),
  );

  // Generate Video (placeholder)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateVideo', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the video you want to generate',
        placeHolder: 'A timelapse of clouds moving...',
      });

      if (prompt) {
        await chatViewProvider.sendMessageToAssistant(`Generate a video: ${prompt}`, true);
      }
    }),
  );

  // Script commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generate', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const selection = editor.selection;
      const text = editor.document.getText(selection.isEmpty ? undefined : selection);

      await chatViewProvider.sendMessageToAssistant(`Generate a script based on: ${text}`, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.optimize', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const text = editor.document.getText();
      await chatViewProvider.sendMessageToAssistant(`Optimize this script: ${text}`, true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateImage', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const text = editor.document.getText();
      await chatViewProvider.sendMessageToAssistant(
        `Generate images for this script: ${text}`,
        true,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateVideo', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const text = editor.document.getText();
      await chatViewProvider.sendMessageToAssistant(
        `Generate a video from this script: ${text}`,
        true,
      );
    }),
  );

  // Called by neko-market after a Skill package is installed/uninstalled.
  // The file watcher in SkillFileService usually catches it automatically;
  // this command provides an explicit trigger as a fallback.
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.rescanSkills', () => {
      getSkillFileService()
        .triggerRescan()
        .catch((err) => {
          getRootLogger().warn('neko.agent.rescanSkills failed', { error: err });
        });
    }),
  );

  // Called by neko-market ModelInstallTarget after a GGUF model is registered with Ollama.
  // Discovers new Ollama models and adds them to ~/.neko/config.json.
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.refreshModels', async () => {
      const platform = services.get(IPlatform);
      if (!platform) return;
      await refreshOllamaModels(platform);
    }),
  );

  // AutoPrompt: converts shot metadata (visual description, characters, scale, etc.)
  // from Chinese to a structured English image-generation prompt.
  // Called by canvasEditorProvider when GenerationPromptPanel requests AutoPrompt.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.buildPrompt',
      async (shotData: {
        visualDescription?: string;
        characters?: Array<{ characterName: string }>;
        shotScale?: string;
        cameraMovement?: string;
        cameraAngle?: string;
        characterAction?: string;
        emotion?: string[];
        sceneTags?: string[];
        dialogue?: string;
      }): Promise<string> => {
        try {
          const platform = services.get(IPlatform);
          if (!platform) return '';
          const service = platform.createService();

          const parts: string[] = [];
          if (shotData.visualDescription) parts.push(`Scene: ${shotData.visualDescription}`);
          if (shotData.characters?.length) {
            parts.push(`Characters: ${shotData.characters.map((c) => c.characterName).join(', ')}`);
          }
          if (shotData.shotScale) parts.push(`Shot scale: ${shotData.shotScale}`);
          if (shotData.cameraMovement && shotData.cameraMovement !== 'static') {
            parts.push(`Camera: ${shotData.cameraMovement}`);
          }
          if (shotData.cameraAngle && shotData.cameraAngle !== 'eye-level') {
            parts.push(`Angle: ${shotData.cameraAngle}`);
          }
          if (shotData.characterAction) parts.push(`Action: ${shotData.characterAction}`);
          if (shotData.emotion?.length) parts.push(`Emotion: ${shotData.emotion.join(', ')}`);
          if (shotData.sceneTags?.length) parts.push(`Tags: ${shotData.sceneTags.join(', ')}`);
          if (shotData.dialogue) parts.push(`Dialogue: "${shotData.dialogue}"`);

          const userContent = parts.join('\n');
          const messages: ChatMessage[] = [
            {
              role: 'system',
              content:
                'You are an expert cinematographer and image generation prompt engineer. ' +
                'Given shot metadata (which may be in Chinese or English), output a single, ' +
                'concise English image generation prompt (≤120 words). ' +
                'Follow this structure: subject + environment + lighting + composition + style. ' +
                'Include shot scale, camera angle, and character emotions naturally. ' +
                'Output ONLY the prompt text, no explanations or markdown.',
            },
            {
              role: 'user',
              content: userContent || 'Generate an image prompt for this shot.',
            },
          ];

          const response = await service.chat(messages, { maxTokens: 300 });

          const content = response.message.content;
          return typeof content === 'string' ? content.trim() : '';
        } catch (err) {
          getRootLogger().warn('neko.agent.buildPrompt failed', { error: err });
          return '';
        }
      },
    ),
  );

  // Plugin slash command registration API.
  // Other Neko extensions (neko-canvas, neko-cut, etc.) call this to add
  // custom slash commands to the agent chat panel.
  const slashRegistry = getSlashCommandRegistry();
  context.subscriptions.push(
    slashRegistry,
    vscode.commands.registerCommand(
      'neko.agent.registerSlashCommands',
      (extensionId: string, commands: PluginSlashCommandDef[]) => {
        if (!extensionId || !Array.isArray(commands)) return;
        slashRegistry.register(extensionId, commands);
        // Push updated list to webview immediately
        chatViewProvider.sendPluginSlashCommands(slashRegistry.getAll());
      },
    ),
  );
  // Also push on registry changes triggered by late-registering extensions
  context.subscriptions.push(
    slashRegistry.onDidChange(() => {
      chatViewProvider.sendPluginSlashCommands(slashRegistry.getAll());
    }),
  );

  // ── P1: Generation progress broadcast ──────────────────────────────────────
  // Called by neko-canvas BatchGenerationScheduler after each status change.
  // Forwards the event to the chat webview so users can see generation progress
  // without switching to the canvas panel.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.reportGenerationProgress',
      (progress: {
        nodeId: string;
        taskId: string;
        cellId?: string;
        status: 'pending' | 'generating' | 'done' | 'error';
        count?: number;
        total?: number;
      }) => {
        chatViewProvider.postMessage({ type: 'generationProgress', progress });
      },
    ),
  );

  // ── P1: Cross-extension drag-and-drop payload commands ─────────────────────
  // Target extensions (canvas, cut) call these to query the dragged asset on drop.
  const dndBroker = chatViewProvider.dndBroker;
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.getDndPayload', () => {
      return dndBroker.getPayload();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.agent.clearDndPayload', () => {
      dndBroker.clearPayload();
    }),
  );

  // ── P1: Image generation for canvas nodes ──────────────────────────────────
  // Called by neko-canvas BatchGenerationScheduler (callAgent).
  // Executes a text-to-image generation via the configured platform media service
  // and returns the result as a base64 data URL.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.generateForNode',
      async (input: {
        nodeId: string;
        cellId?: string;
        prompt: string;
        style?: string;
        ratio?: string;
        shotScale?: string;
        cameraMovement?: string;
        cameraAngle?: string;
        referenceRefs?: string[];
        count?: number;
      }): Promise<{ dataUrl: string } | undefined> => {
        try {
          const platform = services.get(IPlatform);
          if (!platform?.media) {
            getRootLogger().warn('neko.agent.generateForNode: no media service configured');
            return undefined;
          }

          // Build an image generation prompt from shot metadata
          const parts: string[] = [input.prompt];
          if (input.shotScale) parts.push(`Shot: ${input.shotScale}`);
          if (input.cameraAngle) parts.push(`Angle: ${input.cameraAngle}`);
          if (input.cameraMovement && input.cameraMovement !== 'static') {
            parts.push(`Camera: ${input.cameraMovement}`);
          }
          if (input.style) parts.push(`Style: ${input.style}`);

          let characterIds: string[] = [];
          let objectIds: string[] = [];
          const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
          if (canvasExt) {
            try {
              const canvasApi = canvasExt.isActive
                ? canvasExt.exports
                : ((await canvasExt.activate()) as NekoCanvasAPI);
              const sourceNode = await canvasApi.nodes.get(input.nodeId);
              characterIds = extractCharacterIdsFromCanvasNode(sourceNode);
              objectIds = extractObjectIdsFromCanvasNode(sourceNode);
            } catch (err) {
              getRootLogger().warn('Failed to resolve canvas node generation bindings', {
                error: err,
              });
            }
          }

          const task = await platform.media.generateImage({
            prompt: parts.join(', '),
            ratio: (input.ratio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | undefined) ?? '16:9',
            count: input.count ?? 1,
            metadata: {
              sourceNodeId: input.nodeId,
              characterIds,
              objectIds,
            },
          });

          // Report generating status to the webview
          chatViewProvider.postMessage({
            type: 'generationProgress',
            progress: {
              nodeId: input.nodeId,
              taskId: task.id,
              cellId: input.cellId,
              status: 'generating',
            },
          });

          const completed = await platform.media.waitForTask(task.id, 3 * 60 * 1000);

          if (completed.status !== 'completed' || !completed.outputs?.length) {
            chatViewProvider.postMessage({
              type: 'generationProgress',
              progress: {
                nodeId: input.nodeId,
                taskId: task.id,
                cellId: input.cellId,
                status: 'error',
              },
            });
            return undefined;
          }

          const output = completed.outputs[0]!;
          const response = await fetch(output.url);
          if (!response.ok) return undefined;

          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = output.mimeType ?? 'image/png';
          const dataUrl = `data:${mimeType};base64,${base64}`;

          chatViewProvider.postMessage({
            type: 'generationProgress',
            progress: {
              nodeId: input.nodeId,
              taskId: task.id,
              cellId: input.cellId,
              status: 'done',
            },
          });

          return { dataUrl };
        } catch (err) {
          getRootLogger().warn('neko.agent.generateForNode failed', { error: err });
          return undefined;
        }
      },
    ),
  );

  // Register getter so _restoreState can push plugin commands on panel visibility restore
  chatViewProvider.setPluginCommandsGetter(() => slashRegistry.getAll());

  // Internal API: allows other Neko extensions to use the configured LLM
  // without taking a direct dependency on @neko/platform.
  // Returns null if no service is configured or on any error.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.internalChat',
      async (messages: ChatMessage[], options?: { maxTokens?: number }): Promise<string | null> => {
        try {
          const platform = services.get(IPlatform);
          if (!platform) return null;
          const service = platform.createService();
          const response = await service.chat(messages, {
            maxTokens: options?.maxTokens ?? INTERNAL_CHAT_DEFAULT_MAX_TOKENS,
          });
          const content = response.message.content;
          return typeof content === 'string' ? content : null;
        } catch (err) {
          getRootLogger().warn('neko.agent.internalChat failed', { error: err });
          return null;
        }
      },
    ),
  );
}

/**
 * Register pipeline commands — LLM-routed via Agent chat
 *
 * Commands collect context (file path, user intent) and send to Agent.
 * Agent's Skill matching + LLM understanding selects the right Pipeline.
 * This way new Skill Pipelines are auto-supported without code changes.
 */
function registerPipelineCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  // Start Creative Pipeline — QuickPick for intent, then send to Agent
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.pipeline.start', async () => {
      const intent = await vscode.window.showQuickPick(
        [
          {
            label: '$(file-text) Script → Video',
            description: 'Convert a screenplay to video',
            value: 'Convert my script to video',
          },
          {
            label: '$(file-pdf) Document → Video',
            description: 'Turn a document into video',
            value: 'Create a video from my document',
          },
          {
            label: '$(image) Images → Video',
            description: 'Generate video from visual concepts',
            value: 'Create a video from these visual concepts',
          },
          {
            label: '$(zap) Quick Generate',
            description: 'Describe scenes to generate',
            value: 'Generate videos for these scenes',
          },
        ],
        { placeHolder: 'Choose a creative pipeline...' },
      );

      if (!intent) return;

      // Ask for source file
      const fileUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: {
          Scripts: ['fountain', 'nks'],
          Documents: ['md', 'txt', 'pdf', 'docx'],
          'All Files': ['*'],
        },
        openLabel: 'Select Source File',
      });

      if (fileUris && fileUris.length > 0) {
        const filePath = fileUris[0].fsPath;
        await chatViewProvider.sendMessageToAssistant(
          `${intent.value}. Source file: ${filePath}`,
          true,
        );
      } else {
        // No file selected — let user describe in chat
        await chatViewProvider.sendMessageToAssistant(intent.value, true);
      }
    }),
  );

  // Start from File — Right-click context menu, auto-detect file type
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.pipeline.startFromFile', async (uri?: vscode.Uri) => {
      // Resolve file path from context menu URI or active editor
      let filePath: string | undefined;

      if (uri) {
        filePath = uri.fsPath;
      } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          filePath = editor.document.uri.fsPath;
        }
      }

      if (!filePath) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      // Build intent message based on file extension
      const ext = filePath.split('.').pop()?.toLowerCase();
      let intent: string;

      switch (ext) {
        case 'fountain':
        case 'nks':
          intent = 'Convert this screenplay to video';
          break;
        case 'pdf':
        case 'docx':
        case 'doc':
          intent = 'Create a video from this document';
          break;
        case 'md':
        case 'txt':
          intent = 'Create a video from this text';
          break;
        default:
          intent = 'Create a video from this file';
          break;
      }

      await chatViewProvider.sendMessageToAssistant(`${intent}. Source file: ${filePath}`, true);
    }),
  );

  // Retry Failed — send retry intent to Agent
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.pipeline.retryFailed', async () => {
      await chatViewProvider.sendMessageToAssistant(
        'Retry the failed scenes from my last pipeline',
        true,
      );
    }),
  );
}

/**
 * Register AI commands surfaced in the Explorer context menu.
 *
 * All commands send file-level chips to the agent panel.
 * The agent reads document/image/video content on demand via its tools.
 */
function registerDocumentContextCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
): void {
  /** Resolve file path from context-menu URI or fall back to active editor. */
  function resolveFilePath(uri: vscode.Uri | undefined): string | undefined {
    return uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
  }

  // Add to Agent — attach one or more files as context chips in the chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.addToContext',
      async (uri?: vscode.Uri, allUris?: vscode.Uri[]) => {
        // Support multi-select: use allUris when available, else single uri
        const uris = allUris && allUris.length > 0 ? allUris : uri ? [uri] : [];
        if (uris.length === 0) {
          const filePath = resolveFilePath(undefined);
          if (filePath) {
            uris.push(vscode.Uri.file(filePath));
          }
        }
        if (uris.length === 0) return;

        for (const fileUri of uris) {
          const relPath = vscode.workspace.asRelativePath(fileUri);
          const fileName = path.basename(fileUri.fsPath);
          await chatViewProvider.sendContextPayload({
            type: 'file',
            id: fileUri.toString(),
            label: fileName,
            summary: `File: ${relPath}`,
            data: { filePath: fileUri.fsPath, relativePath: relPath },
          });
        }
      },
    ),
  );

  /** Send a file-level chip to agent with an intent hint. */
  async function sendFileChip(
    uri: vscode.Uri | undefined,
    intent: string,
    typeOverride?: import('@neko/shared').AgentContextType,
  ): Promise<void> {
    const fp = resolveFilePath(uri);
    if (!fp) return;
    const fileName = path.basename(fp);
    const relPath = vscode.workspace.asRelativePath(fp);
    const ext = path.extname(fp).toLowerCase();
    const type =
      typeOverride ?? (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(ext) ? 'image' : 'file');
    await chatViewProvider.sendContextPayload({
      type,
      id: `file:${fp}:${Date.now()}`,
      label: fileName,
      summary: `File: ${relPath}`,
      data: { filePath: fp, relativePath: relPath },
      intent,
    });
  }

  // Summarize document — file-level chip, agent reads on demand
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.summarizeDocument', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, '请总结这个文档的要点：');
    }),
  );

  // Chat with document — file-level chip
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chatWithDocument', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, '我想讨论一下这个文档：');
    }),
  );

  // Analyze image — file-level chip
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.analyzeImage', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, '请分析这张图片：', 'image');
    }),
  );

  // Extract image text — OCR intent
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.extractImageText', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, '请提取这张图片中的文字（OCR）：', 'image');
    }),
  );

  // Analyze video — file-level chip
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.analyzeVideo', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, '请分析这个视频：');
    }),
  );

  // Generate subtitles — file-level chip
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateSubtitles', async (uri?: vscode.Uri) => {
      await sendFileChip(uri, '请为这个视频生成字幕：');
    }),
  );
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
