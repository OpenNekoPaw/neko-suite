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
import {
  withTimeout,
  type ISkillProvider,
  type SkillDef,
  type SkillLocalizedText,
} from '@neko/shared';
import { builtinSkills } from '@neko/agent/skill';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { ITaskManager } from './bootstrap';
import { setPlatformRootLogger } from '@neko/platform';
import { setRootLogger as setAgentRootLogger } from '@neko/agent';
import { ChatViewProvider } from './chat';
import {
  registerExtensionToolGroups,
  registerExtensionTools,
  buildEmbedFn,
} from './bootstrap/toolBootstrap';
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
import { registerProjectSearchService } from './services/projectSearch/commands';

type SkillLocaleMap = Readonly<Record<string, SkillLocalizedText>>;

const BUILTIN_SKILL_LOCALES: Readonly<Record<string, SkillLocaleMap>> = {
  'ai-generate': {
    'zh-cn': {
      name: 'AI 媒体生成',
      description: '生成图片、视频、语音和背景音乐等 AI 媒体内容。',
      tags: ['AI', '生成'],
    },
  },
  'scene-to-music': {
    'zh-cn': {
      name: '场景配乐',
      description: '分析时间线场景并生成匹配的背景音乐，然后插入为音频轨道。',
      tags: ['AI', '配乐', '时间线'],
    },
  },
  'video-editing': {
    'zh-cn': {
      name: '视频剪辑助手',
      description: '协助完成剪切、裁剪、转场、时间线调整、分割与合并片段等视频剪辑任务。',
      tags: ['AI', '剪辑', '时间线'],
    },
  },
  'color-grading': {
    'zh-cn': {
      name: '调色助手',
      description: '协助完成调色、校色、LUT、白平衡、曝光、对比度和电影感风格处理。',
      tags: ['AI', '调色', '视频'],
    },
  },
  'audio-mixing': {
    'zh-cn': {
      name: '音频混音助手',
      description: '协助调整音量、音乐、旁白、音效、标准化、淡入淡出和自动闪避。',
      tags: ['AI', '音频', '混音'],
    },
  },
  'subtitle-assistant': {
    'zh-cn': {
      name: '字幕助手',
      description: '协助添加字幕、创建说明文字、转写视频、翻译字幕并调整字幕时间轴。',
      tags: ['AI', '字幕', '转写'],
    },
  },
  'script-generation': {
    'zh-cn': {
      name: '剧本生成',
      description: '协助创作剧本、分镜脚本、对白和短片、广告、音乐视频等内容草稿。',
      tags: ['AI', '剧本', '写作'],
    },
  },
  'script-to-timeline': {
    'zh-cn': {
      name: '剧本转时间线',
      description: '将 Fountain 剧本转换为 NekoCut 时间线项目，生成场景和对白字幕轨道。',
      tags: ['AI', '剧本', '时间线'],
    },
  },
  'comic-to-storyboard': {
    'zh-cn': {
      name: '漫画转故事板',
      description: '分析漫画或分镜页，提取画格、对白和镜头信息并转换为故事板。',
      tags: ['AI', '漫画', '故事板'],
    },
  },
  'quality-assessment': {
    'zh-cn': {
      name: '质量检查',
      description: '检查媒体质量、伪影、响度、提示词匹配和风格漂移，并给出修复建议。',
      tags: ['AI', '质量', '检查'],
    },
  },
};

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

  // Initialize capability discovery (P0-1: sub-packages register their own tools)
  // Platform services are injected into context so providers can use media/config/embed
  // without depending on @neko/platform directly.
  const capabilityRegistries = createAgentCapabilityRuntimeRegistries();
  registerExtensionToolGroups(capabilityRegistries.toolGroupRegistry);

  // Register neko-agent host tools.
  registerExtensionTools(bootstrapResult.toolRegistry, bootstrapResult.platform);

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

  // Project cache/search service — host-side facade for Agent mention search.
  registerProjectSearchService(context);

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
          name: formatSkillName(s.name),
          description: s.description.split('.')[0] ?? s.description,
          icon: s.icon,
          command: 'neko.agent.invokeSkill',
          tags: s.allowedTools?.length ? ['ai', ...(s.command ? ['slash-command'] : [])] : ['ai'],
          locales: BUILTIN_SKILL_LOCALES[s.name],
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

function formatSkillName(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
