/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as path from 'path';
import * as fsp from 'node:fs/promises';
import * as vscode from 'vscode';
import {
  ServiceCollection,
  setGlobalServices,
  setRootLogger,
  setErrorHandler,
  getRootLogger,
  handleError,
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
import type { NekoCanvasAPI } from '@neko/shared';
import { bootstrapWorkflow } from './workflow/workflow-bootstrap';
import {
  bootstrapOrchestrator,
  isOrchestratorEnabled,
  type Orchestrator,
} from './workflow/orchestrator-bootstrap';
import { WorkflowPlanHandler } from './workflow/workflow-plan-handler';
import {
  createApprovalEngine,
  declarativeStrategyPack,
  imperativeStrategyPack,
  createPlanReviewApprovalAdapter,
} from '@neko/agent/approval';
import { bootstrapCapabilities } from './bootstrap/capabilityBootstrap';
import { getSkillFileService } from './services/SkillFileService';
import { createStatusBar } from './statusBar';
import { getSlashCommandRegistry } from './services/slashCommandRegistry';
import type { PluginSlashCommandDef } from './services/slashCommandRegistry';
import type { Platform } from '@neko/platform';
import type { WorkflowBootstrapResult } from './workflow/workflow-bootstrap';
import { subscribeWorkflowProgress } from './workflow/workflow-progress-bridge';

/** Infer an image MIME type from a file path extension; defaults to image/png. */
function inferImageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.avif':
      return 'image/avif';
    default:
      return 'image/png';
  }
}

/**
 * Convert a `file://` URL to a native filesystem path. Handles three cases:
 *   1. POSIX absolute:    `file:///abs/path` → `/abs/path`
 *   2. Windows drive:     `file:///C:/path`  → `C:/path` (strip leading `/`)
 *   3. Windows UNC:       `file://server/share/a.png` → `\\server\share\a.png`
 *
 * UNC paths have a non-empty `host`; drive-letter and POSIX paths have an
 * empty host. Without this branching, UNC URLs collapse to just the pathname
 * and silently fail to read from network shares.
 */
function fileUrlToPath(url: string): string {
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname);
  const host = parsed.host;
  if (host) {
    // UNC: construct `\\server\share\...` (preserve backslashes for Windows APIs).
    return `\\\\${host}${pathname.replace(/\//g, '\\')}`;
  }
  // Windows drive-letter paths come back as "/C:/foo" — strip the leading slash.
  if (/^\/[A-Za-z]:[\\/]/.test(pathname)) {
    return pathname.slice(1);
  }
  return pathname;
}

/**
 * Resolve an image reference (data URL / file path / http URL) to a
 * `{ base64, mimeType }` pair for downstream IP-Adapter / multimodal use.
 *
 * Accepted inputs:
 *   - `data:image/png;base64,XXX`       → strips prefix, preserves declared MIME
 *   - `/abs/path/to/image.jpg`          → reads file, infers MIME from extension
 *   - `file:///abs/path/to/image.webp`  → reads file (Windows-safe), infers MIME
 *   - `http(s)://...`                   → fetches, uses response content-type
 *   - bare base64 string                → returned as-is with `image/png` default
 */
async function resolveImageToBase64(
  source: string,
): Promise<{ base64: string; mimeType: string } | undefined> {
  if (!source) return undefined;
  if (source.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(source);
    if (!match) return undefined;
    return { base64: match[2] ?? '', mimeType: match[1] ?? 'image/png' };
  }
  try {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);
      if (!response.ok) return undefined;
      const buffer = await response.arrayBuffer();
      const mimeType = response.headers.get('content-type') ?? inferImageMime(source);
      return { base64: Buffer.from(buffer).toString('base64'), mimeType };
    }
    const filePath = source.startsWith('file://') ? fileUrlToPath(source) : source;
    // POSIX absolute `/...`, Windows drive `C:\...` / `C:/...`, or UNC `\\server\share\...`
    if (
      filePath.startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(filePath) ||
      filePath.startsWith('\\\\')
    ) {
      const buffer = await fsp.readFile(filePath);
      return { base64: buffer.toString('base64'), mimeType: inferImageMime(filePath) };
    }
    // Relative paths or unrecognized schemes (neko://, asset://): fall back to
    // treating the string as already-base64 PNG. Adapters that accept bare
    // base64 will continue to work; callers may override MIME if known.
    return { base64: source, mimeType: 'image/png' };
  } catch {
    return undefined;
  }
}

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

  // P4 — extension-scoped ApprovalEngine shared across the workflow
  // lane (QualityGate + Plan Review). AgentSession instances in the AI
  // lane still build their own private engine with the same strategy
  // packs; the two lanes don't share state today, but they share
  // policy (strategy packs) so decisions stay consistent.
  //
  // Flow accessor is pinned to 'creation' here because the workflow
  // lane (Plan Review + QualityGate) always runs on the outer ring.
  // When the AI lane wires its own FlowSwitcher into its session the
  // engine it sees is separate (per-session) and reads live flow.
  const approvalEngine = createApprovalEngine({
    strategyPacks: [declarativeStrategyPack, imperativeStrategyPack],
  });
  const planReviewAdapter = createPlanReviewApprovalAdapter({ engine: approvalEngine });

  // Initialize Pipeline orchestration layer (L2)
  const pipelineBootstrap = bootstrapWorkflow(
    bootstrapResult.platform,
    bootstrapResult.toolRegistry,
    {
      approval: {
        engine: approvalEngine,
      },
    },
  );

  // Initialize Workflow Orchestrator (Phase 1 MVP — see
  // docs/architecture/workflow-routing.md / plan-mode.md).
  // Behind the `neko.workflow.orchestrator.enabled` setting; when disabled
  // the extension keeps the legacy `neko.agent.startPipeline` path untouched.
  const orchestrator: Orchestrator = await bootstrapOrchestrator({
    platform: bootstrapResult.platform,
    workDir: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    startPipeline: pipelineBootstrap.startPipeline,
  });
  context.subscriptions.push({ dispose: () => orchestrator.dispose() });

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

  // Plan-layer handler bridges orchestrator → chat webview (Phase 1.5).
  // Must be wired AFTER chatViewProvider exists.
  const workflowPlanHandler = new WorkflowPlanHandler({
    orchestrator,
    getWebview: () => chatViewProvider.webview,
    // P4 — route auto-approve through the unified ApprovalEngine.
    evaluatePlanApproval: planReviewAdapter,
  });
  chatViewProvider.setWorkflowPlanHandler(workflowPlanHandler);
  context.subscriptions.push({
    dispose: () => chatViewProvider.setWorkflowPlanHandler(undefined),
  });

  // Phase 3.5: attach the RouterAskBroker so the LLM router's `ask_user`
  // tool can surface interactive clarifying questions to the webview. Only
  // meaningful when the LLM router is enabled by flag.
  if (orchestrator.llmRouter) {
    const { RouterAskBroker } = await import('./workflow/router-ask-broker');
    const askBroker = new RouterAskBroker({
      getWebview: () => chatViewProvider.webview,
    });
    orchestrator.llmRouter.setAskBroker(askBroker);
    chatViewProvider.setRouterAskBroker(askBroker);
    context.subscriptions.push({
      dispose: () => {
        orchestrator.llmRouter?.setAskBroker(undefined);
        chatViewProvider.setRouterAskBroker(undefined);
      },
    });
  }

  // Register commands
  registerCommands(
    context,
    chatViewProvider,
    services,
    pipelineBootstrap,
    orchestrator,
    workflowPlanHandler,
  );

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

  getRootLogger().info('Extension activated');
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
  pipelineBootstrap: WorkflowBootstrapResult,
  orchestrator: Orchestrator,
  workflowPlanHandler: WorkflowPlanHandler,
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.startPipeline',
      async (params: {
        flowId: 'flowA' | 'flowB' | 'flowC' | 'flowD' | 'flowE' | 'flowF';
        source: string;
        sourceFormat?: 'fountain' | 'freeform' | 'document';
        style?: string;
        importToCanvas?: boolean;
        canvasStartX?: number;
        canvasStartY?: number;
        eventCommand?: string;
        eventPayload?: Record<string, unknown>;
        skipStages?: string[];
        stageParams?: Record<string, Record<string, unknown>>;
        generationUnit?: 'scene' | 'shot';
      }) => {
        const handle = pipelineBootstrap.startPipeline(
          params.flowId,
          {
            source: params.source,
            sourceFormat: params.sourceFormat,
            globalStyle: params.style,
            generationUnit: params.generationUnit,
            stageParams: {
              ...(params.stageParams ?? {}),
              ...(params.importToCanvas
                ? {
                    importStoryboardToCanvas: {
                      enabled: true,
                      startX: params.canvasStartX,
                      startY: params.canvasStartY,
                    },
                  }
                : {}),
            },
          },
          {
            skipStages: params.skipStages,
            globalStyle: params.style,
          },
        );

        subscribeWorkflowProgress(chatViewProvider.webview, handle.id, handle, {
          eventCommand: params.eventCommand,
          eventPayload: params.eventPayload,
        });

        return { pipelineId: handle.id, flowId: handle.flowId };
      },
    ),
  );

  // Routed Pipeline (Phase 1 MVP — Workflow/Plan/Pipeline glue).
  // See docs/architecture/workflow-routing.md + plan-mode.md.
  // Feature-flagged behind neko.workflow.orchestrator.enabled.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.startRoutedWorkflow',
      async (params: {
        /** The raw input to route; one of prompt/file/files/project */
        input:
          | { kind: 'prompt'; text: string }
          | { kind: 'file'; path: string; size?: number }
          | { kind: 'files'; paths: string[]; totalSize?: number }
          | { kind: 'project'; path: string; workflow?: string };
        /** Optional user override (forceLevel, etc.) */
        routerOverrides?: {
          forceLevel?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
          skipPlanMode?: boolean;
          disableLlmRouter?: boolean;
        };
        /** Optional global style / aspect ratio */
        globalStyle?: string;
        /** Whether to only build a plan (preview) and skip dispatch */
        previewOnly?: boolean;
        /** Optional progress event bridge */
        eventCommand?: string;
        eventPayload?: Record<string, unknown>;
      }) => {
        if (!isOrchestratorEnabled()) {
          throw new Error(
            'Workflow orchestrator is disabled. Enable it via the ' +
              '"neko.workflow.orchestrator.enabled" setting (Phase 1 preview).',
          );
        }

        if (params.previewOnly) {
          const preview = await orchestrator.buildPlan(params.input, params.routerOverrides);
          return {
            route: preview.route,
            plan: preview.plan,
          };
        }

        // Interactive flow: build → preview in chat webview → await user decision.
        const { getPlanAutoApproveThreshold } = await import('./workflow/workflow-settings');
        const autoApproveThreshold = getPlanAutoApproveThreshold();
        const presentation = await workflowPlanHandler.presentAndDispatch({
          input: params.input,
          ...(params.routerOverrides !== undefined && { routerOverrides: params.routerOverrides }),
          ...(params.globalStyle !== undefined && { globalStyle: params.globalStyle }),
          autoApproveThreshold,
        });

        if (!presentation.result) {
          // User aborted — return the plan metadata without dispatch info
          return {
            route: presentation.route,
            plan: presentation.plan,
            pipelineId: undefined,
            flowId: undefined,
            aborted: true,
          };
        }

        const chatWebview = chatViewProvider.webview;
        if (chatWebview) {
          workflowPlanHandler.attachProgressForwarder(
            presentation.plan.id,
            presentation.result,
            chatWebview,
            params.eventCommand,
          );
        }

        return {
          route: presentation.route,
          plan: presentation.plan,
          pipelineId: presentation.result.handle.id,
          flowId: presentation.result.handle.flowId,
          aborted: false,
        };
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
        void handleError(new Error('No active editor'), { showToUser: true });
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
        void handleError(new Error('No active editor'), { showToUser: true });
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
        void handleError(new Error('No active editor'), { showToUser: true });
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
        void handleError(new Error('No active editor'), { showToUser: true });
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
  //
  // @deprecated since Phase 6.3 (2026-04-19).  New code should go through the
  // Workflow Orchestrator (routed pipelines + Plan mode) which produces the
  // same generation via batch-generate stage + MediaGenerationService while
  // recording provenance into NkPlan / .nkproj.upgradeHistory.  This command
  // stays alive for:
  //   (1) BatchGenerationScheduler legacy call path
  //   (2) Programmatic callers that have not migrated to
  //       `neko.agent.startRoutedWorkflow`
  // Removal timeline: earliest next major release once orchestrator telemetry
  // shows < 5% of generations flowing through this command.
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
        characterIds?: string[];
        sourceNodeId?: string;
        // ControlNet fields
        controlMode?: string;
        controlStrength?: number;
        controlImageBase64?: string;
        negativePrompt?: string;
        // IP-Adapter fields
        ipAdapterRefs?: Array<{
          imageBase64: string;
          mimeType?: string;
          strength?: number;
          mode?: string;
        }>;
        // Inpaint fields
        maskBase64?: string;
        inpaintStrength?: number;
        // Edit instruction
        editInstruction?: string;
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

          const metadata: Record<string, unknown> = {
            nodeId: input.nodeId,
            sourceNodeId: input.sourceNodeId ?? input.nodeId,
          };
          if (input.cellId) {
            metadata['cellId'] = input.cellId;
          }
          if (input.characterIds && input.characterIds.length > 0) {
            metadata['characterIds'] = input.characterIds;
          }

          // Resolve referenceRefs → IP-Adapter references (load gallery/shot images)
          let resolvedIpAdapterRefs = input.ipAdapterRefs;
          if (!resolvedIpAdapterRefs?.length && input.referenceRefs?.length) {
            const canvasExt = vscode.extensions.getExtension<NekoCanvasAPI>('neko.nekocanvas');
            if (canvasExt?.isActive) {
              const canvasApi = canvasExt.exports;
              const refs: Array<{
                imageBase64: string;
                mimeType?: string;
                strength?: number;
                mode?: string;
              }> = [];
              for (const refStr of input.referenceRefs) {
                const [refNodeId, refCellId] = refStr.split(':');
                if (!refNodeId) continue;
                try {
                  const refNode = await canvasApi.nodes.get(refNodeId);
                  if (!refNode) continue;
                  // Prefer ADR-4 `generatedAsset.path` (absolute file path) over
                  // the deprecated `generatedImage` (data URL / path string).
                  let imageSource: string | undefined;
                  if (refNode.type === 'gallery') {
                    const data = refNode.data as {
                      cells?: Array<{
                        id: string;
                        image?: string;
                        generatedAsset?: { path?: string };
                      }>;
                    };
                    if (data.cells) {
                      const cell = refCellId
                        ? data.cells.find((c) => c.id === refCellId)
                        : data.cells.find((c) => c.generatedAsset?.path || c.image);
                      imageSource = cell?.generatedAsset?.path ?? cell?.image;
                    }
                  } else if (refNode.type === 'shot') {
                    const data = refNode.data as {
                      generatedAsset?: { path?: string };
                      generatedImage?: string;
                    };
                    imageSource = data.generatedAsset?.path ?? data.generatedImage;
                  }
                  if (!imageSource) continue;
                  const resolved = await resolveImageToBase64(imageSource);
                  if (resolved) {
                    refs.push({
                      imageBase64: resolved.base64,
                      mimeType: resolved.mimeType,
                      strength: 0.6,
                      mode: 'both',
                    });
                  }
                } catch {
                  getRootLogger().warn(`Failed to resolve IP-Adapter reference: ${refStr}`);
                }
              }
              if (refs.length > 0) {
                resolvedIpAdapterRefs = refs;
              }
            }
          }

          const task = await platform.media.generateImage({
            prompt: parts.join(', '),
            aspectRatio:
              (input.ratio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | undefined) ?? '16:9',
            count: input.count ?? 1,
            metadata,
            style: input.style,
            negativePrompt: input.negativePrompt,
            controlImageBase64: input.controlImageBase64,
            controlMode: input.controlMode as
              | 'canny'
              | 'depth'
              | 'pose'
              | 'normal'
              | 'segment'
              | 'lineart'
              | 'softedge'
              | 'scribble'
              | undefined,
            controlStrength: input.controlStrength,
            ipAdapterRefs: resolvedIpAdapterRefs as Array<{
              imageBase64: string;
              mimeType?: string;
              strength?: number;
              mode?: 'style' | 'subject' | 'both';
            }>,
            maskBase64: input.maskBase64,
            inpaintStrength: input.inpaintStrength,
            editInstruction: input.editInstruction,
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
  //
  // @deprecated since Phase 6.3 (2026-04-19).  Prefer
  // `neko.agent.startRoutedWorkflow` which routes through the Workflow
  // Orchestrator (FastProbe + Plan Mode) instead of an intent QuickPick.
  // Both paths produce the same pipeline execution; the routed path adds
  // provenance, reference chain, and render-mode selection.  Retained for
  // users who disable `neko.workflow.orchestrator.enabled`.
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
        void handleError(new Error('No file selected'), { showToUser: true });
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
