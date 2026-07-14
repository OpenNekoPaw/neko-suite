/**
 * Skill Module - Claude-compatible Skill System
 *
 * This module provides two distinct concepts:
 *
 * 1. **Skill** - Agent-readable instruction set activated explicitly
 *    - Located in: `.agents/skills/skill-name/SKILL.md` (project) or `~/.agents/skills/` (personal)
 *    - Triggered by: User `$skill` invocation or Agent `ActivateSkill`
 *    - Arguments: NOT supported (no $ARGUMENTS, $1, $2)
 *    - File structure: skill-name/SKILL.md + support files
 *
 * 2. **Slash Command** - Explicit trigger with /command
 *    - Located in: `.command/command-name.md` (project) or `~/.neko/commands/` (personal)
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
export { SkillRegistry, type SkillRegistryOptions } from './skill-registry';
export {
  projectSkillHostProjection,
  resolveNekoSkillCompatibility,
  type SkillHostProjectionContext,
  type SkillHostProjectionContextResolver,
} from './skill-host-projection';
export { SkillLoader, createNodeSkillLoader } from './skill-loader';
export { type LazySkill, type LazyCommand, type LazySkillLoadResult } from './lazy-loader';
export { SkillInjector } from './skill-injector';
export { SkillMatcher, KeywordSkillMatcher } from './skill-matcher';
export { createCommandBackedSkill, createLazyCommandBackedSkill } from './command-backed-skill';
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

// Activation-time subpackage guard (ADR §5.2.10)
export {
  assertSubpackagesAvailable,
  SkillActivationError,
  type ISubpackageResolver,
  type SubpackageInfo,
  type SkillActivationIssue,
  type SkillActivationIssueCode,
} from './subpackage-guard';

// ToolGroup Registry
export { ToolGroupRegistry, createToolGroupRegistry } from './tool-group-registry';

export {
  projectRuntimeToolGroup,
  projectRuntimeToolGroups,
  type RuntimeToolGroupRegistryView,
} from './tool-group-projector';

// Skill Injection Coordinator
export {
  SkillInjectionCoordinator,
  createSkillInjectionCoordinator,
  type SkillInjectionCoordinatorDeps,
} from './skill-injection-coordinator';

export {
  SkillLifecycleStore,
  compareLifecycleRecords,
  type SkillLifecycleCreateRecordInput,
  type SkillLifecycleExpireInput,
  type SkillLifecycleRenewRecordInput,
  type SkillLifecycleStoreOptions,
} from './skill-lifecycle-store';

export {
  buildLifecyclePromptSectionId,
  hasBlockingLifecycleProjectionDiagnostic,
  projectSkillLifecycle,
  type SkillLifecycleProjectionInput,
} from './skill-lifecycle-projection';

export {
  SkillLifecycleRuntime,
  defaultDeactivationPolicy,
  defaultSkillLifecycleRequest,
  projectSkillSummary,
  type SkillLifecyclePreparedActivationInput,
  type SkillLifecycleRuntimeOptions,
} from './skill-lifecycle-runtime';

// Skill Conflict Resolver
export { SkillConflictResolver, createSkillConflictResolver } from './skill-conflict-resolver';

// Path Matcher (for Skill paths trigger)
export { matchSkillPaths, globMatch, type SkillPathInfo } from './path-matcher';

// Skill file host-neutral projection
export {
  appendSkillFileScanLoadResult,
  buildSkillDirectoryLoadFailureResult,
  buildCommandFileCreationPlan,
  buildCommandFileDeletionPlan,
  buildCommandFileOpenPlan,
  buildSkillFileScanPlan,
  buildSkillFileCreationPlan,
  buildSkillDirectoryDeletionPlan,
  buildSkillDirectoryDuplicationPlan,
  createEmptySkillFileScanResult,
  buildSkillSupportFileOpenPlan,
  normalizeSkillFrontmatter,
  normalizeDuplicatedSkillContent,
  buildCommandFileContent,
  shouldCopySkillDirectoryEntry,
  toConfiguredSkillFileCatalog,
  resolveSkillPathTriggers,
  type SkillFileScanGroup,
  type SkillFileScanResult,
  type SkillFileScanGroupOf,
  type SkillFileScanResultOf,
  type LazySkillFileScanResult,
  type ConfiguredSkillFileCatalog,
  type CommandFileCreationPlan,
  type CommandFileDeletionPlan,
  type CommandFileOpenPlan,
  type ResolveSkillPathTriggersOptions,
  type SkillFileLoadResultOf,
  type SkillFileScanError,
  type SkillFileScanKind,
  type SkillFileScanPlan,
  type SkillFileScanPlanEntry,
  type SkillFileSource,
  type SkillDirectoryDeletionPlan,
  type SkillDirectoryDuplicationPlan,
  type SkillFileCreationPlan,
  type SkillFileOperationFailurePlan,
  type SkillPathTriggerMatch,
  type SkillSupportFileOpenPlan,
  type SkillSupportFileOpenType,
} from './skill-file-projector';

export {
  SKILL_FILE_WATCH_DEBOUNCE_MS,
  SKILL_PATH_TRIGGER_DEBOUNCE_MS,
  createSkillFileRuntime,
  type CreateCommandFileInput,
  type DeleteCommandFileInput,
  type DeleteSkillDirectoryInput,
  type DuplicateSkillDirectoryInput,
  type SkillFileRuntime,
  type SkillFileRuntimeDirentLike,
  type SkillFileRuntimeFs,
  type SkillFileRuntimeLoader,
  type SkillFileRuntimeLogger,
  type SkillFileRuntimeOptions,
  type SkillFileRuntimePath,
} from './skill-file-runtime';

// Webview-facing skill projection
export {
  buildSkillInjectionMessage,
  buildSkillsListMessage,
  type SkillInjectionMessage,
  type SkillsListMessage,
} from './skill-webview-presenter';

export {
  buildSkillAwareSystemPrompt,
  getEnabledSkillPromptEntries,
  toSkillPromptEntries,
  type BuildSkillAwareSystemPromptInput,
  type SkillPromptEntry,
} from './skill-system-prompt';

export {
  SkillRegistryPopulator,
  type LazySkillRegistryPopulateInput,
  type LazySkillRegistryScanGroup,
  type LazySkillRegistryScanResult,
  type SkillRegistryPopulateInput,
  type SkillRegistryPopulationSummary,
  type SkillRegistryScanGroup,
  type SkillRegistryScanResult,
} from './skill-registry-populator';

export {
  buildRuntimeSkillAwareSystemPrompt,
  createRuntimeSkillLazySync,
  createRuntimeSkillBootstrap,
  populateLazyRuntimeSkillRegistry,
  type BuildRuntimeSkillAwareSystemPromptInput,
  type PopulateLazyRuntimeSkillRegistryInput,
  type RuntimeSkillLazySync,
  type RuntimeSkillLazySyncLogger,
  type RuntimeSkillLazySyncOptions,
  type RuntimeSkillBootstrap,
  type RuntimeSkillBootstrapLogger,
  type RuntimeSkillBootstrapOptions,
  type RuntimeSkillAwareSystemPromptResult,
  type RuntimeSkillProviderState,
} from './skill-runtime-bootstrap';

// Conversation-scoped skill activation runtime
export {
  ConversationSkillRuntime,
  type ActiveSkillState,
  type ApplySkillInvocationInput,
  type ApplySlashSkillCommandInput,
  type ConversationSkillAgentBridge,
  type ConversationSkillRuntimeDeps,
  type ConversationSkillRuntimeLogger,
  type ExecuteSkillInput,
  type AutoActivateSkillInput,
} from './conversation-skill-runtime';

// Meta-tool skill provider
export {
  createConversationSkillProvider,
  type ConversationSkillProviderEffects,
  type ConversationSkillProviderOptions,
} from './skill-meta-provider';

// Markdown parser
export {
  MarkdownParser,
  createMarkdownParser,
  type IMarkdownParser,
  type YamlValue,
} from './markdown-parser';

// Re-export types from @neko/shared for convenience
export type {
  // Core types - Skill (semantic discovery)
  Skill,
  SkillSource,

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
} from '@neko/shared';

// Re-export utility functions from @neko/shared
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
} from '@neko/shared';
export * from './portable-skill';
export * from './neko-skill-overlay';
export * from './skill-package-path';
export * from './legacy-skill-migration';
