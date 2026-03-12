/**
 * Workspace Configuration Loader
 *
 * Loads MCP server configuration from .neko/config.json.
 * Workspace config only manages MCP servers — providers and models
 * are user-level only (~/.neko/config.json).
 *
 * Uses shared configuration module from @neko/shared.
 */

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
 * Only MCP servers are workspace-scoped.
 * Providers/models are user-level only (aligned with Claude Code / Cursor).
 */
export interface WorkspaceConfig {
  /** Workspace-specific MCP servers */
  mcpServers?: MCPServerPreset[];
  /** MCP server overrides */
  mcpServerOverrides?: Record<string, Partial<MCPServerPreset>>;
}

/**
 * Convert unified config to workspace config (extract MCP fields only)
 */
function unifiedToWorkspaceConfig(unified: UnifiedConfig | null): WorkspaceConfig | null {
  if (!unified) return null;

  return {
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
    mcpServers: workspace.mcpServers,
    mcpServerOverrides: workspace.mcpServerOverrides,
  };
}

/**
 * Load workspace configuration from file
 */
export function loadWorkspaceConfig(workspacePath: string): WorkspaceConfig | null {
  const unified = readWorkspaceConfigFile(workspacePath);
  return unifiedToWorkspaceConfig(unified);
}

/**
 * Save workspace configuration to file
 */
export function saveWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): void {
  const unified = workspaceToUnifiedConfig(config);
  writeWorkspaceConfigFile(workspacePath, unified);
}

/**
 * Watch workspace configuration for changes
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
