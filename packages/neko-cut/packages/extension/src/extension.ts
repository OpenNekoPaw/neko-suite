/**
 * NekoCut Extension - Professional video editor for VSCode
 *
 * Main entry point using the new architecture with:
 * - ServiceCollection for dependency injection
 * - EditorRegistry + Model pattern
 * - Bootstrap services for MCP, Platform, Workflow
 */
import * as vscode from 'vscode';
import {
  ServiceCollection,
  setGlobalServices,
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
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { VideoEditorProvider } from './editor/video/videoEditorProvider';
import { registerCommands } from './commands';
import type { NekoCutAPI, ISkillProvider, SkillDef } from '@neko/shared';
import { createNekoCutCapabilityProvider } from './agentCapabilityProvider';
import { TimelineToolExecutor } from './services/TimelineToolExecutor';
import { TimelineToolBridge } from './services/timelineToolBridge';
import { NekoCutDashboardTaskSource } from './services/dashboardTaskSource';
import { registerMarketInstallTargets } from './market/registerMarketInstallTargets';

/**
 * Activate the extension
 */
export async function activate(
  context: vscode.ExtensionContext,
): Promise<NekoCutAPI & ISkillProvider> {
  // Initialize logger → VSCode OutputChannel + Console
  const logger = createVSCodeLogger(
    'Neko Cut',
    'NekoCut',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  setRootLogger(logger);

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));
  watchLogLevel(logger, context);

  logger.info('Activating extension...');

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);

  // Create providers
  const videoEditorProvider = new VideoEditorProvider(context);

  // Register custom editor (CustomTextEditorProvider for .nkv files)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('neko.videoEditor', videoEditorProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }),
  );

  // Register outline view
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('neko.projectOutline', bootstrapResult.outlineProvider),
  );

  // Register commands
  registerCommands(context, bootstrapResult.outlineProvider, videoEditorProvider);

  const dashboardTaskSource = new NekoCutDashboardTaskSource(videoEditorProvider);
  context.subscriptions.push(
    dashboardTaskSource,
    vscode.commands.registerCommand('neko.cut.getDashboardTaskSource', () => dashboardTaskSource),
  );

  // Register media preview command (opens in neko-preview's customEditor)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.cut.previewMedia', async (uri?: vscode.Uri) => {
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
        getRootLogger().error('Failed to open media preview', error);
      }
    }),
  );

  getRootLogger().info('Extension activated');

  // ── P2: Exported API for neko-agent cross-extension communication ──────────
  // The `ai` namespace delegates to neko-agent via VSCode command so that
  // neko-cut doesn't take a direct dependency on @neko/platform.
  const timelineBridge = new TimelineToolBridge(new TimelineToolExecutor());
  const api: NekoCutAPI & ISkillProvider = {
    timeline: {
      getInfo: () => timelineBridge.getInfo(),
      addElement: (config) => timelineBridge.addElement(config),
      updateElement: (id, updates) => timelineBridge.updateElement(id, updates),
      deleteElement: (id) => timelineBridge.deleteElement(id),
      listElements: () => timelineBridge.listElements(),
    },

    ai: {
      /**
       * Generate a video clip via neko-agent and add it to the timeline.
       * Delegates the heavy lifting to the `neko.agent.generateForNode`-like command.
       */
      generateVideoForClip: async (options) => {
        const result = await vscode.commands.executeCommand<{ elementId: string } | undefined>(
          'neko.cut.ai.generateVideoForClip',
          options,
        );
        if (!result?.elementId) {
          throw new Error('Video generation failed or neko-agent is not installed');
        }
        return result.elementId;
      },
    },

    // ── P3: ISkillProvider ────────────────────────────────────────────────────
    getSkills(): readonly SkillDef[] {
      return [
        {
          id: 'generate-video-clip',
          name: 'Generate Video Clip',
          description:
            'Generate an AI video clip from a text prompt and add it directly to the timeline. ' +
            'Supports image-to-video when a reference image is provided.',
          icon: '$(play-circle)',
          command: 'neko.cut.ai.generateVideoForClip',
          tags: ['generation', 'video', 'timeline'],
        },
        {
          id: 'transcribe-audio',
          name: 'Transcribe Audio to Subtitles',
          description:
            'Transcribe audio or video file speech to text using Whisper, then add subtitle ' +
            'elements to the timeline with word-level timestamps.',
          icon: '$(mic)',
          command: 'neko.cut.ai.transcribeToSubtitles',
          tags: ['transcription', 'audio', 'subtitles'],
        },
      ];
    },
  };

  // Register the VSCode command for ai.generateVideoForClip
  // so the API method above can delegate properly.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.cut.ai.generateVideoForClip',
      async (options: Parameters<NekoCutAPI['ai']['generateVideoForClip']>[0]) => {
        // Delegate to neko-agent GenerateVideoForClip tool via internal chat command
        const elementId = await vscode.commands.executeCommand<string | undefined>(
          'neko.agent.generateForNode',
          {
            nodeId: `cut-${Date.now()}`,
            prompt: options.prompt,
            referenceRefs: options.referenceImageBase64
              ? [options.referenceImageBase64]
              : undefined,
          },
        );
        return elementId ? { elementId } : undefined;
      },
    ),
  );

  // Register Agent Capability Provider (P0-1: sub-package owns its tool definitions)
  // This provides neko-cut's timeline tools to neko-agent via the discovery protocol.
  // Falls back silently if neko-agent is not installed.
  try {
    const capabilityProvider = createNekoCutCapabilityProvider(api, timelineBridge);
    void vscode.commands.executeCommand('neko.agent.registerCapabilities', capabilityProvider);
  } catch {
    // neko-agent not installed — capability registration silently skipped
  }

  await registerMarketInstallTargets(context);

  return api;
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
