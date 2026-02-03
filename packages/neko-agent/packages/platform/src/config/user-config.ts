/**
 * User Configuration Storage
 *
 * Supports two storage backends:
 * 1. VS Code globalState (UserConfigManager) - for VSCode extension
 * 2. File-based storage (FileUserConfigManager) - for CLI and standalone use
 *
 * Uses shared configuration module from @neko/shared for unified format.
 */

import type { Provider, Model } from '../types/provider';
import type { Group } from '../types/group';
import type { MCPServerPreset, WorkflowPreset, PromptPreset } from '../types/config';
import type { UnifiedConfig } from '@neko/shared';
// Node.js config reader - direct import
import {
  readUserConfig as readUserConfigFile,
  writeUserConfig as writeUserConfigFile,
  watchUserConfig as watchUserConfigFile,
  getUserConfigPath,
} from '@neko/shared/config/config-reader.ts';

/**
 * User configuration structure
 */
export interface UserConfig {
  /** Custom providers */
  providers: Provider[];
  /** Custom models */
  models: Model[];
  /** Custom groups */
  groups: Group[];
  /** Custom MCP servers */
  mcpServers: MCPServerPreset[];
  /** Custom workflows */
  workflows: WorkflowPreset[];
  /** Custom prompts */
  prompts: PromptPreset[];
  /** Provider overrides (e.g., API keys) */
  providerOverrides: Record<string, Partial<Provider>>;
  /** Model overrides */
  modelOverrides: Record<string, Partial<Model>>;
  /** Group overrides */
  groupOverrides: Record<string, Partial<Group>>;
  /** MCP server overrides */
  mcpServerOverrides: Record<string, Partial<MCPServerPreset>>;
  /** Workflow overrides */
  workflowOverrides: Record<string, Partial<WorkflowPreset>>;
  /** Prompt overrides */
  promptOverrides: Record<string, Partial<PromptPreset>>;
}

/**
 * Storage interface for user config (VS Code globalState)
 */
export interface UserConfigStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

const USER_CONFIG_KEY = 'neko.platform.userConfig';

const DEFAULT_USER_CONFIG: UserConfig = {
  providers: [],
  models: [],
  groups: [],
  mcpServers: [],
  workflows: [],
  prompts: [],
  providerOverrides: {},
  modelOverrides: {},
  groupOverrides: {},
  mcpServerOverrides: {},
  workflowOverrides: {},
  promptOverrides: {},
};

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert unified config to user config
 */
function unifiedToUserConfig(unified: UnifiedConfig | null): UserConfig {
  if (!unified) {
    return { ...DEFAULT_USER_CONFIG };
  }

  return {
    providers: (unified.providers as Provider[]) ?? [],
    models: (unified.models as Model[]) ?? [],
    groups: (unified.groups as Group[]) ?? [],
    mcpServers: (unified.mcpServers as MCPServerPreset[]) ?? [],
    workflows: (unified.workflows as WorkflowPreset[]) ?? [],
    prompts: (unified.prompts as PromptPreset[]) ?? [],
    providerOverrides: (unified.providerOverrides as Record<string, Partial<Provider>>) ?? {},
    modelOverrides: (unified.modelOverrides as Record<string, Partial<Model>>) ?? {},
    groupOverrides: (unified.groupOverrides as Record<string, Partial<Group>>) ?? {},
    mcpServerOverrides: (unified.mcpServerOverrides as Record<string, Partial<MCPServerPreset>>) ?? {},
    workflowOverrides: (unified.workflowOverrides as Record<string, Partial<WorkflowPreset>>) ?? {},
    promptOverrides: (unified.promptOverrides as Record<string, Partial<PromptPreset>>) ?? {},
  };
}

/**
 * Convert user config to unified config for saving
 */
function userToUnifiedConfig(user: UserConfig): UnifiedConfig {
  return {
    providers: user.providers,
    models: user.models,
    groups: user.groups,
    mcpServers: user.mcpServers,
    workflows: user.workflows,
    prompts: user.prompts,
    providerOverrides: user.providerOverrides,
    modelOverrides: user.modelOverrides,
    groupOverrides: user.groupOverrides,
    mcpServerOverrides: user.mcpServerOverrides,
    workflowOverrides: user.workflowOverrides,
    promptOverrides: user.promptOverrides,
  };
}

// =============================================================================
// User Config Manager Interface
// =============================================================================

/**
 * Interface for user config managers
 */
export interface IUserConfigManager {
  load(): UserConfig;
  save(config: UserConfig): Promise<void>;
  updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void>;
  addProvider(provider: Provider): Promise<void>;
  removeProvider(providerId: string): Promise<void>;
  addModel(model: Model): Promise<void>;
  removeModel(modelId: string): Promise<void>;
  addGroup(group: Group): Promise<void>;
  removeGroup(groupId: string): Promise<void>;
  updateMCPServerOverride(serverId: string, override: Partial<MCPServerPreset>): Promise<void>;
  addMCPServer(server: MCPServerPreset): Promise<void>;
  removeMCPServer(serverId: string): Promise<void>;
  updateWorkflowOverride(workflowId: string, override: Partial<WorkflowPreset>): Promise<void>;
  addWorkflow(workflow: WorkflowPreset): Promise<void>;
  removeWorkflow(workflowId: string): Promise<void>;
  updatePromptOverride(promptId: string, override: Partial<PromptPreset>): Promise<void>;
  addPrompt(prompt: PromptPreset): Promise<void>;
  removePrompt(promptId: string): Promise<void>;
  clear(): Promise<void>;
  migrateProviders(currentBuiltinIds: Set<string>): Promise<void>;
}

// =============================================================================
// VS Code GlobalState-based User Config Manager
// =============================================================================

/**
 * User config manager using VS Code globalState
 *
 * This is the original implementation for VSCode extension.
 */
export class UserConfigManager implements IUserConfigManager {
  private storage: UserConfigStorage;

  constructor(storage: UserConfigStorage) {
    this.storage = storage;
  }

  /**
   * Load user configuration
   */
  load(): UserConfig {
    const stored = this.storage.get<UserConfig>(USER_CONFIG_KEY);
    if (!stored) {
      return { ...DEFAULT_USER_CONFIG };
    }
    return {
      ...DEFAULT_USER_CONFIG,
      ...stored,
    };
  }

  /**
   * Save user configuration
   */
  async save(config: UserConfig): Promise<void> {
    await this.storage.update(USER_CONFIG_KEY, config);
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  async updateProviderOverride(
    providerId: string,
    override: Partial<Provider>
  ): Promise<void> {
    const config = this.load();
    config.providerOverrides[providerId] = {
      ...config.providerOverrides[providerId],
      ...override,
    };
    await this.save(config);
  }

  async addProvider(provider: Provider): Promise<void> {
    const config = this.load();
    const existing = config.providers.findIndex((p) => p.id === provider.id);
    if (existing >= 0) {
      config.providers[existing] = provider;
    } else {
      config.providers.push(provider);
    }
    await this.save(config);
  }

  async removeProvider(providerId: string): Promise<void> {
    const config = this.load();
    config.providers = config.providers.filter((p) => p.id !== providerId);
    delete config.providerOverrides[providerId];
    await this.save(config);
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  async addModel(model: Model): Promise<void> {
    const config = this.load();
    const existing = config.models.findIndex((m) => m.id === model.id);
    if (existing >= 0) {
      config.models[existing] = model;
    } else {
      config.models.push(model);
    }
    await this.save(config);
  }

  async removeModel(modelId: string): Promise<void> {
    const config = this.load();
    config.models = config.models.filter((m) => m.id !== modelId);
    delete config.modelOverrides[modelId];
    await this.save(config);
  }

  // ==========================================================================
  // Group Methods
  // ==========================================================================

  async addGroup(group: Group): Promise<void> {
    const config = this.load();
    const existing = config.groups.findIndex((g) => g.id === group.id);
    if (existing >= 0) {
      config.groups[existing] = group;
    } else {
      config.groups.push(group);
    }
    await this.save(config);
  }

  async removeGroup(groupId: string): Promise<void> {
    const config = this.load();
    config.groups = config.groups.filter((g) => g.id !== groupId);
    delete config.groupOverrides[groupId];
    await this.save(config);
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  async updateMCPServerOverride(
    serverId: string,
    override: Partial<MCPServerPreset>
  ): Promise<void> {
    const config = this.load();
    config.mcpServerOverrides[serverId] = {
      ...config.mcpServerOverrides[serverId],
      ...override,
    };
    await this.save(config);
  }

  async addMCPServer(server: MCPServerPreset): Promise<void> {
    const config = this.load();
    const existing = config.mcpServers.findIndex((s) => s.id === server.id);
    if (existing >= 0) {
      config.mcpServers[existing] = server;
    } else {
      config.mcpServers.push(server);
    }
    await this.save(config);
  }

  async removeMCPServer(serverId: string): Promise<void> {
    const config = this.load();
    config.mcpServers = config.mcpServers.filter((s) => s.id !== serverId);
    delete config.mcpServerOverrides[serverId];
    await this.save(config);
  }

  // ==========================================================================
  // Workflow Methods
  // ==========================================================================

  async updateWorkflowOverride(
    workflowId: string,
    override: Partial<WorkflowPreset>
  ): Promise<void> {
    const config = this.load();
    config.workflowOverrides[workflowId] = {
      ...config.workflowOverrides[workflowId],
      ...override,
    };
    await this.save(config);
  }

  async addWorkflow(workflow: WorkflowPreset): Promise<void> {
    const config = this.load();
    const existing = config.workflows.findIndex((w) => w.id === workflow.id);
    if (existing >= 0) {
      config.workflows[existing] = workflow;
    } else {
      config.workflows.push(workflow);
    }
    await this.save(config);
  }

  async removeWorkflow(workflowId: string): Promise<void> {
    const config = this.load();
    config.workflows = config.workflows.filter((w) => w.id !== workflowId);
    delete config.workflowOverrides[workflowId];
    await this.save(config);
  }

  // ==========================================================================
  // Prompt Methods
  // ==========================================================================

  async updatePromptOverride(
    promptId: string,
    override: Partial<PromptPreset>
  ): Promise<void> {
    const config = this.load();
    config.promptOverrides[promptId] = {
      ...config.promptOverrides[promptId],
      ...override,
    };
    await this.save(config);
  }

  async addPrompt(prompt: PromptPreset): Promise<void> {
    const config = this.load();
    const existing = config.prompts.findIndex((p) => p.id === prompt.id);
    if (existing >= 0) {
      config.prompts[existing] = prompt;
    } else {
      config.prompts.push(prompt);
    }
    await this.save(config);
  }

  async removePrompt(promptId: string): Promise<void> {
    const config = this.load();
    config.prompts = config.prompts.filter((p) => p.id !== promptId);
    delete config.promptOverrides[promptId];
    await this.save(config);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async clear(): Promise<void> {
    await this.save({ ...DEFAULT_USER_CONFIG });
  }

  async migrateProviders(currentBuiltinIds: Set<string>): Promise<void> {
    const config = this.load();
    const originalCount = config.providers.length;

    config.providers = config.providers.filter((p) => {
      if (!p.builtin) return true;
      if (currentBuiltinIds.has(p.id)) return true;
      return true;
    });

    if (config.providers.length !== originalCount) {
      await this.save(config);
    }
  }
}

// =============================================================================
// File-based User Config Manager
// =============================================================================

/**
 * User config manager using file storage (~/.neko/config.json)
 *
 * This implementation reads from and writes to the unified config file,
 * allowing configuration to be shared with agent-cli.
 */
export class FileUserConfigManager implements IUserConfigManager {
  private stopWatching: (() => void) | null = null;
  private cachedConfig: UserConfig | null = null;
  private onChangeCallback: ((config: UserConfig) => void) | null = null;

  constructor() {
    // Initialize file watcher
    this.stopWatching = watchUserConfigFile((unified) => {
      this.cachedConfig = unifiedToUserConfig(unified);
      if (this.onChangeCallback) {
        this.onChangeCallback(this.cachedConfig);
      }
    });
  }

  /**
   * Set callback for config changes
   */
  onChange(callback: (config: UserConfig) => void): void {
    this.onChangeCallback = callback;
  }

  /**
   * Load user configuration from file
   */
  load(): UserConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const unified = readUserConfigFile();
    this.cachedConfig = unifiedToUserConfig(unified);
    return this.cachedConfig;
  }

  /**
   * Save user configuration to file
   */
  async save(config: UserConfig): Promise<void> {
    const unified = userToUnifiedConfig(config);
    writeUserConfigFile(unified);
    this.cachedConfig = config;
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  async updateProviderOverride(
    providerId: string,
    override: Partial<Provider>
  ): Promise<void> {
    const config = this.load();
    config.providerOverrides[providerId] = {
      ...config.providerOverrides[providerId],
      ...override,
    };
    await this.save(config);
  }

  async addProvider(provider: Provider): Promise<void> {
    const config = this.load();
    const existing = config.providers.findIndex((p) => p.id === provider.id);
    if (existing >= 0) {
      config.providers[existing] = provider;
    } else {
      config.providers.push(provider);
    }
    await this.save(config);
  }

  async removeProvider(providerId: string): Promise<void> {
    const config = this.load();
    config.providers = config.providers.filter((p) => p.id !== providerId);
    delete config.providerOverrides[providerId];
    await this.save(config);
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  async addModel(model: Model): Promise<void> {
    const config = this.load();
    const existing = config.models.findIndex((m) => m.id === model.id);
    if (existing >= 0) {
      config.models[existing] = model;
    } else {
      config.models.push(model);
    }
    await this.save(config);
  }

  async removeModel(modelId: string): Promise<void> {
    const config = this.load();
    config.models = config.models.filter((m) => m.id !== modelId);
    delete config.modelOverrides[modelId];
    await this.save(config);
  }

  // ==========================================================================
  // Group Methods
  // ==========================================================================

  async addGroup(group: Group): Promise<void> {
    const config = this.load();
    const existing = config.groups.findIndex((g) => g.id === group.id);
    if (existing >= 0) {
      config.groups[existing] = group;
    } else {
      config.groups.push(group);
    }
    await this.save(config);
  }

  async removeGroup(groupId: string): Promise<void> {
    const config = this.load();
    config.groups = config.groups.filter((g) => g.id !== groupId);
    delete config.groupOverrides[groupId];
    await this.save(config);
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  async updateMCPServerOverride(
    serverId: string,
    override: Partial<MCPServerPreset>
  ): Promise<void> {
    const config = this.load();
    config.mcpServerOverrides[serverId] = {
      ...config.mcpServerOverrides[serverId],
      ...override,
    };
    await this.save(config);
  }

  async addMCPServer(server: MCPServerPreset): Promise<void> {
    const config = this.load();
    const existing = config.mcpServers.findIndex((s) => s.id === server.id);
    if (existing >= 0) {
      config.mcpServers[existing] = server;
    } else {
      config.mcpServers.push(server);
    }
    await this.save(config);
  }

  async removeMCPServer(serverId: string): Promise<void> {
    const config = this.load();
    config.mcpServers = config.mcpServers.filter((s) => s.id !== serverId);
    delete config.mcpServerOverrides[serverId];
    await this.save(config);
  }

  // ==========================================================================
  // Workflow Methods
  // ==========================================================================

  async updateWorkflowOverride(
    workflowId: string,
    override: Partial<WorkflowPreset>
  ): Promise<void> {
    const config = this.load();
    config.workflowOverrides[workflowId] = {
      ...config.workflowOverrides[workflowId],
      ...override,
    };
    await this.save(config);
  }

  async addWorkflow(workflow: WorkflowPreset): Promise<void> {
    const config = this.load();
    const existing = config.workflows.findIndex((w) => w.id === workflow.id);
    if (existing >= 0) {
      config.workflows[existing] = workflow;
    } else {
      config.workflows.push(workflow);
    }
    await this.save(config);
  }

  async removeWorkflow(workflowId: string): Promise<void> {
    const config = this.load();
    config.workflows = config.workflows.filter((w) => w.id !== workflowId);
    delete config.workflowOverrides[workflowId];
    await this.save(config);
  }

  // ==========================================================================
  // Prompt Methods
  // ==========================================================================

  async updatePromptOverride(
    promptId: string,
    override: Partial<PromptPreset>
  ): Promise<void> {
    const config = this.load();
    config.promptOverrides[promptId] = {
      ...config.promptOverrides[promptId],
      ...override,
    };
    await this.save(config);
  }

  async addPrompt(prompt: PromptPreset): Promise<void> {
    const config = this.load();
    const existing = config.prompts.findIndex((p) => p.id === prompt.id);
    if (existing >= 0) {
      config.prompts[existing] = prompt;
    } else {
      config.prompts.push(prompt);
    }
    await this.save(config);
  }

  async removePrompt(promptId: string): Promise<void> {
    const config = this.load();
    config.prompts = config.prompts.filter((p) => p.id !== promptId);
    delete config.promptOverrides[promptId];
    await this.save(config);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async clear(): Promise<void> {
    await this.save({ ...DEFAULT_USER_CONFIG });
  }

  async migrateProviders(currentBuiltinIds: Set<string>): Promise<void> {
    const config = this.load();
    const originalCount = config.providers.length;

    config.providers = config.providers.filter((p) => {
      if (!p.builtin) return true;
      if (currentBuiltinIds.has(p.id)) return true;
      return true;
    });

    if (config.providers.length !== originalCount) {
      await this.save(config);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.stopWatching) {
      this.stopWatching();
      this.stopWatching = null;
    }
  }
}

// Re-export path utility for convenience
export { getUserConfigPath };
