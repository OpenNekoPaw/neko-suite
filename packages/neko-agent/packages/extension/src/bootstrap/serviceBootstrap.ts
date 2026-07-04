/**
 * Service Bootstrap for NekoAgent
 *
 * Initializes core services for the AI Agent extension.
 * Simplified version focused on agent-specific services.
 */

import * as vscode from 'vscode';
import * as nodePath from 'node:path';
import { Platform, createPlatform, FileUserConfigManager } from '@neko/platform';
import {
  MCPManager,
  TaskManager,
  ToolRegistry,
  DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  DEFAULT_TASK_RETENTION_PERIOD_MS,
  DEFAULT_TASK_STORAGE_KEY,
  connectMCPServersRuntime,
  createStateTaskRecoveryStorage,
  createStateTaskStorage,
  type IRuntimeTaskManager,
} from '@neko/agent';
import type { SerializableTask, TaskRecoveryInfo } from '@neko/shared';
import { ServiceCollection, createServiceId, getLogger } from '../base';

const logger = getLogger('ServiceBootstrap');
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { AgentManager, IAgentManager as IAgentManagerInterface } from '../ai/agentManager';
import { TaskLifecycleCoordinator } from '../services/taskLifecycleCoordinator';
import { createModelCallJsonlRecorder } from '../services/modelCallJsonlRecorder';
import { resolveAgentRealApiUserConfigManagerOptions } from './realApiConfigInjection';

// =============================================================================
// Service Identifiers
// =============================================================================

export const IPlatform = createServiceId<Platform>('platform');
export const IToolRegistry = createServiceId<ToolRegistry>('toolRegistry');
export const IMCPManager = createServiceId<MCPManager>('mcpManager');
export const ITaskManager = createServiceId<IRuntimeTaskManager>('taskManager');
export const IAgentManager = createServiceId<IAgentManagerInterface>('agentManager');
export const ITaskLifecycleCoordinator = createServiceId<TaskLifecycleCoordinator>(
  'taskLifecycleCoordinator',
);

const DEFAULT_TASK_RECOVERY_STORAGE_KEY = 'neko.agent.taskRecovery';
const MODEL_CALL_LOG_FILE = 'model-calls.jsonl';

// Re-export IEditorRegistry
export { IEditorRegistry };

// =============================================================================
// Service Bootstrap Result
// =============================================================================

export interface IServiceBootstrapResult {
  platform: Platform;
  toolRegistry: ToolRegistry;
  mcpManager: MCPManager;
  taskManager: IRuntimeTaskManager;
  agentManager: AgentManager;
  taskLifecycleCoordinator: TaskLifecycleCoordinator;
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
  context: vscode.ExtensionContext,
): Promise<IServiceBootstrapResult> {
  // ==========================================================================
  // 1. Task Manager with Persistence
  // ==========================================================================
  const taskStorage = createStateTaskStorage({
    storageKey: DEFAULT_TASK_STORAGE_KEY,
    adapter: {
      load: (key) => context.globalState.get<SerializableTask[]>(key, []),
      save: (key, tasks) => context.globalState.update(key, [...tasks]),
    },
  });
  const recoveryStorage = createStateTaskRecoveryStorage({
    storageKey: DEFAULT_TASK_RECOVERY_STORAGE_KEY,
    adapter: {
      load: (key) => context.globalState.get<TaskRecoveryInfo[]>(key, []),
      save: (key, infos) => context.globalState.update(key, [...infos]),
    },
  });
  const taskManager = new TaskManager({
    storage: taskStorage,
    recoveryStorage,
    cleanupIntervalMs: DEFAULT_TASK_CLEANUP_INTERVAL_MS,
    retentionPeriodMs: DEFAULT_TASK_RETENTION_PERIOD_MS,
  });
  services.set(ITaskManager, taskManager);

  // ==========================================================================
  // 2. Tool Registry (from @neko/agent)
  // ==========================================================================
  const toolRegistry = new ToolRegistry();
  services.set(IToolRegistry, toolRegistry);

  // ==========================================================================
  // 3. Create Platform (with injected toolRegistry and file-based user config)
  // ==========================================================================
  const userConfigManager = new FileUserConfigManager(
    resolveAgentRealApiUserConfigManagerOptions({
      extensionMode: context.extensionMode,
      productionExtensionMode: vscode.ExtensionMode.Production,
      env: process.env,
    }),
  );
  context.subscriptions.push({ dispose: () => userConfigManager.dispose() });

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const modelCallRecorder = workspacePath
    ? createModelCallJsonlRecorder({
        filePath: nodePath.join(workspacePath, '.neko', 'logs', MODEL_CALL_LOG_FILE),
      })
    : undefined;
  if (modelCallRecorder?.dispose) {
    context.subscriptions.push({ dispose: () => void modelCallRecorder.dispose?.() });
  }

  const platform = createPlatform({
    workspacePath,
    taskManager,
    toolRegistry,
    userConfigManager,
    ...(modelCallRecorder ? { modelCallRecorder } : {}),
  });
  services.set(IPlatform, platform);

  // ==========================================================================
  // 4. MCP Manager
  // ==========================================================================
  const mcpManager = new MCPManager();

  // Register MCP servers from platform config
  const mcpServerConfigs = platform.config.getEnabledMCPServers();
  for (const serverConfig of mcpServerConfigs) {
    mcpManager.register(serverConfig);
  }

  services.set(IMCPManager, mcpManager);

  // Connect MCP servers in background
  connectMCPServersRuntime({
    mcpManager,
    toolRegistry,
    logger,
  }).catch((error) => {
    logger.error('Failed to connect MCP servers:', error);
  });

  // ==========================================================================
  // 5. Agent Manager
  // ==========================================================================
  const agentManager = new AgentManager(context);
  services.set(IAgentManager, agentManager);

  const taskLifecycleCoordinator = new TaskLifecycleCoordinator({
    interruptions: agentManager,
    tasks: {
      list: () => taskManager.list(),
    },
    taskCancellation: {
      cancel: (taskId) => taskManager.cancel(taskId),
    },
  });
  services.set(ITaskLifecycleCoordinator, taskLifecycleCoordinator);

  // ==========================================================================
  // 6. Editor Registry
  // ==========================================================================
  const editorRegistry = new EditorRegistry();
  services.set(IEditorRegistry, editorRegistry);

  return {
    platform,
    toolRegistry,
    mcpManager,
    taskManager,
    agentManager,
    taskLifecycleCoordinator,
    editorRegistry,
  };
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
