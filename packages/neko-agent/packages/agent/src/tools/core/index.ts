/**
 * Core Tools Module
 *
 * Meta tools (always layer):
 * - GetContext: Get current context information (skills, tool categories)
 * - ActivateSkill: Activate a skill for domain-specific instructions
 * - DeactivateSkill: Clear the active skill
 *
 * Core file/system tools:
 * - Read, Write, Bash, ListDirectory, Grep
 */

export {
  ActivateSkillTool,
  DeactivateSkillTool,
  GetContextTool,
  createCoreMetaTools,
  type ISkillProvider,
  type SkillProviderFactory,
  type SkillProviderMaybePromise,
} from './meta-tools';
export {
  DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS,
  createPluginSkillDiscoveryTools,
  type PluginSkillCatalogue,
  type PluginSkillCatalogueEntry,
  type PluginSkillCatalogueSource,
  type PluginSkillDiscoveryLogger,
} from './plugin-skill-discovery-tool';

// Core file/system tools
export { ReadTool } from './read-tool';
export { WriteTool } from './write-tool';
export { BashTool, type BashToolOptions } from './bash-tool';
export { ListDirectoryTool } from './list-directory-tool';
export { GrepTool, type GrepToolOptions } from './grep-tool';
export { createCoreTools, type CoreToolsOptions } from './core-tools';
export {
  authorizePathInsideRoots,
  isForbiddenUnmanagedPath,
  isPathInsideRoot,
  normalizeAccessRoots,
  type RootPathAccessDecision,
} from './path-access-core';
export {
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessDecision,
  type CoreFileAccessDenialReason,
  type CoreFileAccessPolicy,
  type FileAccessKind,
  type WorkspaceFileAccessPolicyOptions,
} from './file-access-policy';
export type { WorkspaceFileIgnoreRules } from '../../input/workspace-ignore';
export { MemoryWriteTool } from './memory-write-tool';
// Draft/Plan/Task review documents are host-owned and are not written through
// the generic file tools.
