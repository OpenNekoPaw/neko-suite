/**
 * Service Bootstrap for NekoAgent
 *
 * Initializes core services for the AI Agent extension.
 * Simplified version focused on agent-specific services.
 */

import * as vscode from 'vscode';
import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { Platform, createPlatform, FileUserConfigManager } from '@neko/platform';
import {
  MCPManager,
  MemoryTaskRecoveryStorage,
  MemoryTaskStorage,
  TaskManager,
  ToolRegistry,
  DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  DEFAULT_TASK_RETENTION_PERIOD_MS,
  connectMCPServersRuntime,
  JournalProjection,
  type IRuntimeTaskManager,
  type AgentEventType,
  type TaskResultObservationJournalEntry,
} from '@neko/agent';
import { createNekoPaths } from '@neko/agent/workspace';
import type { ITaskRecoveryStorage, ITaskStorage } from '@neko/shared';
import { ServiceCollection, createServiceId, getLogger } from '../base';

const logger = getLogger('ServiceBootstrap');
import { IEditorRegistry, EditorRegistry } from '../editor/common/editorRegistry';
import { AgentManager, IAgentManager as IAgentManagerInterface } from '../ai/agentManager';
import { TaskLifecycleCoordinator } from '../services/taskLifecycleCoordinator';
import { TaskResultObservationCoordinator } from '../services/taskResultObservationCoordinator';
import { createModelCallJsonlRecorder } from '../services/modelCallJsonlRecorder';

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
export const ITaskResultObservationCoordinator = createServiceId<TaskResultObservationCoordinator>(
  'taskResultObservationCoordinator',
);

const TASK_RESULT_OBSERVATION_JOURNAL_EVENT_TYPES = [
  'agent.observation.created',
  'agent.evidence.attached',
  'agent.task_result.followup_requested',
] as const satisfies readonly AgentEventType[];
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
  taskResultObservationCoordinator: TaskResultObservationCoordinator;
  editorRegistry: EditorRegistry;
}

export interface ExtensionAgentTaskPersistence {
  readonly taskStorage: ITaskStorage;
  readonly taskRecoveryStorage: ITaskRecoveryStorage;
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
  taskPersistence?: ExtensionAgentTaskPersistence,
): Promise<IServiceBootstrapResult> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspacePath && !taskPersistence) {
    throw new Error('Workspace Agent bootstrap requires shared SQLite Task persistence.');
  }

  // ==========================================================================
  // 1. Task Manager with Persistence
  // ==========================================================================
  const taskStorage = taskPersistence?.taskStorage ?? new MemoryTaskStorage();
  const recoveryStorage = taskPersistence?.taskRecoveryStorage ?? new MemoryTaskRecoveryStorage();
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
  const userConfigManager = new FileUserConfigManager();
  context.subscriptions.push({ dispose: () => userConfigManager.dispose() });

  const nekoPaths = workspacePath ? createNekoPaths(workspacePath) : undefined;
  const modelCallRecorder = nekoPaths
    ? createModelCallJsonlRecorder({
        resolveFilePath: ({ trace }) =>
          nekoPaths.conversationLog('modelCalls', trace.conversationId),
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
    externalResearch: platform.config.getEffectiveAgentWorkspaceConfigSnapshot().externalResearch,
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
      cancel: (scope) => taskManager.cancel(scope),
    },
  });
  services.set(ITaskLifecycleCoordinator, taskLifecycleCoordinator);

  const taskResultObservationCoordinator = new TaskResultObservationCoordinator({
    tasks: taskManager,
    agents: agentManager,
    journal: createTaskResultObservationJournalPort(),
  });
  services.set(ITaskResultObservationCoordinator, taskResultObservationCoordinator);
  void taskResultObservationCoordinator.reconcileTerminalTasks().catch((error) => {
    logger.warn('Failed to reconcile Agent task-result observations:', error);
  });

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
    taskResultObservationCoordinator,
    editorRegistry,
  };
}

function createTaskResultObservationJournalPort(): {
  readExistingEntries(
    conversationId: string,
  ): Promise<readonly TaskResultObservationJournalEntry[]>;
} {
  const projection = new JournalProjection(nodePath.join(nodeOs.homedir(), '.neko', 'journals'), {
    readFile: (filePath) => nodeFs.readFile(filePath, 'utf-8'),
    exists: async (filePath) => {
      try {
        await nodeFs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  });

  return {
    async readExistingEntries(conversationId) {
      const entries: TaskResultObservationJournalEntry[] = [];
      for (const type of TASK_RESULT_OBSERVATION_JOURNAL_EVENT_TYPES) {
        for await (const entry of projection.filterEvents(conversationId, type)) {
          entries.push({ event: entry.event });
        }
      }
      return entries;
    },
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
