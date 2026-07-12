/**
 * Platform Bootstrap for CLI
 *
 * Creates a Platform instance configured for CLI/TUI use.
 * Handles env var API key injection since Platform's ConfigManager
 * only reads from config files.
 */

import * as path from 'path';
import * as os from 'os';
import {
  createPlatform,
  FileUserConfigManager,
  toSharedService,
  type Platform,
} from '@neko/platform';
import type { PerceptionAssetLoader } from '@neko/ai-sdk';
import {
  TaskManager,
  createFileTaskStorage,
  createFileWorkspaceVisibleAgentTaskStorage,
  type IRuntimeTaskManager,
} from '@neko/agent';
import type { IProviderCardRegistry, IService, IToolRegistry } from '@neko/shared';
import { getEnvKeyMap } from '@neko/shared';
import { createNodeContentAccessRuntime } from '../host/node-content-access-runtime';
import { createNodePerceptionAssetLoader } from '../host/node-perception-asset-loader';
import { createNodeWorkspaceContentHostAdapter } from '../host/node-workspace-content-host';

// Shared env var mapping from @neko/shared/config/credential-resolver
const ENV_KEY_MAP = getEnvKeyMap();

export interface CLIPlatformOptions {
  workspacePath?: string;
  toolRegistry: IToolRegistry;
  taskManager?: IRuntimeTaskManager;
  providerCardRegistry?: Pick<IProviderCardRegistry, 'get'>;
}

export interface CLIPlatformResult {
  platform: Platform;
  service: IService;
  taskManager: IRuntimeTaskManager;
  perceptionAssetLoader: PerceptionAssetLoader;
}

export interface CLISharedServiceOptions {
  workspacePath?: string;
  providerCardRegistry?: Pick<IProviderCardRegistry, 'get'>;
}

export interface CLITaskManagerOptions {
  readonly workspacePath?: string;
  readonly storageScope?: 'workspace-visible' | 'host-private';
}

export function createCLITaskManager(options: CLITaskManagerOptions = {}): IRuntimeTaskManager {
  const workspacePath = options.workspacePath?.trim();
  const taskStorage =
    workspacePath && options.storageScope !== 'host-private'
      ? createFileWorkspaceVisibleAgentTaskStorage({
          workspaceRoot: workspacePath,
          writerId: 'tui-workspace-task-storage',
        })
      : createFileTaskStorage(path.join(os.homedir(), '.neko', 'tasks.json'));
  return new TaskManager({ storage: taskStorage });
}

/**
 * Collect API keys from environment variables for known providers.
 */
function collectEnvApiKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [providerId, envKey] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envKey];
    if (value) {
      keys[providerId] = value;
    }
  }
  // Generic fallback keys
  const generic = process.env['NEKO_API_KEY'] ?? process.env['LLM_API_KEY'];
  if (generic) {
    keys['_generic'] = generic;
  }
  return keys;
}

/**
 * Create a Platform instance for CLI use.
 *
 * - Initializes FileUserConfigManager for ~/.neko/config.toml
 * - Injects env var API keys at runtime (not persisted to disk)
 * - Returns an IService ready for AgentSession
 */
export function createCLIPlatform(options: CLIPlatformOptions): CLIPlatformResult {
  const userConfigManager = new FileUserConfigManager();

  const taskManager =
    options.taskManager ??
    createCLITaskManager({
      workspacePath: options.workspacePath,
    });

  const platform = createPlatform({
    userConfigManager,
    workspacePath: options.workspacePath,
    toolRegistry: options.toolRegistry,
    taskManager,
  });

  // Inject env var API keys at runtime (not persisted)
  const envKeys = collectEnvApiKeys();
  for (const [providerId, apiKey] of Object.entries(envKeys)) {
    if (providerId === '_generic') continue;
    const provider = platform.config.getProvider(providerId);
    if (provider && !provider.apiKey) {
      platform.config.setRuntimeProviderOverride(providerId, { apiKey });
    }
  }

  // Apply generic key to any provider still missing an API key
  const genericKey = envKeys['_generic'];
  if (genericKey) {
    for (const provider of platform.config.getEnabledProviders()) {
      if (!provider.apiKey) {
        platform.config.setRuntimeProviderOverride(provider.id, {
          apiKey: genericKey,
        });
      }
    }
  }

  const service = createCLISharedService(platform, {
    workspacePath: options.workspacePath,
    providerCardRegistry: options.providerCardRegistry,
  });
  return {
    platform,
    service: service.service,
    taskManager,
    perceptionAssetLoader: service.assetLoader,
  };
}

export function createCLISharedService(
  platform: Platform,
  options: CLISharedServiceOptions = {},
): { readonly service: IService; readonly assetLoader: PerceptionAssetLoader } {
  const workspacePath = path.resolve(options.workspacePath ?? process.cwd());
  const host = createNodeWorkspaceContentHostAdapter({ workDir: workspacePath });
  const contentAccessRuntime = createNodeContentAccessRuntime({ host });
  const assetLoader = createNodePerceptionAssetLoader(contentAccessRuntime);
  const service = toSharedService(platform.createService(), {
    ...(options.providerCardRegistry ? { providerCardRegistry: options.providerCardRegistry } : {}),
    assetLoader,
  });
  return { service, assetLoader };
}
