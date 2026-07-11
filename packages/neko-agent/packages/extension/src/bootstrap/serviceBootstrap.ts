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
  TaskManager,
  ToolRegistry,
  DEFAULT_TASK_CLEANUP_INTERVAL_MS,
  DEFAULT_TASK_RETENTION_PERIOD_MS,
  DEFAULT_TASK_STORAGE_KEY,
  connectMCPServersRuntime,
  createFileWorkspaceVisibleAgentTaskStorage,
  createStateTaskRecoveryStorage,
  createStateTaskStorage,
  JournalProjection,
  type IRuntimeTaskManager,
  type AgentEventType,
  type TaskResultObservationJournalEntry,
} from '@neko/agent';
import { createNekoPaths } from '@neko/agent/workspace';
import type { SerializableTask, TaskRecoveryInfo } from '@neko/shared';
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

const DEFAULT_TASK_RECOVERY_STORAGE_KEY = 'neko.agent.taskRecovery';
const TASK_RESULT_OBSERVATION_JOURNAL_EVENT_TYPES = [
  'agent.observation.created',
  'agent.evidence.attached',
  'agent.task_result.followup_requested',
] as const satisfies readonly AgentEventType[];
let mementoArrayWriterOrdinal = 0;

interface MementoArrayWriteMetadata {
  readonly ownerId: string;
  readonly revision: number;
  readonly updatedAt: number;
}

type ExtensionAgentTaskStorage =
  | ReturnType<typeof createStateTaskStorage>
  | ReturnType<typeof createFileWorkspaceVisibleAgentTaskStorage>;

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
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // ==========================================================================
  // 1. Task Manager with Persistence
  // ==========================================================================
  const taskStorage = createExtensionAgentTaskStorage({
    context,
    ...(workspacePath ? { workspacePath } : {}),
  });
  const recoveryStorage = createExtensionAgentTaskRecoveryStorage(context);
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
      cancel: (taskId) => taskManager.cancel(taskId),
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

function createMementoArrayAdapter<T>(
  context: vscode.ExtensionContext,
  ownerPrefix: string,
): {
  load(key: string): readonly T[];
  save(key: string, values: readonly T[]): Thenable<void>;
} {
  mementoArrayWriterOrdinal += 1;
  const ownerId = `${ownerPrefix}-${Date.now().toString(36)}-${mementoArrayWriterOrdinal}`;
  let loadedRevision = 0;

  return {
    load: (key) => {
      loadedRevision = readMementoArrayWriteMetadata(context, key)?.revision ?? 0;
      return context.globalState.get<T[]>(key, []);
    },
    save: async (key, values) => {
      const currentMetadata = readMementoArrayWriteMetadata(context, key);
      if (
        currentMetadata &&
        currentMetadata.revision !== loadedRevision &&
        currentMetadata.ownerId !== ownerId
      ) {
        logger.warn('neko.agent.state_storage.stale_write_possible', {
          storageKey: key,
          ownerId,
          loadedRevision,
          currentOwnerId: currentMetadata.ownerId,
          currentRevision: currentMetadata.revision,
        });
        loadedRevision = currentMetadata.revision;
      }
      const nextMetadata: MementoArrayWriteMetadata = {
        ownerId,
        revision: loadedRevision + 1,
        updatedAt: Date.now(),
      };
      await context.globalState.update(key, [...values]);
      await context.globalState.update(mementoArrayWriteMetadataKey(key), nextMetadata);
      loadedRevision = nextMetadata.revision;
    },
  };
}

export function createExtensionAgentTaskStorage(input: {
  readonly context: vscode.ExtensionContext;
  readonly workspacePath?: string;
}): ExtensionAgentTaskStorage {
  if (input.workspacePath) {
    return createFileWorkspaceVisibleAgentTaskStorage({
      workspaceRoot: input.workspacePath,
      writerId: 'extension-workspace-task-storage',
    });
  }

  return createStateTaskStorage({
    storageKey: DEFAULT_TASK_STORAGE_KEY,
    adapter: createMementoArrayAdapter<SerializableTask>(input.context, 'task-storage'),
  });
}

export function createExtensionAgentTaskRecoveryStorage(
  context: vscode.ExtensionContext,
): ReturnType<typeof createStateTaskRecoveryStorage> {
  return createStateTaskRecoveryStorage({
    storageKey: DEFAULT_TASK_RECOVERY_STORAGE_KEY,
    adapter: createMementoArrayAdapter<TaskRecoveryInfo>(context, 'task-recovery'),
  });
}

function readMementoArrayWriteMetadata(
  context: vscode.ExtensionContext,
  key: string,
): MementoArrayWriteMetadata | null {
  const value = context.globalState.get<unknown>(mementoArrayWriteMetadataKey(key));
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { ownerId?: unknown }).ownerId !== 'string' ||
    (value as { ownerId: string }).ownerId.trim().length === 0 ||
    typeof (value as { revision?: unknown }).revision !== 'number' ||
    !Number.isInteger((value as { revision: number }).revision) ||
    (value as { revision: number }).revision < 0 ||
    typeof (value as { updatedAt?: unknown }).updatedAt !== 'number' ||
    !Number.isFinite((value as { updatedAt: number }).updatedAt)
  ) {
    return null;
  }
  return value as MementoArrayWriteMetadata;
}

function mementoArrayWriteMetadataKey(key: string): string {
  return `${key}.writeMetadata`;
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
