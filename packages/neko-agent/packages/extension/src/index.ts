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
import {
  createNekoCutTools,
  createNekoCanvasTools,
  createNekoEngineEffectsTools,
  createTranscribeTools,
  createNekoStoryTools,
  createNekoSketchTools,
} from './tools/extensionTools';
import { setCanvasSelection, clearCanvasSelection } from './services/canvasAmbientContext';
import type { NekoCanvasAPI } from '@neko/shared';
import { bootstrapPipeline } from './pipeline/pipeline-bootstrap';
import { getSkillFileService } from './services/SkillFileService';
import { createStatusBar } from './statusBar';
import type { Platform } from '@neko/platform';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
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

  // Status bar — shows active LLM model, click to open chat
  context.subscriptions.push(createStatusBar(bootstrapResult.platform));

  getRootLogger().info('Extension activated');
}

/**
 * Subscribe to NekoCanvas selection changes for ambient context injection.
 * Safe to call multiple times — only one subscription per activation.
 */
function subscribeCanvasSelection(context: vscode.ExtensionContext): void {
  const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
  if (!canvasExt) return;

  const activate = canvasExt.isActive ? Promise.resolve(canvasExt.exports) : canvasExt.activate();

  activate
    .then((api) => {
      if (!api?.nodes?.onSelectionChange) return;
      context.subscriptions.push(api.nodes.onSelectionChange((nodes) => setCanvasSelection(nodes)));
      // Clear ambient context when canvas editor loses focus is handled by
      // canvas extension firing onSelectionChange with [] on dispose.
    })
    .catch(() => {
      // neko-canvas not available — ambient context simply stays empty
    });
}

/**
 * Register tools from other Neko extensions (NekoCut, NekoCanvas, Engine Effects, NekoStory).
 *
 * `platform` is used to build an embedFn for SearchScriptIndex (L3 semantic search).
 * If no embedding-capable provider is configured, SearchScriptIndex is omitted gracefully.
 */
function registerExtensionTools(
  toolRegistry: { register: (tool: unknown) => void },
  platform: Platform,
): void {
  // Register NekoCut tools
  const nekocutTools = createNekoCutTools();
  nekocutTools.forEach((tool) => toolRegistry.register(tool));

  // Register NekoCanvas tools
  const nekocanvasTools = createNekoCanvasTools();
  nekocanvasTools.forEach((tool) => toolRegistry.register(tool));

  // Register Engine Effects tools (GPU shader management)
  const effectsTools = createNekoEngineEffectsTools();
  effectsTools.forEach((tool) => toolRegistry.register(tool));

  // Register Transcribe tools (Whisper STT)
  const transcribeTools = createTranscribeTools();
  transcribeTools.forEach((tool) => toolRegistry.register(tool));

  // Build embedding function from the platform's service (requires an embedding-capable provider).
  // Returns undefined if no such provider is configured — SearchScriptIndex is silently omitted.
  const embedFn = buildEmbedFn(platform);

  // Register NekoStory tools (screenplay index + semantic search)
  const storyTools = createNekoStoryTools(embedFn);
  storyTools.forEach((tool) => toolRegistry.register(tool));

  // Register NekoSketch tools (AI image generation → canvas layer)
  const sketchTools = createNekoSketchTools(platform.media);
  sketchTools.forEach((tool) => toolRegistry.register(tool));

  getRootLogger().info(
    `Registered ${nekocutTools.length + nekocanvasTools.length + effectsTools.length + transcribeTools.length + storyTools.length + sketchTools.length} extension tools`,
  );
}

/**
 * Builds an embed function backed by the platform's AI service.
 * The service is created lazily on first call. Errors (e.g. no embedding-capable
 * provider configured) propagate to the caller so SearchScriptIndex can surface
 * a descriptive error message instead of silently failing.
 */
function buildEmbedFn(platform: Platform): (texts: string[]) => Promise<number[][]> {
  let service: ReturnType<Platform['createService']> | undefined;
  return async (texts: string[]) => {
    if (!service) {
      service = platform.createService();
    }
    const result = await service.embed(texts);
    return result.embeddings;
  };
}

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
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
