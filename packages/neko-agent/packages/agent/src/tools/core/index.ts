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
export { MemoryWriteTool } from './memory-write-tool';
// Phase B (2026-04-22): DraftWrite / PlanWrite / TaskWrite deleted. AI uses
// the generic `Write` tool against `.neko/drafts|plans|tasks/*.md` now; the
// ArtifactWatcher validates frontmatter post-write (see artifact/index.ts).
