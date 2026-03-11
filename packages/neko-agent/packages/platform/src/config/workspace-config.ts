/**
 * Workspace Configuration Loader
 * Loads configuration from .neko/config.json
 *
 * This is shared with cli for unified configuration.
 * Uses shared configuration module from @neko/shared.
 */

import type { Provider, Model } from '../types/provider';
import type { MCPServerPreset } from '../types/config';
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
 * Workspace config supports per-project overrides for providers, models,
 * and MCP servers. Fields align with UnifiedConfig.
 */
export interface WorkspaceConfig {
  /** Workspace-specific providers */
  providers?: Provider[];
  /** Provider overrides */
  providerOverrides?: Record<string, Partial<Provider>>;
  /** Workspace-specific models */
  models?: Model[];
  /** Model overrides */
  modelOverrides?: Record<string, Partial<Model>>;
  /** Workspace-specific MCP servers */
  mcpServers?: MCPServerPreset[];
  /** MCP server overrides */
  mcpServerOverrides?: Record<string, Partial<MCPServerPreset>>;
}

/**
 * Convert unified config to workspace config
 */
function unifiedToWorkspaceConfig(unified: UnifiedConfig | null): WorkspaceConfig | null {
  if (!unified) return null;

  return {
    providers: unified.providers as Provider[] | undefined,
    providerOverrides: unified.providerOverrides as Record<string, Partial<Provider>> | undefined,
    models: unified.models as Model[] | undefined,
    modelOverrides: unified.modelOverrides as Record<string, Partial<Model>> | undefined,
    mcpServers: unified.mcpServers as MCPServerPreset[] | undefined,
    mcpServerOverrides: unified.mcpServerOverrides as
      | Record<string, Partial<MCPServerPreset>>
      | undefined,
  };
}

/**
 * Convert workspace config to unified config for saving
 */
function workspaceToUnifiedConfig(workspace: WorkspaceConfig): UnifiedConfig {
  return {
    providers: workspace.providers,
    providerOverrides: workspace.providerOverrides,
    models: workspace.models,
    modelOverrides: workspace.modelOverrides,
    mcpServers: workspace.mcpServers,
    mcpServerOverrides: workspace.mcpServerOverrides,
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
export function saveWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): void {
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
  callback: (config: WorkspaceConfig | null) => void,
): () => void {
  return watchWorkspaceConfigFile(workspacePath, (unified) => {
    callback(unifiedToWorkspaceConfig(unified));
  });
}

// Re-export path utility for convenience
export { getWorkspaceConfigPath };
