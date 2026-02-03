/**
 * Skill Module - Claude-compatible Skill System
 *
 * This module provides two distinct concepts:
 *
 * 1. **Skill** - Semantic discovery, auto-triggered based on description matching
 *    - Located in: `.skill/skill-name/SKILL.md` (project) or `~/.uniedit/skills/` (personal)
 *    - Triggered by: Semantic matching of user input against description
 *    - Arguments: NOT supported (no $ARGUMENTS, $1, $2)
 *    - File structure: skill-name/SKILL.md + support files
 *
 * 2. **Slash Command** - Explicit trigger with /command
 *    - Located in: `.command/command-name.md` (project) or `~/.uniedit/commands/` (personal)
 *    - Triggered by: User typing /command
 *    - Arguments: Supported ($ARGUMENTS, $1, $2, etc.)
 *    - File structure: Single .md file
 *
 * Key Components:
 * - SkillRegistry: Manages skills and slash commands separately
 * - SkillLoader: Loads skills from directories, commands from single files
 * - SkillInjector: Prepares skills/commands for injection (with/without interpolation)
 * - SkillMatcher: Semantic matching for skill discovery
 * - ToolGuard: Runtime enforcement of allowed-tools
 */

// Core exports
export { SkillRegistry } from './skill-registry';
export { SkillLoader, createNodeSkillLoader } from './skill-loader';
export {
  type LazySkill,
  type LazyCommand,
  type LazySkillLoadResult,
} from './lazy-loader';
export { SkillInjector } from './skill-injector';
export { SkillMatcher, KeywordSkillMatcher } from './skill-matcher';
export {
  ToolGuard,
  NoOpToolGuard,
  createToolGuard,
  type IToolGuard,
  type ToolCallInput,
  type ToolGuardResult,
} from './tool-guard';

// Skill Service - Orchestration layer
export {
  SkillService,
  createSkillService,
  type SkillDiscoveryResult,
  type SkillApplicationResult,
  type ConfirmSkillCallback,
  type SkillServiceConfig,
} from './skill-service';

// Builtin skills and commands
export {
  registerBuiltins,
  registerBuiltinSkills,
  builtinSkills,
  builtinCommands,
  // ToolGroups
  builtinToolGroups,
  registerBuiltinToolGroups,
  // Legacy ToolSkill exports
  builtinToolSkills,
  registerBuiltinToolSkills,
} from './builtins';

// ToolGroup Registry (renamed from ToolSkill)
export {
  ToolGroupRegistry,
  createToolGroupRegistry,
  // Legacy exports
  ToolSkillRegistry,
  createToolSkillRegistry,
} from './tool-group-registry';

// Skill Conflict Resolver
export {
  SkillConflictResolver,
  createSkillConflictResolver,
} from './skill-conflict-resolver';

// Markdown parser
export {
  MarkdownParser,
  createMarkdownParser,
  type IMarkdownParser,
  type YamlValue,
} from './markdown-parser';

// Re-export types from @uniedit/shared for convenience
export type {
  // Core types - Skill (semantic discovery)
  Skill,
  SkillSource,

  // Core types - Slash Command (explicit trigger)
  SlashCommand,

  // Matching
  SkillMatch,
  ISkillMatcher,

  // Injection
  SkillInjection,
  ISkillInjector,

  // Registry
  ISkillRegistry,
  ISkillService,

  // Loading - Skill
  SkillFrontmatter,
  ParsedSkillFile,
  SkillLoadResult,
  SkillLoadError,
  ISkillFileSystem,

  // Loading - Command
  CommandFrontmatter,

  // UI
  SkillSummary,

  // Validation
  SkillValidationResult,

  // Legacy (deprecated)
  LegacySkill,
  LegacySkillFrontmatter,
  SkillSlashCommand,
} from '@uniedit/shared';

// Re-export utility functions from @uniedit/shared
export {
  // Skill functions
  toSkillSummary,
  validateSkill,
  createSkill,

  // Command functions
  toCommandSummary,
  validateCommand,
  createCommand,

  // Common functions
  parseAllowedTools,
  isToolAllowed,
  extractSupportFileRefs,

  // Constants
  SKILL_DIRECTORIES,
  COMMAND_DIRECTORIES,
} from '@uniedit/shared';
