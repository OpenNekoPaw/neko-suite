/**
 * Commands Module
 *
 * Unified builtin command system for cli and extension.
 */

// Types
export type {
  BuiltinCommandName,
  BuiltinCommand,
  CommandCategory,
  CommandContext,
  CommandResult,
  CommandAction,
  CommandHandler,
  CommandHandlerRegistration,
  // Type-safe action data
  ConversationInfo,
  StatusData,
  CommandActionDataMap,
} from './types';

export {
  COMMAND_ALIASES,
  resolveCommandName,
  // Builder
  CommandResultBuilder,
  commandResult,
} from './types';

export type {
  SlashCommandSurface,
  SlashCommandSkillLike,
  SlashCommandCatalogEntry,
} from './command-catalog';
export { listSlashCommandCatalog, resolveSlashCommandCatalogEntry } from './command-catalog';

// Builtin commands
export {
  BUILTIN_COMMANDS,
  getCliCommands,
  getExtensionCommands,
  getBuiltinCommand,
  isBuiltinCommand,
  getAllCommandNames,
} from './builtin-commands';

// Handlers
export {
  handleHelp,
  handleStatus,
  handleClear,
  handleExit,
  handleConfig,
  handleModel,
  handleSettings,
  handlePermissions,
  handleInit,
  handleNew,
  handleResume,
  handleCompact,
  handlePlan,
  handleSkills,
  handleCommands,
  handleTools,
  handleTasks,
  handleMcp,
  generateCliHelpText,
  generateExtensionHelpText,
  generateCliStatusText,
  generateExtensionStatusData,
} from './handlers';

// Executor
export {
  parseSlashCommand,
  isSlashCommand,
  executeBuiltinCommand,
  executeSlashCommand,
  getCommandHandler,
} from './command-executor';

export {
  buildExtensionCommandConversationSummaries,
  buildExtensionCommandHostEffectPlan,
  buildExtensionCommandResultPayload,
  buildExtensionSkillCommandResultPayload,
  normalizeSlashCommandName,
  parseBuiltinCommandArgs,
  shouldExecutePlanPromptAfterToggle,
  type BuildExtensionCommandHostEffectPlanInput,
  type BuildExtensionCommandResultPayloadInput,
  type BuildExtensionSkillCommandResultPayloadInput,
  type ExtensionCommandHostEffect,
  type ExtensionCommandHostEffectPlan,
  type ExtensionCommandConversationSummary,
  type ExtensionCommandConversationSummarySource,
  type ExtensionCommandResultPayload,
  type ExtensionSkillCommandResultStatus,
} from './extension-command-presenter';

export {
  buildExtensionSlashStatusPayload,
  runExtensionSlashCommandRuntime,
  type ExtensionSlashCommandContextManager,
  type ExtensionSlashCommandConversationSource,
  type ExtensionSlashCommandExecutionDispatch,
  type ExtensionSlashCommandPlanModeSource,
  type ExtensionSlashCommandRuntimeDeps,
  type ExtensionSlashCommandRuntimeEffects,
  type ExtensionSlashCommandRuntimeInput,
  type ExtensionSlashCommandRuntimeResult,
  type ExtensionSlashCommandSettingsSource,
  type ExtensionSlashCommandSkillSource,
} from './extension-slash-command-runtime';
