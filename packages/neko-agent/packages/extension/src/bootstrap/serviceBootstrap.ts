/**
 * Service Bootstrap for NekoAgent
 *
 * Initializes core services for the AI Agent extension.
 * Simplified version focused on agent-specific services.
 */

import * as vscode from 'vscode';
import { Platform, createPlatform } from '@neko/platform';
import { MCPManager, TaskManager, ToolRegistry } from '@neko/agent';
import { ServiceCollection, createServiceId, getLogger } from '../base';

const logger = getLogger('ServiceBootstrap');
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { AgentManager, IAgentManager as IAgentManagerInterface } from '../ai/agentManager';

// =============================================================================
// Service Identifiers
// =============================================================================

export const IPlatform = createServiceId<Platform>('platform');
export const IToolRegistry = createServiceId<ToolRegistry>('toolRegistry');
export const IMCPManager = createServiceId<MCPManager>('mcpManager');
export const ITaskManager = createServiceId<TaskManager>('taskManager');
export const IAgentManager = createServiceId<IAgentManagerInterface>('agentManager');

// Re-export IEditorRegistry
export { IEditorRegistry };

// Import and re-export ConnectionStateManager from services
import {
  ConnectionStateManager,
  IConnectionStateManager,
  type ConnectionStatus,
  type ConnectionState,
  type ConnectionStateChangeEvent,
} from '../services/connectionStateManager';

export {
  ConnectionStateManager,
  IConnectionStateManager,
  type ConnectionStatus,
  type ConnectionState,
  type ConnectionStateChangeEvent,
};

// =============================================================================
// VSCode Task Storage
// =============================================================================

interface TaskRecord {
  id: string;
  status: string;
  createdAt: number;
  completedAt?: number;
}

class VSCodeTaskStorage {
  private readonly STORAGE_KEY = 'neko.agent.tasks';

  constructor(private readonly globalState: vscode.Memento) {}

  async save(task: TaskRecord): Promise<void> {
    const tasks = await this.loadAll();
    const index = tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      tasks[index] = task;
    } else {
      tasks.push(task);
    }
    await this.globalState.update(this.STORAGE_KEY, tasks);
  }

  async load(id: string): Promise<TaskRecord | undefined> {
    const tasks = await this.loadAll();
    return tasks.find(t => t.id === id);
  }

  async loadPending(): Promise<TaskRecord[]> {
    const tasks = await this.loadAll();
    return tasks.filter(t => t.status === 'pending' || t.status === 'running');
  }

  async loadAll(): Promise<TaskRecord[]> {
    return this.globalState.get<TaskRecord[]>(this.STORAGE_KEY, []);
  }

  async delete(id: string): Promise<void> {
    const tasks = await this.loadAll();
    const filtered = tasks.filter(t => t.id !== id);
    await this.globalState.update(this.STORAGE_KEY, filtered);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const tasks = await this.loadAll();
    const now = Date.now();
    const filtered = tasks.filter(t => {
      if (t.status === 'completed' || t.status === 'failed') {
        const completedAt = t.completedAt ?? t.createdAt;
        return now - completedAt < olderThanMs;
      }
      return true;
    });
    const removed = tasks.length - filtered.length;
    await this.globalState.update(this.STORAGE_KEY, filtered);
    return removed;
  }
}

// =============================================================================
// Service Bootstrap Result
// =============================================================================

export interface IServiceBootstrapResult {
  platform: Platform;
  toolRegistry: ToolRegistry;
  mcpManager: MCPManager;
  taskManager: TaskManager;
  agentManager: AgentManager;
  connectionStateManager: ConnectionStateManager;
  editorRegistry: EditorRegistry;
}

// =============================================================================
// Service Bootstrap
// =============================================================================

/**
 * Initialize core services for NekoAgent
 */
export async function bootstrapCoreServices(
  services: ServiceCollection,
  context: vscode.ExtensionContext
): Promise<IServiceBootstrapResult> {
  // ==========================================================================
  // 1. Task Manager with Persistence
  // ==========================================================================
  const taskStorage = new VSCodeTaskStorage(context.globalState);
  const taskManager = new TaskManager({
    storage: taskStorage as any,
    cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
    retentionPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  services.set(ITaskManager, taskManager);
  context.subscriptions.push({ dispose: () => taskManager.dispose() });

  // ==========================================================================
  // 2. Tool Registry (from @neko/agent)
  // ==========================================================================
  const toolRegistry = new ToolRegistry();
  services.set(IToolRegistry, toolRegistry);

  // ==========================================================================
  // 3. Create Platform (with injected toolRegistry)
  // ==========================================================================
  const platform = createPlatform({
    workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    taskManager,
    toolRegistry,
  });
  services.set(IPlatform, platform);

  // ==========================================================================
  // 4. Connection State Manager
  // ==========================================================================
  const connectionStateManager = new ConnectionStateManager();
  services.set(IConnectionStateManager, connectionStateManager);
  context.subscriptions.push(connectionStateManager);

  // ==========================================================================
  // 5. MCP Manager
  // ==========================================================================
  const mcpManager = new MCPManager();

  // Register MCP servers from platform config
  const mcpServerConfigs = platform.config.getEnabledMCPServers();
  for (const serverConfig of mcpServerConfigs) {
    mcpManager.register(serverConfig);
  }

  services.set(IMCPManager, mcpManager);
  context.subscriptions.push({ dispose: () => mcpManager.disconnectAll() });

  // Connect MCP servers in background
  connectMCPServers(mcpManager, toolRegistry, connectionStateManager).catch(error => {
    logger.error('Failed to connect MCP servers:', error);
  });

  // ==========================================================================
  // 6. Agent Manager
  // ==========================================================================
  const agentManager = new AgentManager();
  services.set(IAgentManager, agentManager);

  // ==========================================================================
  // 7. Editor Registry
  // ==========================================================================
  const editorRegistry = new EditorRegistry();
  services.set(IEditorRegistry, editorRegistry);

  // ==========================================================================
  // 8. Initialize TaskManager
  // ==========================================================================
  taskManager.initialize().then(() => {
    return taskManager.resumePendingTasks();
  }).catch((err) => {
    logger.error('Failed to initialize TaskManager:', err);
  });

  return {
    platform,
    toolRegistry,
    mcpManager,
    taskManager,
    agentManager,
    connectionStateManager,
    editorRegistry,
  };
}

// =============================================================================
// MCP Connection Helper
// =============================================================================

async function connectMCPServers(
  mcpManager: MCPManager,
  toolRegistry: ToolRegistry,
  connectionStateManager: ConnectionStateManager
): Promise<void> {
  const servers = mcpManager.listServers();

  for (const server of servers) {
    try {
      await mcpManager.connect(server.id);
      connectionStateManager.updateState(server.id, server.name, 'mcp', 'connected');
      logger.info(`Connected to MCP server: ${server.name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      connectionStateManager.updateState(server.id, server.name, 'mcp', 'error', errorMessage);
      logger.error(`Failed to connect to MCP server ${server.name}:`, error);
    }
  }

  // Register all MCP tools once after all servers are connected
  const tools = await mcpManager.getAllTools();
  for (const tool of tools) {
    toolRegistry.register(tool as any);
  }
}

// =============================================================================
// Logging
// =============================================================================

export function logServicesStatus(result: IServiceBootstrapResult): void {
  logger.info('Services initialized:', {
    platform: !!result.platform,
    mcpManager: result.mcpManager.listServers().length + ' servers',
    taskManager: !!result.taskManager,
    agentManager: !!result.agentManager,
  });
}
