/**
 * Configuration Manager
 * Merges configuration from three tiers: Builtin → User → Workspace
 *
 * Refactored to use ConfigSection pattern and specialized services.
 */

import type { Provider, Model } from '../types/provider';
import type { Group } from '../types/group';
import type { ExecutionGroup } from '../types/execution-group';
import type { RetryTimeoutPreset, BuiltinPresetName } from '../types/error';
import type { MCPServerPreset, WorkflowPreset, PromptPreset } from '../types/config';
import type { ChatModelOption } from '@neko/shared';
import { loadBuiltinPresets, setLocale, type BuiltinPresets } from './builtin-presets';
import { UserConfigManager, type UserConfig, type UserConfigStorage } from './user-config';
import { loadWorkspaceConfig, watchWorkspaceConfig, type WorkspaceConfig } from './workspace-config';
import {
  createConfigSections,
  type ConfigSections,
  type ProviderSection,
  type ModelSection,
} from './config-section-impls';
import type { MergeContext } from './base-config-section';
import { ChatModelService } from './chat-model-service';
import {
  ConfigExportService,
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config-export-service';

/**
 * Merged configuration
 */
export interface MergedConfig {
  providers: Map<string, Provider>;
  models: Map<string, Model>;
  groups: Map<string, Group>;
  executionGroups: Map<string, ExecutionGroup>;
  retryTimeoutPresets: Map<string, RetryTimeoutPreset>;
  mcpServers: Map<string, MCPServerPreset>;
  workflows: Map<string, WorkflowPreset>;
  prompts: Map<string, PromptPreset>;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  type: 'provider' | 'model' | 'group' | 'executionGroup' | 'mcpServer' | 'workflow' | 'prompt' | 'all';
  ids?: string[];
}

/**
 * Configuration change listener
 */
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

/**
 * Configuration manager options
 */
export interface ConfigManagerOptions {
  userConfigStorage?: UserConfigStorage;
  workspacePath?: string;
  locale?: string;
}

/**
 * ConfigManager - Unified configuration management
 *
 * Priority (highest to lowest):
 * 1. Workspace config (.neko/config.json)
 * 2. User config (VS Code globalState)
 * 3. Builtin presets
 */
export class ConfigManager {
  private builtinPresets: BuiltinPresets;
  private userConfigManager: UserConfigManager | null = null;
  private workspaceConfig: WorkspaceConfig | null = null;
  private workspacePath: string | null = null;
  private stopWatching: (() => void) | null = null;
  private listeners: Set<ConfigChangeListener> = new Set();
  private sections: ConfigSections;
  private retryTimeoutPresets: Map<string, RetryTimeoutPreset> = new Map();
  private configMerged = false;
  private cachedConfig: MergedConfig | null = null;

  // Specialized services
  private readonly chatModelService = new ChatModelService();
  private readonly configExportService = new ConfigExportService();

  constructor(options: ConfigManagerOptions = {}) {
    // Set locale before loading builtin presets
    if (options.locale) {
      setLocale(options.locale);
    }

    this.builtinPresets = loadBuiltinPresets();

    if (options.userConfigStorage) {
      this.userConfigManager = new UserConfigManager(options.userConfigStorage);
    }

    if (options.workspacePath) {
      this.workspacePath = options.workspacePath;
      this.workspaceConfig = loadWorkspaceConfig(options.workspacePath);
      this.stopWatching = watchWorkspaceConfig(options.workspacePath, (config) => {
        this.workspaceConfig = config;
        this.invalidateCache();
        this.notifyListeners({ type: 'all' });
      });
    }

    // Initialize config sections
    this.sections = createConfigSections({
      userConfigManager: this.userConfigManager,
      onInvalidate: () => this.invalidateCache(),
      onNotify: (type, ids) => this.notifyListeners({ type: type as ConfigChangeEvent['type'], ids }),
    });
  }

  /**
   * Get merged configuration
   */
  getConfig(): MergedConfig {
    this.ensureMerged();
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    this.cachedConfig = {
      providers: new Map(this.sections.providers.getAll().map((p) => [p.id, p])),
      models: new Map(this.sections.models.getAll().map((m) => [m.id, m])),
      groups: new Map(this.sections.groups.getAll().map((g) => [g.id, g])),
      executionGroups: new Map(this.sections.executionGroups.getAll().map((e) => [e.id, e])),
      retryTimeoutPresets: this.retryTimeoutPresets,
      mcpServers: new Map(this.sections.mcpServers.getAll().map((s) => [s.id, s])),
      workflows: new Map(this.sections.workflows.getAll().map((w) => [w.id, w])),
      prompts: new Map(this.sections.prompts.getAll().map((p) => [p.id, p])),
    };
    return this.cachedConfig;
  }

  /**
   * Get user configuration (for extension layer)
   */
  getUserConfig(): UserConfig {
    return this.userConfigManager?.load() ?? {
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
  }

  // ==========================================================================
  // Provider Methods
  // ==========================================================================

  getProvider(id: string): Provider | undefined {
    this.ensureMerged();
    return this.sections.providers.get(id);
  }

  getProviders(): Provider[] {
    this.ensureMerged();
    return this.sections.providers.getAll();
  }

  getEnabledProviders(): Provider[] {
    this.ensureMerged();
    return this.sections.providers.getEnabled();
  }

  async setProvider(provider: Provider): Promise<void> {
    await this.sections.providers.set(provider);
  }

  async removeProvider(providerId: string): Promise<void> {
    await this.sections.providers.remove(providerId);
  }

  async setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    await (this.sections.providers as ProviderSection).setApiKey(providerId, apiKey);
  }

  async updateProviderOverride(providerId: string, override: Partial<Provider>): Promise<void> {
    await this.sections.providers.updateOverride(providerId, override);
  }

  async removeProviderOverride(providerId: string): Promise<void> {
    await this.sections.providers.removeOverride(providerId);
  }

  // ==========================================================================
  // Model Methods
  // ==========================================================================

  getModel(id: string): Model | undefined {
    this.ensureMerged();
    return this.sections.models.get(id);
  }

  getModels(): Model[] {
    this.ensureMerged();
    return this.sections.models.getAll();
  }

  getEnabledModels(): Model[] {
    this.ensureMerged();
    return this.sections.models.getEnabled();
  }

  getModelsByProvider(providerId: string): Model[] {
    this.ensureMerged();
    return (this.sections.models as ModelSection).getByProvider(providerId);
  }

  /**
   * Get chat model options for UI model selector
   * Returns a list of enabled models with 'auto' as the first option
   * Only includes models from providers with API key configured
   */
  getChatModelOptions(): ChatModelOption[] {
    this.ensureMerged();
    return this.chatModelService.getChatModelOptions(
      this.getEnabledProviders(),
      this.getEnabledModels()
    );
  }

  async setModel(model: Model): Promise<void> {
    await this.sections.models.set(model);
  }

  async removeModel(modelId: string): Promise<void> {
    await this.sections.models.remove(modelId);
  }

  async updateModelOverride(modelId: string, override: Partial<Model>): Promise<void> {
    await this.sections.models.updateOverride(modelId, override);
  }

  // ==========================================================================
  // Group Methods
  // ==========================================================================

  getGroup(id: string): Group | undefined {
    this.ensureMerged();
    return this.sections.groups.get(id);
  }

  getGroups(): Group[] {
    this.ensureMerged();
    return this.sections.groups.getAll();
  }

  getEnabledGroups(): Group[] {
    this.ensureMerged();
    return this.sections.groups.getEnabled();
  }

  async setGroup(group: Group): Promise<void> {
    await this.sections.groups.set(group);
  }

  // ==========================================================================
  // Execution Group Methods
  // ==========================================================================

  getExecutionGroup(id: string): ExecutionGroup | undefined {
    this.ensureMerged();
    return this.sections.executionGroups.get(id);
  }

  getExecutionGroups(): ExecutionGroup[] {
    this.ensureMerged();
    return this.sections.executionGroups.getAll();
  }

  getEnabledExecutionGroups(): ExecutionGroup[] {
    this.ensureMerged();
    return this.sections.executionGroups.getEnabled();
  }

  // ==========================================================================
  // MCP Server Methods
  // ==========================================================================

  getMCPServer(id: string): MCPServerPreset | undefined {
    this.ensureMerged();
    return this.sections.mcpServers.get(id);
  }

  getMCPServers(): MCPServerPreset[] {
    this.ensureMerged();
    return this.sections.mcpServers.getAll();
  }

  getEnabledMCPServers(): MCPServerPreset[] {
    this.ensureMerged();
    return this.sections.mcpServers.getEnabled();
  }

  async setMCPServer(server: MCPServerPreset): Promise<void> {
    await this.sections.mcpServers.set(server);
  }

  async removeMCPServer(serverId: string): Promise<void> {
    await this.sections.mcpServers.remove(serverId);
  }

  async updateMCPServerOverride(serverId: string, override: Partial<MCPServerPreset>): Promise<void> {
    await this.sections.mcpServers.updateOverride(serverId, override);
  }

  // ==========================================================================
  // Workflow Methods
  // ==========================================================================

  getWorkflow(id: string): WorkflowPreset | undefined {
    this.ensureMerged();
    return this.sections.workflows.get(id);
  }

  getWorkflows(): WorkflowPreset[] {
    this.ensureMerged();
    return this.sections.workflows.getAll();
  }

  getEnabledWorkflows(): WorkflowPreset[] {
    this.ensureMerged();
    return this.sections.workflows.getEnabled();
  }

  async setWorkflow(workflow: WorkflowPreset): Promise<void> {
    await this.sections.workflows.set(workflow);
  }

  async removeWorkflow(workflowId: string): Promise<void> {
    await this.sections.workflows.remove(workflowId);
  }

  async updateWorkflowOverride(workflowId: string, override: Partial<WorkflowPreset>): Promise<void> {
    await this.sections.workflows.updateOverride(workflowId, override);
  }

  // ==========================================================================
  // Prompt Methods
  // ==========================================================================

  getPrompt(id: string): PromptPreset | undefined {
    this.ensureMerged();
    return this.sections.prompts.get(id);
  }

  getPrompts(): PromptPreset[] {
    this.ensureMerged();
    return this.sections.prompts.getAll();
  }

  getEnabledPrompts(): PromptPreset[] {
    this.ensureMerged();
    return this.sections.prompts.getEnabled();
  }

  async setPrompt(prompt: PromptPreset): Promise<void> {
    await this.sections.prompts.set(prompt);
  }

  async removePrompt(promptId: string): Promise<void> {
    await this.sections.prompts.remove(promptId);
  }

  async updatePromptOverride(promptId: string, override: Partial<PromptPreset>): Promise<void> {
    await this.sections.prompts.updateOverride(promptId, override);
  }

  // ==========================================================================
  // Retry/Timeout Preset Methods
  // ==========================================================================

  getRetryTimeoutPreset(name: BuiltinPresetName): RetryTimeoutPreset | undefined {
    this.ensureMerged();
    return this.retryTimeoutPresets.get(name);
  }

  // ==========================================================================
  // Import/Export Methods
  // ==========================================================================

  /**
   * Export result
   */
  exportConfig(options: { includeSecrets?: boolean } = {}): ConfigExportData {
    const config = this.getConfig();
    return this.configExportService.exportConfig(
      config.providers,
      config.models,
      options
    );
  }

  /**
   * Import configuration from export data
   */
  async importConfig(
    data: ConfigExportData,
    options: { overwrite?: boolean; includeSecrets?: boolean } = {}
  ): Promise<ConfigImportResult> {
    return this.configExportService.importConfig(data, this, options);
  }

  /**
   * Add a custom provider configuration
   */
  async addCustomProvider(config: CustomProviderConfig): Promise<ConfigImportResult> {
    return this.configExportService.addCustomProvider(config, this);
  }

  // ==========================================================================
  // Listener Methods
  // ==========================================================================

  onChange(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  reloadWorkspaceConfig(): void {
    if (this.workspacePath) {
      this.workspaceConfig = loadWorkspaceConfig(this.workspacePath);
    }
    this.invalidateCache();
    this.notifyListeners({ type: 'all' });
  }

  reloadConfig(): void {
    this.invalidateCache();
    this.notifyListeners({ type: 'all' });
  }

  dispose(): void {
    if (this.stopWatching) {
      this.stopWatching();
      this.stopWatching = null;
    }
    this.listeners.clear();
    this.configMerged = false;
    this.cachedConfig = null;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private invalidateCache(): void {
    this.configMerged = false;
    this.cachedConfig = null;
  }

  private notifyListeners(event: ConfigChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Config change listener error:', error);
      }
    }
  }

  /**
   * Ensure all sections are merged from the three-tier config
   */
  private ensureMerged(): void {
    if (this.configMerged) {
      return;
    }

    const userConfig = this.userConfigManager?.load();
    const workspace = this.workspaceConfig;

    // Merge each section
    this.sections.providers.merge(this.builtinPresets.providers, this.createMergeContext(
      userConfig?.providers ?? [],
      userConfig?.providerOverrides ?? {},
      workspace?.providers,
      workspace?.providerOverrides
    ));

    this.sections.models.merge(this.builtinPresets.models, this.createMergeContext(
      userConfig?.models ?? [],
      userConfig?.modelOverrides ?? {},
      workspace?.models,
      workspace?.modelOverrides
    ));

    this.sections.groups.merge(this.builtinPresets.groups, this.createMergeContext(
      userConfig?.groups ?? [],
      userConfig?.groupOverrides ?? {},
      workspace?.groups,
      workspace?.groupOverrides
    ));

    this.sections.executionGroups.merge(this.builtinPresets.executionGroups ?? [], {
      userItems: [],
      userOverrides: {},
    });

    this.sections.mcpServers.merge(this.builtinPresets.mcpServers, this.createMergeContext(
      userConfig?.mcpServers ?? [],
      userConfig?.mcpServerOverrides ?? {},
      workspace?.mcpServers,
      workspace?.mcpServerOverrides
    ));

    this.sections.workflows.merge(this.builtinPresets.workflows, this.createMergeContext(
      userConfig?.workflows ?? [],
      userConfig?.workflowOverrides ?? {},
      workspace?.workflows,
      workspace?.workflowOverrides
    ));

    this.sections.prompts.merge(this.builtinPresets.prompts, this.createMergeContext(
      userConfig?.prompts ?? [],
      userConfig?.promptOverrides ?? {},
      workspace?.prompts,
      workspace?.promptOverrides
    ));

    // Merge retry/timeout presets (only from builtin)
    this.retryTimeoutPresets.clear();
    for (const [name, preset] of Object.entries(this.builtinPresets.retryTimeoutPresets)) {
      this.retryTimeoutPresets.set(name, { ...preset });
    }

    // Substitute workspace path in MCP server configurations
    this.substituteMCPWorkspacePath();

    this.configMerged = true;
  }

  /**
   * Substitute placeholder paths in MCP server configurations with actual workspace path.
   * This replaces '/path/to/allowed/dir' in filesystem MCP server args with workspacePath.
   */
  private substituteMCPWorkspacePath(): void {
    if (!this.workspacePath) return;

    const mcpServers = this.sections.mcpServers.getAll();
    for (const server of mcpServers) {
      // Only process filesystem MCP server
      if (server.id !== 'filesystem' || !server.args) continue;

      // Find and replace the placeholder path in args
      const PLACEHOLDER_PATH = '/path/to/allowed/dir';
      const updatedArgs = server.args.map((arg) =>
        arg === PLACEHOLDER_PATH ? this.workspacePath! : arg
      );

      // Update the server configuration in the items map
      // We directly mutate because we're within the merge process
      (server as { args: string[] }).args = updatedArgs;
    }
  }

  private createMergeContext<T>(
    userItems: T[],
    userOverrides: Record<string, Partial<T>>,
    workspaceItems?: T[],
    workspaceOverrides?: Record<string, Partial<T>>
  ): MergeContext<T> {
    return {
      userItems,
      userOverrides,
      workspaceItems,
      workspaceOverrides,
    };
  }
}
