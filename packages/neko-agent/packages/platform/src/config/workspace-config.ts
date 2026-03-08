/**
 * Workspace Configuration Loader
 * Loads configuration from .neko/config.json
 *
 * This is shared with cli for unified configuration.
 * Uses shared configuration module from @neko/shared.
 */

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
 * Workspace config supports per-project overrides for MCP, workflows, prompts,
 * and task defaults. Provider/model configuration is user-level only.
 */
export interface WorkspaceConfig {
  /** Workspace-specific MCP servers */
  mcpServers?: MCPServerPreset[];
  /** Workspace-specific workflows */
  workflows?: WorkflowPreset[];
  /** Workspace-specific prompts */
  prompts?: PromptPreset[];
  /** Workspace-specific templates */
  templates?: TemplatePreset[];
  /** MCP server overrides */
  mcpServerOverrides?: Record<string, Partial<MCPServerPreset>>;
  /** Workflow overrides */
  workflowOverrides?: Record<string, Partial<WorkflowPreset>>;
  /** Prompt overrides */
  promptOverrides?: Record<string, Partial<PromptPreset>>;
  /** Template overrides */
  templateOverrides?: Record<string, Partial<TemplatePreset>>;
  /** Task-type to model defaults */
  taskDefaults?: import('@neko/shared').TaskDefaults;
}

/**
 * Convert unified config to workspace config
 *
 * Provider/model fields from the unified file are intentionally ignored —
 * those belong to user-level config (~/.neko/config.json).
 */
function unifiedToWorkspaceConfig(unified: UnifiedConfig | null): WorkspaceConfig | null {
  if (!unified) return null;

  return {
    mcpServers: unified.mcpServers as MCPServerPreset[] | undefined,
    workflows: unified.workflows as WorkflowPreset[] | undefined,
    prompts: unified.prompts as PromptPreset[] | undefined,
    templates: unified.templates as TemplatePreset[] | undefined,
    mcpServerOverrides: unified.mcpServerOverrides as Record<string, Partial<MCPServerPreset>> | undefined,
    workflowOverrides: unified.workflowOverrides as Record<string, Partial<WorkflowPreset>> | undefined,
    promptOverrides: unified.promptOverrides as Record<string, Partial<PromptPreset>> | undefined,
    templateOverrides: unified.templateOverrides as Record<string, Partial<TemplatePreset>> | undefined,
    taskDefaults: unified.taskDefaults,
  };
}

/**
 * Convert workspace config to unified config for saving
 */
function workspaceToUnifiedConfig(workspace: WorkspaceConfig): UnifiedConfig {
  return {
    mcpServers: workspace.mcpServers,
    workflows: workspace.workflows,
    prompts: workspace.prompts,
    templates: workspace.templates,
    mcpServerOverrides: workspace.mcpServerOverrides,
    workflowOverrides: workspace.workflowOverrides,
    promptOverrides: workspace.promptOverrides,
    templateOverrides: workspace.templateOverrides,
    taskDefaults: workspace.taskDefaults,
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
