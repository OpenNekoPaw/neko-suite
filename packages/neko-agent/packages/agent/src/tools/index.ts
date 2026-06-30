/**
 * Tools Module - Tool base classes, registry, and injection management
 *
 * This module provides:
 * - BuiltinTool: Base class for implementing tools
 * - ToolRegistry: Registry for managing and executing tools
 * - ToolCategoryRegistry: Registry for tool categorization and layer management
 * - ToolInjectionManager: Three-layer tool injection mechanism
 * - createTool: Factory function for creating simple tools
 *
 * Note: Platform-specific tools (generation, analysis, document) remain in @neko/platform.
 * This module only contains core infrastructure that agent can use standalone.
 */

// Base class and factory - import from shared
export { BuiltinTool, createTool } from '@neko/shared';

// Registry
export { ToolRegistry, createToolRegistry } from './tool-registry';

// Category registry
export { ToolCategoryRegistry, createToolCategoryRegistry } from './tool-category-registry';

// Injection manager
export { ToolInjectionManager, createToolInjectionManager } from './tool-injection-manager';

// Core meta tools
export {
  ActivateSkillTool,
  DeactivateSkillTool,
  GetContextTool,
  createCoreMetaTools,
  type ISkillProvider,
  type SkillProviderFactory,
  type SkillProviderMaybePromise,
  DEFAULT_PLUGIN_SKILL_PROVIDER_EXTENSION_IDS,
  createPluginSkillDiscoveryTools,
  type PluginSkillCatalogue,
  type PluginSkillCatalogueEntry,
  type PluginSkillCatalogueSource,
  type PluginSkillDiscoveryLogger,
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
  authorizePathInsideRoots,
  isForbiddenUnmanagedPath,
  isPathInsideRoot,
  normalizeAccessRoots,
  type RootPathAccessDecision,
  createNoWorkspaceFileAccessPolicy,
  createWorkspaceFileAccessPolicy,
  type CoreFileAccessDecision,
  type CoreFileAccessDenialReason,
  type CoreFileAccessPolicy,
  type FileAccessKind,
  type WorkspaceFileAccessPolicyOptions,
  type WorkspaceFileIgnoreRules,
  // Draft/Plan/Task review documents are persisted by the host artifact service.
} from './core';

// Perception evidence tools
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
  type PerceptionVideoDetectShotsToolConfig,
  type PerceptionImageSimilarityToolConfig,
  type PerceptionImageClassifyToolConfig,
  type PerceptionClassifyClient,
  type PerceptionDetectShotsClient,
  type PerceptionSimilarityClient,
  type PerceptionTranscribeClient,
} from './perception';

// Re-export types and constants from shared for convenience
export type {
  Tool,
  ToolCategory,
  ToolResult,
  ToolCallRequest,
  ToolExecutionConfig,
  IToolRegistry,
  // Category types
  ToolInjectionLayer,
  ToolCategoryInfo,
  CategorizedTool,
  IToolCategoryRegistry,
  // Injection types
  ToolInjectionConfig,
  ToolInjectionState,
  LayerTokenUsage,
  IToolInjectionManager,
  InjectionEvent,
  PerceptionToolMetadata,
  PerceptionToolResult,
  InjectionEventListener,
} from '@neko/shared';

// Pattern matching utilities (shared by permission and skill modules)
export {
  normalizeToolCall,
  matchesPattern,
  isInPatternList,
  type ToolCallLike,
} from './tool-pattern-matcher';

// Tier resolver (tiered lazy loading)
export { resolveToolGroupTier, resolveSkillTier } from './tier-resolver';

// Creative tool runtimes
export {
  createPuppetFaceTools,
  type PuppetFaceToolsDeps,
  type PuppetFaceToolsLogger,
} from './puppet-face-tools';
export {
  PuppetFaceRuntime,
  buildPuppetFaceParameterSchemaPrompt,
  createPuppetFaceRuntime,
  detectPuppetFaceImageMimeType,
  diffPuppetFaceParams,
  parsePuppetFaceJsonResponse,
  validateAndClampPuppetFaceParams,
  type PuppetFaceAdjustInput,
  type PuppetFaceAdjustResult,
  type PuppetFaceAdjustSuccess,
  type PuppetFaceErrorResult,
  type PuppetFaceGenerateInput,
  type PuppetFaceGenerateResult,
  type PuppetFaceGenerateSuccess,
  type PuppetFaceImageInput,
  type PuppetFaceImageResult,
  type PuppetFaceImageSuccess,
  type PuppetFaceParamChanges,
  type PuppetFaceParams,
  type PuppetFaceRuntimeDeps,
} from './puppet-face-runtime';
export {
  ScriptEmbeddingIndex,
  buildScriptSceneTextInputs,
  keywordSearchScriptScenes,
  normalizeScriptSceneTopK,
  searchScriptScenes,
  tokenizeScriptSceneQuery,
  type EmbedFn,
  type SceneEmbedding,
  type SceneTextInput,
  type ScriptSceneSearchInput,
  type ScriptSceneSearchResult,
  type ScriptSceneSpan,
  type SearchResult,
} from './script-scene-search-runtime';

// Re-export injection constants
export { DEFAULT_INJECTION_CONFIG, CORE_TOOLS } from '@neko/shared';
