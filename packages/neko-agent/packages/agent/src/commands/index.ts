/**
 * Commands Module
 *
 * Unified builtin command system for agent-cli and extension.
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
