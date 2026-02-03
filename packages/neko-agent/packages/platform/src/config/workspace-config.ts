/**
 * Workspace Configuration Loader
 * Loads configuration from .neko/config.json
 *
 * This is shared with agent-cli for unified configuration.
 * Uses shared configuration module from @neko/shared.
 */

import type { Provider, Model } from '../types/provider';
import type { Group } from '../types/group';
import type { MCPServerPreset, WorkflowPreset, PromptPreset, TemplatePreset } from '../types/config';
import type { UnifiedConfig } from '@neko/shared';
// Node.js config reader - direct import
import {
  readWorkspaceConfig as readWorkspaceConfigFile,
  writeWorkspaceConfig as writeWorkspaceConfigFile,
  watchWorkspaceConfig as watchWorkspaceConfigFile,
  getWorkspaceConfigPath,
} from '@neko/shared/config/config-reader.ts';

/**
 * Workspace configuration structure
 *
 * This interface extends the unified config format with platform-specific types.
 */
export interface WorkspaceConfig {
  /** Workspace-specific providers */
  providers?: Provider[];
  /** Workspace-specific models */
  models?: Model[];
  /** Workspace-specific groups */
  groups?: Group[];
  /** Workspace-specific MCP servers */
  mcpServers?: MCPServerPreset[];
  /** Workspace-specific workflows */
  workflows?: WorkflowPreset[];
  /** Workspace-specific prompts */
  prompts?: PromptPreset[];
  /** Workspace-specific templates */
  templates?: TemplatePreset[];
  /** Provider overrides */
  providerOverrides?: Record<string, Partial<Provider>>;
  /** Model overrides */
  modelOverrides?: Record<string, Partial<Model>>;
  /** Group overrides */
  groupOverrides?: Record<string, Partial<Group>>;
  /** MCP server overrides */
  mcpServerOverrides?: Record<string, Partial<MCPServerPreset>>;
  /** Workflow overrides */
  workflowOverrides?: Record<string, Partial<WorkflowPreset>>;
  /** Prompt overrides */
  promptOverrides?: Record<string, Partial<PromptPreset>>;
  /** Template overrides */
  templateOverrides?: Record<string, Partial<TemplatePreset>>;
}

/**
 * Convert unified config to workspace config
 *
 * The unified config format is compatible with workspace config,
 * but we need to ensure proper type casting.
 */
function unifiedToWorkspaceConfig(unified: UnifiedConfig | null): WorkspaceConfig | null {
  if (!unified) return null;

  return {
    providers: unified.providers as Provider[] | undefined,
    models: unified.models as Model[] | undefined,
    groups: unified.groups as Group[] | undefined,
    mcpServers: unified.mcpServers as MCPServerPreset[] | undefined,
    workflows: unified.workflows as WorkflowPreset[] | undefined,
    prompts: unified.prompts as PromptPreset[] | undefined,
    templates: unified.templates as TemplatePreset[] | undefined,
    providerOverrides: unified.providerOverrides as Record<string, Partial<Provider>> | undefined,
    modelOverrides: unified.modelOverrides as Record<string, Partial<Model>> | undefined,
    groupOverrides: unified.groupOverrides as Record<string, Partial<Group>> | undefined,
    mcpServerOverrides: unified.mcpServerOverrides as Record<string, Partial<MCPServerPreset>> | undefined,
    workflowOverrides: unified.workflowOverrides as Record<string, Partial<WorkflowPreset>> | undefined,
    promptOverrides: unified.promptOverrides as Record<string, Partial<PromptPreset>> | undefined,
    templateOverrides: unified.templateOverrides as Record<string, Partial<TemplatePreset>> | undefined,
  };
}

/**
 * Convert workspace config to unified config for saving
 */
function workspaceToUnifiedConfig(workspace: WorkspaceConfig): UnifiedConfig {
  return {
    providers: workspace.providers,
    models: workspace.models,
    groups: workspace.groups,
    mcpServers: workspace.mcpServers,
    workflows: workspace.workflows,
    prompts: workspace.prompts,
    templates: workspace.templates,
    providerOverrides: workspace.providerOverrides,
    modelOverrides: workspace.modelOverrides,
    groupOverrides: workspace.groupOverrides,
    mcpServerOverrides: workspace.mcpServerOverrides,
    workflowOverrides: workspace.workflowOverrides,
    promptOverrides: workspace.promptOverrides,
    templateOverrides: workspace.templateOverrides,
  };
}

/**
 * Load workspace configuration from file
 *
 * Uses shared configuration reader for unified format.
 */
export function loadWorkspaceConfig(workspacePath: string): WorkspaceConfig | null {
  const unified = readWorkspaceConfigFile(workspacePath);
  return unifiedToWorkspaceConfig(unified);
}

/**
 * Save workspace configuration to file
 *
 * Uses shared configuration writer for unified format.
 */
export function saveWorkspaceConfig(
  workspacePath: string,
  config: WorkspaceConfig
): void {
  const unified = workspaceToUnifiedConfig(config);
  writeWorkspaceConfigFile(workspacePath, unified);
}

/**
 * Watch workspace configuration for changes
 *
 * Uses shared configuration watcher for unified format.
 */
export function watchWorkspaceConfig(
  workspacePath: string,
  callback: (config: WorkspaceConfig | null) => void
): () => void {
  return watchWorkspaceConfigFile(workspacePath, (unified) => {
    callback(unifiedToWorkspaceConfig(unified));
  });
}

// Re-export path utility for convenience
export { getWorkspaceConfigPath };
