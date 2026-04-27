/**
 * @neko/agent - Agent Application Package
 *
 * This package provides the agent runtime for AI-powered task execution.
 * It can run standalone (without platform) or integrated with platform.
 *
 * Standalone mode:
 * - Uses built-in LLM client
 * - Full MCP support
 * - Skill system
 *
 * Integrated mode:
 * - Uses platform's LLM routing
 * - Media generation via platform
 * - Workflow execution via platform
 */

// Re-export shared types for convenience
export type {
  // Agent types
  AgentState,
  AgentConfig,
  AgentContext,
  AgentStep,
  AgentResult,
  AgentCheckpoint,
  IAgentExecutor,
  IAgentRuntime,
  // Hook types
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
  ThinkContext,
  // Skill types (from shared - Claude-compatible)
  Skill,
  SlashCommand,
  SkillMatch,
  SkillSource,
  SkillInjection,
  ISkillService,
  ISkillRegistry,
  ISkillMatcher,
  ISkillInjector,
  SkillFrontmatter,
  CommandFrontmatter,
  ParsedSkillFile,
  SkillLoadResult,
  SkillLoadError,
  ISkillFileSystem,
  SkillSummary,
  SkillValidationResult,
  // MCP types
  IMCPManager,
  IMCPClient,
  MCPServerConfig,
  MCPToolDefinition,
  MCPToolResult,
  MCPResource,
  MCPPrompt,
  // Tool types
  IToolRegistry,
  Tool,
  ToolResult,
  ToolCategory,
  ToolCallRequest,
  // Platform types (for integration)
  IPlatform,
  IService,
  ChatMessage,
  ServiceResponse,
  StreamChunk,
  ServiceOptions,
  ToolDefinition,
  LLMProviderConfig,
} from '@neko/shared';

export type {
  AgentRuntimeConfig,
  ArtifactWatcherFactory,
  ArtifactWatcherRuntimeConfig,
  IWorkflowRuntime,
  IArtifactStore,
  IArtifactService,
  AnyArtifactObservedInput,
  AnyArtifactRecord,
  ArtifactObservedInput,
  ArtifactBinding,
  ArtifactRecord,
  ArtifactServiceConfig,
  ArtifactServiceFsOps,
  ArtifactWriteInput,
  ICapabilityRuntime,
  IFeedbackLoop,
  IRuntimeJournalWriter,
  IRuntimeWorkspaceFsOps,
  NodeArtifactStoreConfig,
} from './runtime';
export {
  buildAgentSessionConfigWithRuntime,
  createAgentSessionWithRuntime,
  createNodeArtifactStore,
  createNodeRuntimeWorkspaceFsOps,
  createWorkspaceArtifactService,
  toIdcRunArtifactBinding,
  type AgentSessionRuntimeBootstrapConfig,
} from './runtime';

export {
  ExperimentRunner,
  applyAblationToggles,
  extractAblationMarker,
  MetricsHooks,
  buildComparison,
  formatComparisonMarkdown,
  BASELINE,
  NO_COMPRESSION,
  NO_CREATIVE_COMPRESSION,
  NO_SKILL_DISCOVERY,
  NO_SKILL_INJECTION,
  NO_DYNAMIC_TOOLSETS,
  NO_VALIDATION,
  NO_RETRY,
  NO_SETTINGS_HOOKS,
  NO_PROJECT_MEMORY,
  NO_JOURNAL_AS_SSOT,
  NO_COMPACT_LOGGING,
  NO_AUTO_MEMORY_EXTRACTION,
  NO_MEMORY_RECALL,
  NO_TRAITS,
  NO_THINKING,
  ALWAYS_ONLY_TOOLS,
  PLAN_PERMISSION_MODE,
  ASK_PERMISSION_MODE,
  SINGLE_ITERATION,
  NO_ALL_COMPRESSION,
  NO_ALL_SKILLS,
  NO_ALL_EXTERNAL,
  MINIMAL,
  createStandardAblationSuite,
  createGroupAblationSuite,
  createParameterAblationSuite,
} from './experiment';
export type {
  AblationToggles,
  AblationMarkerHook,
  EvaluationResult,
  ExperimentEvaluator,
  ExperimentIsolationMode,
  ExperimentConfig,
  ExperimentOutputFile,
  ExperimentOutputWriter,
  ExperimentRunDescriptor,
  ExperimentRunIsolation,
  ExperimentVariant,
  IExperimentSession,
  ISessionFactory,
  TokenMetrics,
  ToolCallMetric,
  TurnMetrics,
  ExperimentMetrics,
  VariantRunResult,
  VariantResult,
  ExperimentResult,
  ComparisonEntry,
  ExperimentProgressEvent,
} from './experiment';

export {
  composeBeforeThinkHooks,
  createFeedbackCoordinator,
  type FeedbackCoordinatorConfig,
  type FeedbackCycle,
  type FeedbackDecision,
  type FeedbackEvaluationContext,
  type FeedbackSignal,
  type IFeedbackEvaluator,
  type FeedbackMemoryExtractionInput,
  type FeedbackMemoryExtractionOutcome,
  type FeedbackMemoryExtractionResult,
  type FeedbackMemoryExtractionSkipped,
  createQualityReviewEvidence,
  type IFeedbackCoordinator,
  type QualityReviewEvidenceInput,
  type QualityReviewEvidenceResult,
  type QualityReviewEvidenceSummary,
  type QualityReviewEvaluationSummary,
  type QualityReviewFeedbackPayload,
} from './feedback';

export {
  parseProviderCardMarkdown,
  ProviderCardRegistry,
  createProviderCardRegistry,
  ProviderRouter,
  createProviderRouter,
  loadProviderCardDirectory,
  registerProviderCardDirectory,
  type ParseProviderCardOptions,
  type LoadProviderCardDirectoryOptions,
  type RegisterProviderCardDirectoryOptions,
  type ProviderCardLoaderFs,
  type ProviderCardDirent,
  type ProviderCardLoadError,
  createProviderExpressionPromptFragments,
  type ProviderExpressionContextOptions,
} from './provider';

export {
  PERCEPTION_AUDIO_TRANSCRIBE_METADATA,
  PERCEPTION_IMAGE_SIMILARITY_METADATA,
  PERCEPTION_IMAGE_CLASSIFY_METADATA,
  PERCEPTION_DESCRIBE_INPUT_METADATA,
  PERCEPTION_VIDEO_DETECT_SHOTS_METADATA,
  PerceptionAudioTranscribeTool,
  PerceptionImageSimilarityTool,
  PerceptionImageClassifyTool,
  PerceptionDescribeInputTool,
  PerceptionVideoDetectShotsTool,
  createPerceptionTools,
  perceptionToolGroup,
  type PerceptionAudioTranscribeToolConfig,
  type PerceptionImageSimilarityToolConfig,
  type PerceptionImageClassifyToolConfig,
  type PerceptionToolMetadata,
  type PerceptionToolResult,
  type PerceptionClassifyClient,
  type PerceptionDetectShotsClient,
  type PerceptionSimilarityClient,
  type PerceptionTranscribeClient,
} from './tools';

export {
  ControlPlane,
  FeedbackStageController,
  StageRegistry,
  createControlPlane,
  createStageRegistry,
  type ControlPlaneConfig,
  type ControlPlaneDecision,
  type ControlPlaneDecisionInput,
  type IControlPlane,
  type IStageController,
  type IStageRegistry,
  type StageControllerContext,
  type StageDescriptor,
  type StageRiskLevel,
  type StageTransitionGuidance,
} from './control-plane';

// Export plan parsing
export { parsePlanMarkdown, type Plan, type PlanStep } from './plan';

// Export logger
export { setRootLogger, getLogger as getAgentLogger } from './utils/logger';

// Export errors
export { AgentError, type AgentErrorCategory, type AgentErrorInfo } from './errors';

// Export executor
export { AgentExecutor, createAgentExecutor, type AgentExecutorOptions } from './executor';

// Export hooks
export {
  RetryHooks,
  MemoryHooks,
  composeHooks,
  createRetryHooks,
  createMemoryHooks,
  type RetryHooksOptions,
  type MemoryHooksOptions,
} from './hooks';

// Export memory
export {
  FileProjectMemoryManager,
  createFileProjectMemoryManager,
  KeyFactExtractor,
  MemoryRecall,
} from './memory';
export type { KeyFactExtractorOptions, MemoryRecallOptions, RecalledMemory } from './memory';

// Export MCP
export {
  StdioMCPClient,
  HttpMCPClient,
  createMCPClient,
  MCPManager,
  MCPTool,
  createMCPTools,
  createAllMCPTools,
  MCPTestService,
  getMCPTestService,
  type MCPTestConfig,
  type MCPTestResult,
} from './mcp';

// Export validation
export {
  // Types
  type ImageConstraints,
  type OutputConstraints,
  type ValidationHooksOptions,
  type ValidationError,
  type ValidationWarning,
  type ValidationResult,
  type ValidationErrorType,
  type ImageInfo,
  type MermaidValidationResult,
  type MermaidBlockInfo,
  type MermaidBlockValidationResult,
  type JsonBlockInfo,
  type JsonBlockValidationResult,
  type ValidationResultWithBlocks,
  // Constants
  DEFAULT_IMAGE_CONSTRAINTS,
  DEFAULT_OUTPUT_CONSTRAINTS,
  // Image Validator
  ImageValidator,
  ImageValidationError,
  createImageValidator,
  // Output Validator
  OutputValidator,
  createOutputValidator,
  // Validation Hooks
  ValidationHooks,
  createValidationHooks,
  // Extractors
  MermaidExtractor,
  JsonExtractor,
  createMermaidExtractor,
  createJsonExtractor,
  // Validators
  MermaidValidator,
  JsonSchemaValidator,
  LengthValidator,
  createMermaidValidator,
  createJsonSchemaValidator,
  createLengthValidator,
  // Checkers
  MermaidBlockChecker,
  createMermaidBlockChecker,
} from './validation';

// Export permission
export {
  // Types
  type PermissionMode,
  type PermissionDecision,
  type PermissionRules,
  type PermissionConfig,
  type PermissionCheckResult,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
  type ConfirmToolCallback,
  type PlanFileResult,
  type PermissionHooksOptions,
  // Constants
  DEFAULT_READ_ONLY_TOOLS,
  READ_ONLY_MCP_PREFIXES,
  DEFAULT_PERMISSION_CONFIG,
  PLAN_MODE_SYSTEM_REMINDER,
  PLAN_FILE_PATH,
  // Rule Matcher
  PermissionRuleMatcher,
  createPermissionRuleMatcher,
  normalizeToolCall,
  matchesPattern,
  isInPatternList,
  isReadOnlyTool,
  isPlanFileWrite,
  // Permission Hooks
  PermissionHooks,
  createPermissionHooks,
  // Creative Permission
  CREATIVE_PLAN_TOOLS,
  ToolTraitsRegistry,
  DEFAULT_CREATIVE_TOOL_TRAITS,
} from './permission';

// Export skill
export {
  // Core classes
  SkillRegistry,
  SkillLoader,
  createNodeSkillLoader,
  SkillInjector,
  SkillMatcher,
  KeywordSkillMatcher,
  createCommandBackedSkill,
  createLazyCommandBackedSkill,
  ToolGuard,
  NoOpToolGuard,
  createToolGuard,
  // Skill Service
  SkillService,
  createSkillService,
  // Activation-time subpackage guard (ADR §5.2.10)
  assertSubpackagesAvailable,
  SkillActivationError,
  type ISubpackageResolver,
  type SubpackageInfo,
  type SkillActivationIssue,
  type SkillActivationIssueCode,
  // Builtins
  registerBuiltins,
  builtinSkills,
  builtinToolGroups,
  registerBuiltinToolGroups,
  // ToolGroup Registry
  ToolGroupRegistry,
  createToolGroupRegistry,
  // Skill Conflict Resolver
  SkillConflictResolver,
  createSkillConflictResolver,
  // Path Matcher
  matchSkillPaths,
  globMatch,
  type SkillPathInfo,
  // Markdown Parser
  MarkdownParser,
  createMarkdownParser,
  // Types
  type IToolGuard,
  type ToolCallInput,
  type ToolGuardResult,
  type SkillDiscoveryResult,
  type SkillApplicationResult,
  type ConfirmSkillCallback as ConfirmSkillCallbackFn,
  type SkillServiceConfig,
  type LazySkill,
  type LazyCommand,
  type LazySkillLoadResult,
  type IMarkdownParser,
  type YamlValue,
} from './skill';

// Re-export skill utility functions from shared
export {
  toSkillSummary,
  validateSkill,
  createSkill,
  toCommandSummary,
  validateCommand,
  createCommand,
  parseAllowedTools,
  isToolAllowed,
  extractSupportFileRefs,
  SKILL_DIRECTORIES,
  COMMAND_DIRECTORIES,
} from '@neko/shared';

// Export tools
export {
  BuiltinTool,
  createTool,
  ToolRegistry,
  createToolRegistry,
  ToolCategoryRegistry,
  createToolCategoryRegistry,
  ToolInjectionManager,
  createToolInjectionManager,
  // Core meta tools
  ActivateSkillTool,
  DeactivateSkillTool,
  GetContextTool,
  createCoreMetaTools,
  type ISkillProvider,
  // Core file/system tools
  ReadTool,
  WriteTool,
  BashTool,
  type BashToolOptions,
  ListDirectoryTool,
  GrepTool,
  type GrepToolOptions,
  MemoryWriteTool,
  createCoreTools,
  type CoreToolsOptions,
  // Injection constants
  DEFAULT_INJECTION_CONFIG,
  CORE_TOOLS,
} from './tools';

// Export context management
export {
  LayeredContextManager,
  createLayeredContextManager,
  ConversationCompressor,
  createConversationCompressor,
  ContextPersistenceManager,
  InMemoryContextStorage,
  createContextPersistenceManager,
  LLMSummarizer,
  createLLMSummarizer,
  DEFAULT_SUMMARIZER_CONFIG,
  type LLMSummarizerConfig,
} from './context';

// Export hook-loader
export {
  HookLoader,
  createHookLoader,
  HOOK_DIRECTORIES,
  DEFAULT_HOOK_METADATA,
  type HookSource,
  type HookMetadata,
  type LoadedHook,
  type HookLoadResult,
  type HookLoadError,
  type IHookFileSystem,
  type IHookCompiler,
  type HookLoaderOptions,
  type CompileResult,
  type HookModuleExports,
} from './hook-loader';

// Export subagent
export {
  // Types
  type SubAgentRunMode,
  type SubAgentStatus,
  type SpecializedAgentType,
  type ModelTier,
  type SubAgentConfig,
  type SpecializedAgentPreset,
  type SubAgentResult,
  type SubAgentEventType,
  type SubAgentEvent,
  type SubAgentEventListener,
  type SubAgentManagerDeps,
  type SubAgentExecutor,
  type ISubAgentManager,
  type TaskToolArgs,
  type TaskOutputToolArgs,
  type ContextExtractionOptions,
  type IContextBridge,
  type SubAgentSystemOptions,
  type SubAgentSystem,
  // Manager
  SubAgentManager,
  SPECIALIZED_PRESETS,
  // Context Bridge
  ContextBridge,
  createContextBridge,
  estimateTokens,
  createContextSummaryForSubAgent,
  // Tools
  createTaskTool,
  createTaskOutputTool,
  registerSubAgentTools,
  // Factory
  createSubAgentSystem,
} from './subagent';

// Export prompt management
export {
  PromptManager,
  createPromptManager,
  // System Prompt Builder
  SystemPromptBuilder,
  createSystemPromptBuilder,
  getDefaultPersonalPath,
  hasAgentsFile,
  BUILTIN_PROMPTS,
  BUILTIN_DEFAULT_PROMPT_EN,
  BUILTIN_DEFAULT_PROMPT_ZH,
  BUILTIN_PLAN_PROMPT_EN,
  BUILTIN_PLAN_PROMPT_ZH,
  type ISystemPromptBuilder,
  type SystemPromptBuilderConfig,
  type PromptMode,
  type PromptLocale,
  type AgentsSource,
  type AgentsLoadResult,
  type BuiltinPromptKey,
  // Re-exported types from shared
  type Prompt,
  type PromptVariable,
  type PromptCategory,
  type RenderedPrompt,
  type IPromptManager,
} from './prompt';

// Export session management
export {
  AgentSession,
  createAgentSession,
  createSkillRunKind,
  /** @deprecated Use `createSkillRunKind` instead. */
  createSkillWorkflowId,
  createPlanModeIdcMetadata,
  createSkillExecutionIdcMetadata,
  mergeIdcExecutionMetadata,
  encodeRunKindSegment,
  /** @deprecated Use `encodeRunKindSegment` instead. */
  encodeWorkflowIdSegment,
  PLAN_MODE_SYSTEM_REMINDER as SESSION_PLAN_MODE_REMINDER,
  type IAgentSession,
  type AgentSessionConfig,
  type AgentEvent,
  type AgentEventType,
  type ExecutionMode,
  type ExecutionContext,
  type CompressionResult,
  // Re-exported from permission
  type ToolConfirmationRequest as SessionToolConfirmationRequest,
  // Re-exported from validation
  type ValidationError as SessionValidationError,
  type ValidationWarning as SessionValidationWarning,
} from './session';

// Export task management
export {
  TaskManager,
  createTaskManagerIdcTaskProjection,
  MemoryTaskStorage,
  FileTaskStorage,
  createFileTaskStorage,
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
  type TaskManagerOptions,
  type ConcurrencyConfig,
  type IIdcProjectedTaskStore,
  type IRuntimeTaskManager,
  type FileTaskStorageOptions,
  type FileTaskRecoveryStorageOptions,
  type IIdcTaskProjection,
  type IIdcTaskProjectionStore,
  type IdcTaskProjectionConfig,
  type IdcProjectedTaskArtifactBinding,
  type IdcProjectedTaskBinding,
  type IdcProjectedTaskPayload,
  type IdcProjectedTaskUpsertInput,
  getIdcProjectedTaskRunId,
  isIdcProjectedTaskPayload,
  toSerializableIdcProjectedTask,
  toIdcProjectedTaskPayload,
  // Re-exported types from shared
  type Task,
  type TaskType,
  type TaskStatus,
  type TaskInput,
  type TaskOutput,
  type TaskProgressCallback,
  type ITaskManager,
  type ITaskStorage,
  type ITaskRecoveryStorage,
  type TaskRecoveryInfo,
  type SerializableTask,
  type TaskExecutor,
} from './task';

// Export commands (builtin slash commands)
export {
  // Types
  type BuiltinCommandName,
  type BuiltinCommand,
  type CommandCategory,
  type CommandContext,
  type CommandResult,
  type CommandAction,
  type CommandHandler,
  type CommandHandlerRegistration,
  type SlashCommandSurface,
  type SlashCommandSkillLike,
  type SlashCommandCatalogEntry,
  // Constants
  COMMAND_ALIASES,
  BUILTIN_COMMANDS,
  // Functions
  resolveCommandName,
  listSlashCommandCatalog,
  resolveSlashCommandCatalogEntry,
  getCliCommands,
  getExtensionCommands,
  getBuiltinCommand,
  isBuiltinCommand,
  getAllCommandNames,
  // Handlers
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
  // Utilities
  generateCliHelpText,
  generateExtensionHelpText,
  generateCliStatusText,
  generateExtensionStatusData,
  // Executor
  parseSlashCommand,
  isSlashCommand,
  executeBuiltinCommand,
  executeSlashCommand,
  getCommandHandler,
} from './commands';

// Export input processing
export {
  InputProcessor,
  createInputProcessor,
  NodeFileReader,
  createNodeFileReader,
  VSCodeFileReader,
  createVSCodeFileReader,
  type VSCodeWorkspaceAPI,
  type FileReference,
  type ProcessedInput,
  type InputProcessorOptions,
  type IFileReader,
  type IInputProcessor,
} from './input';

// Export conversation persistence (shared resume layer)
export type {
  ConversationRecord,
  ConversationIndex,
  ConversationIndexMeta,
  ConversationsIndexFile,
  ConversationSource,
  ConversationMediaModelSelection,
} from './session/conversation-record';
export {
  createConversationId,
  createLegacyConversationMigrationId,
  getConversationWorkDirHash,
  isCanonicalConversationId,
  isLegacyConversationId,
  parseConversationId,
} from './session/conversation-id';
export type { ConversationIdOptions, ParsedConversationId } from './session/conversation-id';
export {
  ConversationIndexStore,
  type IConversationIndexStore,
  type ConversationIndexStoreFsOps,
  type ConversationIndexStoreOptions,
} from './session/conversation-index-store';
export {
  discoverLegacyConversationWorkDirs,
  migrateLegacyConversationIndex,
  type ConversationIndexMigrationFsOps,
  type ConversationIndexMigrationOptions,
  type ConversationIndexMigrationResult,
} from './session/conversation-index-migration';
export {
  FileConversationStorage,
  createFileConversationStorage,
} from './session/file-conversation-storage';
export {
  JournalProjection,
  JournalStorage,
  createJournalStorage,
  createNodeJournalStorage,
  createJournalEntryId,
  projectEntriesToHistory,
} from './session';
export type {
  JournalEntry,
  JournalFsOps,
  JournalWriterOptions,
  StateSnapshot,
  SubAgentRef,
  ResumedSessionState,
  JournalReaderFsOps,
  JournalReaderOptions,
  JournalStorageFsOps,
  IJournalProjection,
  JournalProjectionOptions,
  ConversationSummary,
} from './session';
