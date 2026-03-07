/**
 * Config Section Implementations
 *
 * Concrete implementations of BaseConfigSection for each config type.
 */

import type { Provider, Model } from '../types/provider';
import type { MCPServerPreset, WorkflowPreset, PromptPreset } from '../types/config';
import { BaseConfigSection, type ConfigSectionOptions } from './base-config-section';
import type { UserConfigManager } from './user-config';

// =============================================================================
// Provider Section
// =============================================================================

export class ProviderSection extends BaseConfigSection<Provider> {
  constructor(options: Omit<ConfigSectionOptions<Provider>, 'name' | 'builtinOverridableFields'>) {
    super({
      ...options,
      name: 'provider',
      builtinOverridableFields: ['enabled', 'apiUrl', 'apiKey'] as (keyof Provider)[],
    });
  }

  protected async doSet(item: Provider): Promise<void> {
    await this.userConfigManager!.addProvider(item);
  }

  protected async doRemove(id: string): Promise<void> {
    await this.userConfigManager!.removeProvider(id);
  }

  protected async doUpdateOverride(id: string, override: Partial<Provider>): Promise<void> {
    await this.userConfigManager!.updateProviderOverride(id, override);
  }

  protected async doRemoveOverride(id: string): Promise<void> {
    const config = this.userConfigManager!.load();
    delete config.providerOverrides[id];
    await this.userConfigManager!.save(config);
  }

  /**
   * Set provider API key (convenience method)
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.updateOverride(providerId, { apiKey } as Partial<Provider>);
  }
}

// =============================================================================
// Model Section
// =============================================================================

export class ModelSection extends BaseConfigSection<Model> {
  constructor(options: Omit<ConfigSectionOptions<Model>, 'name' | 'builtinOverridableFields'>) {
    super({
      ...options,
      name: 'model',
      builtinOverridableFields: ['enabled'] as (keyof Model)[],
    });
  }

  /**
   * Get models by provider
   */
  getByProvider(providerId: string): Model[] {
    return this.getAll().filter((m) => m.providerId === providerId);
  }

  protected async doSet(item: Model): Promise<void> {
    await this.userConfigManager!.addModel(item);
  }

  protected async doRemove(id: string): Promise<void> {
    await this.userConfigManager!.removeModel(id);
  }

  protected async doUpdateOverride(id: string, override: Partial<Model>): Promise<void> {
    const config = this.userConfigManager!.load();
    config.modelOverrides[id] = {
      ...config.modelOverrides[id],
      ...override,
    };
    await this.userConfigManager!.save(config);
  }

  protected async doRemoveOverride(id: string): Promise<void> {
    const config = this.userConfigManager!.load();
    delete config.modelOverrides[id];
    await this.userConfigManager!.save(config);
  }
}

// =============================================================================
// MCP Server Section
// =============================================================================

export class MCPServerSection extends BaseConfigSection<MCPServerPreset> {
  constructor(
    options: Omit<ConfigSectionOptions<MCPServerPreset>, 'name' | 'builtinOverridableFields'>
  ) {
    super({
      ...options,
      name: 'mcpServer',
      builtinOverridableFields: ['enabled', 'command', 'args', 'env', 'url'] as (keyof MCPServerPreset)[],
    });
  }

  protected async doSet(item: MCPServerPreset): Promise<void> {
    await this.userConfigManager!.addMCPServer(item);
  }

  protected async doRemove(id: string): Promise<void> {
    await this.userConfigManager!.removeMCPServer(id);
  }

  protected async doUpdateOverride(id: string, override: Partial<MCPServerPreset>): Promise<void> {
    await this.userConfigManager!.updateMCPServerOverride(id, override);
  }

  protected async doRemoveOverride(id: string): Promise<void> {
    const config = this.userConfigManager!.load();
    delete config.mcpServerOverrides[id];
    await this.userConfigManager!.save(config);
  }
}

// =============================================================================
// Workflow Section
// =============================================================================

export class WorkflowSection extends BaseConfigSection<WorkflowPreset> {
  constructor(
    options: Omit<ConfigSectionOptions<WorkflowPreset>, 'name' | 'builtinOverridableFields'>
  ) {
    super({
      ...options,
      name: 'workflow',
      builtinOverridableFields: ['enabled', 'url', 'apiKey'] as (keyof WorkflowPreset)[],
    });
  }

  protected async doSet(item: WorkflowPreset): Promise<void> {
    await this.userConfigManager!.addWorkflow(item);
  }

  protected async doRemove(id: string): Promise<void> {
    await this.userConfigManager!.removeWorkflow(id);
  }

  protected async doUpdateOverride(id: string, override: Partial<WorkflowPreset>): Promise<void> {
    await this.userConfigManager!.updateWorkflowOverride(id, override);
  }

  protected async doRemoveOverride(id: string): Promise<void> {
    const config = this.userConfigManager!.load();
    delete config.workflowOverrides[id];
    await this.userConfigManager!.save(config);
  }
}

// =============================================================================
// Prompt Section
// =============================================================================

export class PromptSection extends BaseConfigSection<PromptPreset> {
  constructor(
    options: Omit<ConfigSectionOptions<PromptPreset>, 'name' | 'builtinOverridableFields'>
  ) {
    super({
      ...options,
      name: 'prompt',
      builtinOverridableFields: [
        'enabled',
        'autoExecuteTools',
        'streamResponses',
        'showToolCalls',
        'temperature',
        'maxTokens',
        'preferredProvider',
        'preferredModel',
      ] as (keyof PromptPreset)[],
    });
  }

  protected async doSet(item: PromptPreset): Promise<void> {
    await this.userConfigManager!.addPrompt(item);
  }

  protected async doRemove(id: string): Promise<void> {
    await this.userConfigManager!.removePrompt(id);
  }

  protected async doUpdateOverride(id: string, override: Partial<PromptPreset>): Promise<void> {
    await this.userConfigManager!.updatePromptOverride(id, override);
  }

  protected async doRemoveOverride(id: string): Promise<void> {
    const config = this.userConfigManager!.load();
    delete config.promptOverrides[id];
    await this.userConfigManager!.save(config);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export interface ConfigSections {
  providers: ProviderSection;
  models: ModelSection;
  mcpServers: MCPServerSection;
  workflows: WorkflowSection;
  prompts: PromptSection;
}

export interface CreateConfigSectionsOptions {
  userConfigManager: UserConfigManager | null;
  onInvalidate: () => void;
  onNotify: (type: string, ids: string[]) => void;
}

/**
 * Create all config sections
 */
export function createConfigSections(options: CreateConfigSectionsOptions): ConfigSections {
  const { userConfigManager, onInvalidate, onNotify } = options;

  const createOptions = (name: string) => ({
    userConfigManager,
    onInvalidate,
    onNotify: (ids: string[]) => onNotify(name, ids),
  });

  return {
    providers: new ProviderSection(createOptions('provider')),
    models: new ModelSection(createOptions('model')),
    mcpServers: new MCPServerSection(createOptions('mcpServer')),
    workflows: new WorkflowSection(createOptions('workflow')),
    prompts: new PromptSection(createOptions('prompt')),
  };
}
