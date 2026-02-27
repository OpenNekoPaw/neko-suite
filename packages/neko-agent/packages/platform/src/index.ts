/**
 * Neko Suite Platform - AI Service Platform
 *
 * A unified AI service layer providing:
 * - Multi-provider support (OpenAI, Anthropic, Google, Azure, Ollama)
 * - Configuration management with three-tier priority
 * - Model groups with routing strategies
 * - ReAct pattern agent execution
 * - Tool integration and memory management
 */

// =============================================================================
// Types - Re-export from types module
// =============================================================================

export * from './types';

// =============================================================================
// Core Layer - Shared abstractions
// =============================================================================

export {
  // Base Registry
  BaseRegistry,
  type IRegistry,
  // Selection Strategies
  type SelectionContext,
  type ISelectionStrategy,
  PrioritySelectionStrategy,
  RoundRobinSelectionStrategy,
  WeightedSelectionStrategy,
  CostOptimalSelectionStrategy,
  QualityOptimalSelectionStrategy,
  LatencyOptimalSelectionStrategy,
  CapabilityMatchSelectionStrategy,
  SelectionStrategyFactory,
  // Router
  type IRouter,
  type RoutingCandidate,
  type IRoutingStrategy,
  type ErrorCategory,
  type FallbackConfig,
  BaseRoutingManager,
  createCandidate,
  addScore,
  // Health Monitor
  type HealthStatus,
  type HealthChecker,
  type HealthMonitorConfig,
  HealthMonitor,
  createHttpHealthChecker,
  // Concurrency Control
  type ConcurrencyPoolOptions,
  type PoolStats,
  ConcurrencyPool,
  KeyedConcurrencyPool,
  withConcurrencyLimit,
  // Circuit Breaker
  type CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerStats,
  CircuitBreaker,
  CircuitOpenError,
  KeyedCircuitBreaker,
  // Rate Limiter
  type RateLimiterOptions,
  type RateLimiterStats,
  type RateLimitResult,
  RateLimiter,
  RateLimitError,
  KeyedRateLimiter,
  AdaptiveRateLimiter,
} from './core';

// =============================================================================
// LLM Routing Layer
// =============================================================================

export {
  // LLM Routing Manager
  LLMRoutingManager,
  // LLM Routing Types
  type LLMRoutingContext,
  type LLMRoutingPreference,
  type LLMRoutingCandidate,
  type LLMRoutingResult,
  type LLMRoutingStrategy,
  // LLM Routing Strategies
  LLMUserPreferenceStrategy,
  LLMHealthFilterStrategy,
  LLMCapabilityFilterStrategy,
  LLMContextWindowStrategy,
  LLMCostOptimizationStrategy,
  LLMLoadBalancingStrategy,
} from './llm';

// =============================================================================
// Configuration Layer
// =============================================================================

export {
  loadBuiltinPresets,
  getBuiltinProviderTemplates,
  getBuiltinProviderTemplate,
  getBuiltinPrompt,
  type BuiltinPresets,
} from './config/builtin-presets';

export {
  UserConfigManager,
  type UserConfig,
  type UserConfigStorage,
} from './config/user-config';

export {
  loadWorkspaceConfig,
  watchWorkspaceConfig,
  type WorkspaceConfig,
} from './config/workspace-config';

export {
  ConfigManager,
  type MergedConfig,
  type ConfigChangeEvent,
  type ConfigChangeListener,
  type ConfigManagerOptions,
} from './config/config-manager';
export {
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config/config-export-service';

// =============================================================================
// Adapter Layer
// =============================================================================

export { BaseAdapter } from './llm/adapter/base-adapter';
export { OpenAIAdapter } from './llm/adapter/openai-adapter';
export { AnthropicAdapter } from './llm/adapter/anthropic-adapter';
export { GoogleAdapter } from './llm/adapter/google-adapter';
export { AzureAdapter } from './llm/adapter/azure-adapter';
export { OllamaAdapter } from './llm/adapter/ollama-adapter';
export { GenericAdapter } from './llm/adapter/generic-adapter';
export {
  getAdapterRegistry,
  AdapterRegistry,
} from './llm/adapter/adapter-registry';
export { createStreamCollector } from './llm/adapter/stream-aggregator';

// =============================================================================
// Provider Layer
// =============================================================================

export {
  ProviderRegistry,
  type ProviderRegistryOptions,
  type ExtendedProviderStatus,
} from './provider/provider-registry';
export { GroupManager } from './provider/group-manager';
export { PlatformError } from './provider/platform-error';
export {
  executeWithRetry,
  withStreamTimeout,
  type RetryExecutorOptions,
} from './provider/retry-executor';

// =============================================================================
// Service Layer
// =============================================================================

export { Service, type ServiceConfig } from './service/service';
export { SharedServiceAdapter, toSharedService } from './service/shared-service-adapter';
export { ToolRegistry } from './service/tool-registry';

// PromptManager - local implementation
export {
  PromptManager,
  createPromptManager,
} from './service/prompt-manager';

// Task types - re-exported from shared (TaskManager implementation is in @neko/agent)
export type {
  Task,
  TaskType,
  TaskStatus,
  TaskInput,
  TaskOutput,
  TaskProgressCallback,
  ITaskManager,
  ITaskStorage,
  ITaskRecoveryStorage,
  TaskRecoveryInfo,
  SerializableTask,
  TaskExecutor,
} from '@neko/shared';

// Task storage implementations (still available in platform)
export {
  MemoryTaskStorage,
  MemoryTaskRecoveryStorage,
  FileTaskRecoveryStorage,
  createFileRecoveryStorage,
  type FileTaskRecoveryStorageOptions,
} from './task';

// =============================================================================
// Tools Layer
// =============================================================================

export {
  BuiltinTool,
  registerBuiltinTools,
} from './tools';
export {
  BaseProjectContextAdapter,
  MockProjectContextAdapter,
  createContextSummary,
} from './tools';
// AI Generation Tools
export {
  GenerateImageTool,
  GenerateVideoTool,
  GenerateTTSTool,
  GenerateMusicTool,
  GenerateCharacterTool,
  TransferStyleTool,
  EnhanceVideoTool,
  OptimizeAudioTool,
  registerGenerationTools,
  type AIGenerationService,
  type ImageGenerationOptions,
  type VideoGenerationOptions,
  type TTSOptions,
  type MusicGenerationOptions,
  type CharacterGenerationOptions,
  type StyleTransferOptions,
  type VideoEnhanceOptions,
  type AudioOptimizeOptions,
  type GeneratedMedia,
} from './tools';
// Media Service Adapter
export {
  MediaServiceAdapter,
  createMediaServiceAdapter,
  type MediaServiceAdapterOptions,
} from './tools';
// AI Analysis Tools
export {
  AnalyzeImageTool,
  ExtractImageTextTool,
  AnalyzeVideoTool,
  ExtractVideoSummaryTool,
  registerAnalysisTools,
  type VisionAnalysisService,
  type ImageAnalysisOptions,
  type VideoAnalysisOptions,
  type AnalysisResult,
  type VideoAnalysisResult,
  type TextExtractionResult,
} from './tools';
// Document Tools
export {
  GenerateScriptTool,
  OptimizeScriptTool,
  GenerateStoryboardTool,
  GenerateSubtitlesTool,
  registerDocumentTools,
  type DocumentGenerationService,
  type ScriptGenerationOptions,
  type ScriptResult,
  type StoryboardOptions,
  type StoryboardResult,
  type SubtitleOptions,
  type SubtitleResult,
} from './tools';

// =============================================================================
// Media Layer
// =============================================================================

export {
  // Media Management
  MediaManager,
  createHttpDownloader,
  MediaCache,
  InMemoryCacheStorage,
  ThumbnailGenerator,
  MockFrameExtractor,
  MockImageProcessor,
  ImportMediaTool,
  GetMediaTool,
  ListMediaTool,
  DeleteMediaTool,
  GetThumbnailTool,
  GetMetadataTool,
  createMediaTools,
  // Media Generation - Adapters
  BaseMediaAdapter,
  MediaAdapterRegistry,
  getMediaAdapterRegistry,
  createMediaAdapterRegistry,
  OpenAICompatMediaAdapter,
  RunwayMediaAdapter,
  LumaMediaAdapter,
  MiniMaxMediaAdapter,
  LiblibMediaAdapter,
  SunoMediaAdapter,
  // Media Generation - Routing
  MediaRoutingManager,
  UserPreferenceStrategy,
  HealthFilterStrategy,
  CapabilityFilterStrategy,
  LoadBalancingStrategy,
  CostOptimizationStrategy,
  LatencyOptimizationStrategy,
  // Media Generation - Executor & Service
  MediaTaskExecutor,
  createMediaTaskInput,
  MediaGenerationService,
  createMediaPlatform,
  // Types
  type MediaManagerConfig,
  type HttpDownloaderOptions,
  type DownloadResult,
  type CacheEntry,
  type CacheStorage,
  type ThumbnailResult,
  type ThumbnailGeneratorConfig,
  type FrameExtractor,
  type ImageProcessor,
  type MediaGenerationType,
  type MediaTaskStatus,
  type MediaOutputType,
  type MediaGenerationRequestBase,
  type RoutingPreference,
  type ImageGenerationRequest,
  type VideoGenerationRequest,
  type AudioGenerationRequest,
  type MediaOutput,
  type MediaAdapterResult,
  type MediaAdapterError,
  type MediaAdapter,
  type MediaRoutingResult,
  type MediaRoutingStrategy,
  type MediaRoutingCandidate,
  type MediaRoutingContext,
  type MediaTask,
  type MediaProgressCallback,
  type MediaTaskPayload,
  type MediaTaskExecutorOptions,
  type MediaGenerationServiceOptions,
  type MediaPlatformDeps,
  type MediaPlatform,
} from './media';

// =============================================================================
// Factory Functions
// =============================================================================

import { loadBuiltinPresets } from './config/builtin-presets';
import { UserConfigManager, type UserConfigStorage } from './config/user-config';
import { loadWorkspaceConfig, watchWorkspaceConfig } from './config/workspace-config';
import { ConfigManager, type ConfigManagerOptions } from './config/config-manager';
import { ProviderRegistry } from './provider/provider-registry';
import { GroupManager } from './provider/group-manager';
import { Service } from './service/service';
import { ToolRegistry } from './service/tool-registry';
// TaskManager is now in @neko/agent, but we need it for createPlatform
// Import from agent package (optional peer dependency)
import type { ITaskManager, ITaskStorage } from '@neko/shared';
import { PromptManager } from './service/prompt-manager';
// Media Generation imports
import { MediaGenerationService } from './media/media-generation-service';
import { createMediaPlatform } from './media';
// LLM Routing imports
import { LLMRoutingManager } from './llm/routing/llm-routing-manager';

/**
 * Platform initialization options
 */
export interface PlatformOptions {
  /** User config storage (VS Code globalState) */
  userConfigStorage?: UserConfigStorage;
  /** Workspace path for .neko/config.json */
  workspacePath?: string;
  /** Default group ID for routing */
  defaultGroupId?: string;
  /** Locale for i18n (e.g., 'en', 'zh-cn') */
  locale?: string;
  /**
   * Task manager instance for media generation
   * NOTE: TaskManager implementation is now in @neko/agent package.
   * Pass an instance from agent package for full functionality.
   */
  taskManager?: ITaskManager & {
    initialize?(): Promise<void>;
    dispose?(): void;
    registerExecutor?(type: string, executor: unknown): void;
    saveRecoveryInfo?(taskId: string, externalTaskId: string, providerId: string): Promise<void>;
    deleteRecoveryInfo?(taskId: string): Promise<void>;
    getRecoveryStorage?(): unknown;
    updateOutputData?(id: string, outputData: Record<string, unknown>): Promise<boolean>;
    delete?(id: string): Promise<boolean>;
  };
}

/**
 * Platform instance with all components
 */
export interface Platform {
  /** Configuration manager */
  config: ConfigManager;
  /** Provider registry */
  providers: ProviderRegistry;
  /** Group manager */
  groups: GroupManager;
  /** LLM routing manager for intelligent provider selection */
  llmRouter: LLMRoutingManager;
  /** Tool registry */
  tools: ToolRegistry;
  /** Prompt manager */
  prompts: PromptManager;
  /** Media generation service */
  media: MediaGenerationService;
  /** Create a service instance */
  createService: (defaultGroupId?: string) => Service;
  /** Dispose resources */
  dispose: () => void;
}

/**
 * Create a fully configured platform instance
 */
export function createPlatform(options: PlatformOptions = {}): Platform {
  // Initialize configuration manager with locale support
  const configOptions: ConfigManagerOptions = {
    userConfigStorage: options.userConfigStorage,
    workspacePath: options.workspacePath,
    locale: options.locale,
  };
  const configManager = new ConfigManager(configOptions);

  // Initialize provider registry
  const providerRegistry = new ProviderRegistry(configManager);

  // Initialize group manager
  const groupManager = new GroupManager(configManager, providerRegistry);

  // Initialize LLM routing manager for intelligent provider selection
  const llmRoutingManager = new LLMRoutingManager(providerRegistry, configManager);

  // Initialize tool registry
  const toolRegistry = new ToolRegistry();

  // Initialize prompt manager
  const promptManager = new PromptManager();

  // ==========================================================================
  // Initialize Media Generation Service
  // ==========================================================================
  // Use provided TaskManager or throw if not provided
  const mediaTaskManager = options.taskManager;
  if (!mediaTaskManager) {
    throw new Error(
      '[Platform] taskManager is required. ' +
      'Provide an ITaskManager implementation (from @neko/shared) via options.taskManager.'
    );
  }

  // Initialize task manager to load persisted tasks (fire and forget)
  if (mediaTaskManager.initialize) {
    mediaTaskManager.initialize().catch((err) => {
      console.error('[Platform] Failed to initialize task manager:', err);
    });
  }

  // Initialize media platform with all components
  const mediaPlatform = createMediaPlatform({
    configManager,
    providerRegistry,
    taskManager: mediaTaskManager,
  });

  // Use the service from mediaPlatform
  const mediaGenerationService = mediaPlatform.service;

  // Factory functions
  const createService = (defaultGroupId?: string): Service => {
    return new Service({
      configManager,
      providerRegistry,
      groupManager,
      defaultGroupId: defaultGroupId || options.defaultGroupId,
      mediaGenerationService,
    });
  };

  const dispose = (): void => {
    if (mediaTaskManager.dispose) {
      mediaTaskManager.dispose();
    }
    providerRegistry.dispose();
    configManager.dispose();
  };

  return {
    config: configManager,
    providers: providerRegistry,
    groups: groupManager,
    llmRouter: llmRoutingManager,
    tools: toolRegistry,
    prompts: promptManager,
    media: mediaGenerationService,
    createService,
    dispose,
  };
}
