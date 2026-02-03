/**
 * Service Bootstrap
 * 核心服务初始化模块
 *
 * 职责：协调所有服务的初始化和注册
 *
 * 架构说明：
 * - neko-cut 是独立的视频编辑器核心
 * - Agent 功能 (neko-agent) 和媒体引擎 (neko-engine) 通过可选服务发现
 * - 增强功能通过 HTTP/命令通信，非强制依赖
 */

import * as vscode from 'vscode';
import {
  type Platform,
  type ToolRegistry,
  registerGenerationTools,
  createMediaServiceAdapter,
} from '@neko/platform';
import {
  MCPManager,
  ToolCategoryRegistry,
  TaskManager,
} from '@neko/agent';
import { ServiceCollection, createServiceId } from '../base';
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { VideoEditorModelProvider } from '../editor/video/videoEditorModel';
import { IStatusBar, StatusBar } from '../views/statusBar';
import { IVideoProjectOutlineProvider, VideoProjectOutlineProvider } from '../views/outlineProvider';
import {
  ConnectionStateManager,
  IConnectionStateManager,
} from '../services/connectionStateManager';
import { VSCodeTaskStorage } from '../services/vscodeTaskStorage';
import { IProjectSessionService, ProjectSessionService } from '../services/ProjectSessionService';
import { IAssetService, AssetService } from '../services/AssetService';

// Bootstrap modules (same directory)
import { createPlatformInstance } from './platformFactory';
import { registerBuiltinTools } from './toolsBootstrap';
import { connectMCPServers } from './mcpBootstrap';
import { checkWorkflowEngines } from './workflowBootstrap';

// =============================================================================
// Service Identifiers
// =============================================================================

export const IPlatform = createServiceId<Platform>('platform');
export const IToolRegistry = createServiceId<ToolRegistry>('toolRegistry');
export const IMCPManager = createServiceId<MCPManager>('mcpManager');
export const ITaskManager = createServiceId<TaskManager>('taskManager');

// Re-export service IDs
export { IConnectionStateManager, IAssetService };

// =============================================================================
// Optional Service Identifiers (provided by other extensions)
// =============================================================================

/**
 * Optional Agent Manager interface (provided by neko-agent)
 */
export interface IOptionalAgentManager {
  getOrCreate(conversationId: string): unknown;
  get(conversationId: string): unknown | undefined;
  isRunning(conversationId: string): boolean;
}

/**
 * Optional Media Engine Manager interface (provided by neko-engine)
 */
export interface IOptionalMediaEngineManager {
  getMode(): string;
  setMode(mode: string): Promise<void>;
  analyzeMedia(mediaInfo: unknown): unknown;
}

/**
 * Optional External API Server interface (provided by neko-engine)
 */
export interface IOptionalExternalAPIServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const IAgentManager = createServiceId<IOptionalAgentManager | null>('agentManager');
export const IMediaEngineManager = createServiceId<IOptionalMediaEngineManager | null>('mediaEngineManager');
export const IExternalAPIServer = createServiceId<IOptionalExternalAPIServer | null>('externalAPIServer');

// =============================================================================
// VS Code Tool Types
// =============================================================================

/**
 * VS Code specific tool context
 */
export interface VSCodeToolContext {
  activeEditor?: {
    type: string;
    uri: vscode.Uri;
  };
  workspaceRoot?: string;
  selection?: string;
}

// =============================================================================
// Service Bootstrap Result
// =============================================================================

/**
 * 服务引导结果
 */
export interface IServiceBootstrapResult {
  platform: Platform;
  editorRegistry: EditorRegistry;
  toolRegistry: ToolRegistry;
  mcpManager: MCPManager;
  taskManager: TaskManager;
  statusBar: StatusBar;
  outlineProvider: VideoProjectOutlineProvider;
  connectionStateManager: ConnectionStateManager;
  assetService: AssetService;
  // Optional services (may be null if extensions not installed)
  agentManager: IOptionalAgentManager | null;
  mediaEngineManager: IOptionalMediaEngineManager | null;
  externalAPIServer: IOptionalExternalAPIServer | null;
}

// =============================================================================
// Optional Service Discovery
// =============================================================================

/**
 * Try to get AgentManager from neko-agent extension
 */
async function discoverAgentManager(): Promise<IOptionalAgentManager | null> {
  try {
    const agentExt = vscode.extensions.getExtension('neko.neko-agent');
    if (agentExt) {
      const api = agentExt.isActive ? agentExt.exports : await agentExt.activate();
      return api?.agentManager ?? null;
    }
  } catch (error) {
    console.warn('[NekoCut] AgentManager not available:', error);
  }
  return null;
}

/**
 * Try to get MediaEngineManager from neko-engine extension
 */
async function discoverMediaEngineManager(): Promise<IOptionalMediaEngineManager | null> {
  try {
    const engineExt = vscode.extensions.getExtension('neko.neko-engine');
    if (engineExt) {
      const api = engineExt.isActive ? engineExt.exports : await engineExt.activate();
      return api?.mediaEngineManager ?? null;
    }
  } catch (error) {
    console.warn('[NekoCut] MediaEngineManager not available:', error);
  }
  return null;
}

/**
 * Try to get ExternalAPIServer from neko-engine extension
 */
async function discoverExternalAPIServer(): Promise<IOptionalExternalAPIServer | null> {
  try {
    const engineExt = vscode.extensions.getExtension('neko.neko-engine');
    if (engineExt) {
      const api = engineExt.isActive ? engineExt.exports : await engineExt.activate();
      return api?.externalAPIServer ?? null;
    }
  } catch (error) {
    console.warn('[NekoCut] ExternalAPIServer not available:', error);
  }
  return null;
}

// =============================================================================
// Service Bootstrap
// =============================================================================

/**
 * 初始化核心服务
 */
export async function bootstrapCoreServices(
  services: ServiceCollection,
  context: vscode.ExtensionContext
): Promise<IServiceBootstrapResult> {
  // ==========================================================================
  // 1. Task Manager with Persistence (must be created before Platform)
  // ==========================================================================
  const taskStorage = new VSCodeTaskStorage(context.globalState);
  const taskManager = new TaskManager({
    storage: taskStorage,
    cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
    retentionPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  services.set(ITaskManager, taskManager);

  // Dispose cleanup timer on deactivation
  context.subscriptions.push({ dispose: () => taskManager.dispose() });

  // ==========================================================================
  // 2. 创建 Platform (requires TaskManager)
  // ==========================================================================
  const platform = await createPlatformInstance({ context, taskManager });
  services.set(IPlatform, platform);

  // ==========================================================================
  // 3. 连接状态管理器
  // ==========================================================================
  const connectionStateManager = new ConnectionStateManager();
  services.set(IConnectionStateManager, connectionStateManager);
  context.subscriptions.push(connectionStateManager);

  // ==========================================================================
  // 4. 编辑器注册表
  // ==========================================================================
  const editorRegistry = new EditorRegistry();
  services.set(IEditorRegistry, editorRegistry);
  editorRegistry.registerModelProvider('video', new VideoEditorModelProvider());

  // ==========================================================================
  // 4.1 Project Session（用于无 Webview 的外部/HTTP 执行上下文）
  // ==========================================================================
  const projectSessionService = new ProjectSessionService();
  services.set(IProjectSessionService, projectSessionService);

  // ==========================================================================
  // 5. 工具注册表 (使用 Platform 的 ToolRegistry)
  // ==========================================================================
  const toolRegistry = platform.tools;
  services.set(IToolRegistry, toolRegistry);

  // ==========================================================================
  // 5.1 工具分类注册表 (用于三层注入机制)
  // ==========================================================================
  const toolCategoryRegistry = new ToolCategoryRegistry();

  // 注册内置工具 (video, shell, subtitle tools) 并分类
  registerBuiltinTools(toolRegistry, toolCategoryRegistry);

  // 注册 AI 生成工具 (image, video, audio generation)
  const aiService = createMediaServiceAdapter(platform.media, {
    asyncMode: true, // Return taskId immediately for better UX
  });
  registerGenerationTools(toolRegistry, aiService);

  // ==========================================================================
  // 6. MCP Manager (创建独立实例并注册配置)
  // ==========================================================================
  const mcpManager = new MCPManager();

  // Register MCP servers from platform config
  const mcpServerConfigs = platform.config.getEnabledMCPServers();
  for (const serverConfig of mcpServerConfigs) {
    mcpManager.register(serverConfig);
  }

  services.set(IMCPManager, mcpManager);
  context.subscriptions.push({ dispose: () => mcpManager.disconnectAll() });

  // 后台连接启用的 MCP 服务器并记录状态
  connectMCPServers(platform, mcpManager, toolRegistry, connectionStateManager).catch(error => {
    console.error('[NekoCut] Failed to connect MCP servers:', error);
  });

  // ==========================================================================
  // 7. Workflow 健康检查 (后台执行)
  // ==========================================================================
  checkWorkflowEngines(platform, connectionStateManager).catch(error => {
    console.error('[NekoCut] Failed to check workflow engines:', error);
  });

  // ==========================================================================
  // 8. Initialize TaskManager (created in step 1, now initialize and recover)
  // ==========================================================================
  taskManager.initialize().then(() => {
    return taskManager.resumePendingTasks();
  }).catch((err) => {
    console.error('[NekoCut] Failed to initialize TaskManager:', err);
  });

  // ==========================================================================
  // 9. 状态栏服务
  // ==========================================================================
  const statusBar = new StatusBar();
  services.set(IStatusBar, statusBar);
  context.subscriptions.push(statusBar);

  // ==========================================================================
  // 10. 大纲视图服务
  // ==========================================================================
  const outlineProvider = new VideoProjectOutlineProvider();
  services.set(IVideoProjectOutlineProvider, outlineProvider);

  // ==========================================================================
  // 11. Asset Service (素材管理)
  // ==========================================================================
  const assetService = new AssetService();
  services.set(IAssetService, assetService);
  context.subscriptions.push(assetService);

  // Initialize asset service in background
  assetService.initialize().catch(error => {
    console.error('[NekoCut] Failed to initialize AssetService:', error);
  });

  // ==========================================================================
  // 12. Optional Services Discovery (from other extensions)
  // ==========================================================================

  // Discover optional services in background (non-blocking)
  const [agentManager, mediaEngineManager, externalAPIServer] = await Promise.all([
    discoverAgentManager(),
    discoverMediaEngineManager(),
    discoverExternalAPIServer(),
  ]);

  services.set(IAgentManager, agentManager);
  services.set(IMediaEngineManager, mediaEngineManager);
  services.set(IExternalAPIServer, externalAPIServer);

  // Log optional service status
  console.log('[NekoCut] Optional services:', {
    agentManager: agentManager ? 'available' : 'not available',
    mediaEngineManager: mediaEngineManager ? 'available' : 'not available',
    externalAPIServer: externalAPIServer ? 'available' : 'not available',
  });

  // Start external API server if available
  if (externalAPIServer) {
    externalAPIServer.start().catch(error => {
      console.error('[NekoCut] Failed to start External API Server:', error);
    });
  }

  return {
    platform,
    editorRegistry,
    toolRegistry,
    mcpManager,
    taskManager,
    statusBar,
    outlineProvider,
    connectionStateManager,
    assetService,
    agentManager,
    mediaEngineManager,
    externalAPIServer,
  };
}

// =============================================================================
// Logging
// =============================================================================

/**
 * 打印服务初始化日志
 */
export function logServicesStatus(_result: IServiceBootstrapResult): void {
  // Logging disabled for cleaner output
}
