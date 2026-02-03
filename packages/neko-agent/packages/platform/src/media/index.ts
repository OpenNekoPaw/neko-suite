/**
 * Media Module - Media management and AI generation
 */

// =============================================================================
// Media Management (existing)
// =============================================================================

export {
  MediaManager,
  type MediaManagerConfig,
  type MediaDownloader,
  type ThumbnailGenerator as ThumbnailGeneratorFn,
  type MetadataExtractor,
  type MediaFileSystem,
} from './media-manager';

export {
  createHttpDownloader,
  MediaCache,
  InMemoryCacheStorage,
  type HttpDownloaderOptions,
  type DownloadResult,
  type CacheEntry,
  type CacheStorage,
} from './media-cache';

export {
  ThumbnailGenerator,
  MockFrameExtractor,
  MockImageProcessor,
  type ThumbnailResult,
  type ThumbnailGeneratorConfig,
  type FrameExtractor,
  type ImageProcessor,
} from './thumbnail';

export {
  ImportMediaTool,
  GetMediaTool,
  ListMediaTool,
  DeleteMediaTool,
  GetThumbnailTool,
  GetMetadataTool,
  createMediaTools,
} from './media-tool';

// Re-export types
export type {
  MediaType,
  MediaStatus,
  MediaMetadata,
  MediaItem,
  MediaDownloadOptions,
  ThumbnailOptions,
  MediaCacheConfig,
  IMediaManager,
} from '../types/media';

// =============================================================================
// AI Media Generation (new)
// =============================================================================

// Generation Types
export type {
  MediaGenerationType,
  MediaTaskStatus,
  MediaOutputType,
  MediaGenerationRequestBase,
  RoutingPreference,
  ImageGenerationRequest,
  VideoGenerationRequest,
  AudioGenerationRequest,
  MediaOutput,
  MediaAdapterResult,
  MediaAdapterError,
  MediaAdapter,
  MediaRoutingResult,
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
  MediaTask,
  MediaProgressCallback,
} from './types';

// Adapters
export {
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
} from './adapters';

// Routing
export {
  MediaRoutingManager,
  UserPreferenceStrategy,
  HealthFilterStrategy,
  CapabilityFilterStrategy,
  LoadBalancingStrategy,
  CostOptimizationStrategy,
  LatencyOptimizationStrategy,
} from './routing';

// Task Executor
export {
  MediaTaskExecutor,
  createMediaTaskInput,
} from './media-task-executor';
export type { MediaTaskPayload, MediaTaskExecutorOptions } from './media-task-executor';

// Service
export { MediaGenerationService } from './media-generation-service';
export type { MediaGenerationServiceOptions } from './media-generation-service';

// Factory
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from '../provider/provider-registry';
import type { ITaskManager } from '@neko/shared';
import type { IMediaTaskManager } from './media-generation-service';
import { MediaAdapterRegistry, getMediaAdapterRegistry } from './adapters/media-adapter-registry';
import { OpenAICompatMediaAdapter } from './adapters/openai-compat-media-adapter';
import { RunwayMediaAdapter } from './adapters/runway-media-adapter';
import { LumaMediaAdapter } from './adapters/luma-media-adapter';
import { MiniMaxMediaAdapter } from './adapters/minimax-media-adapter';
import { LiblibMediaAdapter } from './adapters/liblib-media-adapter';
import { SunoMediaAdapter } from './adapters/suno-media-adapter';
import { ViduMediaAdapter } from './adapters/vidu-media-adapter';
import { MidjourneyMediaAdapter } from './adapters/midjourney-media-adapter';
import { MediaRoutingManager } from './routing/media-routing-manager';
import { CostOptimizationStrategy } from './routing/strategies/cost-optimization-strategy';
import { LatencyOptimizationStrategy } from './routing/strategies/latency-optimization-strategy';
import { MediaTaskExecutor } from './media-task-executor';
import { MediaGenerationService } from './media-generation-service';

/**
 * Extended task manager interface for media platform
 * Includes methods needed by MediaTaskExecutor
 */
export interface MediaTaskManagerDeps extends IMediaTaskManager {
  registerExecutor?(type: string, executor: unknown): void;
  saveRecoveryInfo?(taskId: string, externalTaskId: string, providerId: string): Promise<void>;
  deleteRecoveryInfo?(taskId: string): Promise<void>;
  getRecoveryStorage?(): unknown;
}

/**
 * Media platform dependencies
 */
export interface MediaPlatformDeps {
  configManager: ConfigManager;
  providerRegistry: ProviderRegistry;
  taskManager: MediaTaskManagerDeps;
}

/**
 * Media platform components
 */
export interface MediaPlatform {
  adapterRegistry: MediaAdapterRegistry;
  routingManager: MediaRoutingManager;
  taskExecutor: MediaTaskExecutor;
  service: MediaGenerationService;
}

/**
 * Create a complete media platform instance
 */
export function createMediaPlatform(deps: MediaPlatformDeps): MediaPlatform {
  // Get or create adapter registry
  const adapterRegistry = getMediaAdapterRegistry();

  // Register built-in adapters
  // OpenAI-compatible adapters (covers OpenAI, NekoAPI, and other compatible APIs)
  const openaiCompatAdapter = new OpenAICompatMediaAdapter();
  adapterRegistry.registerBuiltin('openai', openaiCompatAdapter);
  adapterRegistry.registerBuiltin('generic', openaiCompatAdapter); // For NekoAPI and other compatible APIs
  adapterRegistry.registerBuiltin('xai', openaiCompatAdapter);
  adapterRegistry.registerBuiltin('kling', openaiCompatAdapter);

  // Specialized adapters
  adapterRegistry.registerBuiltin('runway', new RunwayMediaAdapter());
  adapterRegistry.registerBuiltin('luma', new LumaMediaAdapter());
  adapterRegistry.registerBuiltin('minimax', new MiniMaxMediaAdapter());
  adapterRegistry.registerBuiltin('liblib', new LiblibMediaAdapter());
  adapterRegistry.registerBuiltin('suno', new SunoMediaAdapter());
  adapterRegistry.registerBuiltin('vidu', new ViduMediaAdapter());
  adapterRegistry.registerBuiltin('midjourney', new MidjourneyMediaAdapter());

  // Create routing manager with all strategies
  const routingManager = new MediaRoutingManager(deps.providerRegistry, deps.configManager);
  routingManager.registerStrategy(new CostOptimizationStrategy());
  routingManager.registerStrategy(new LatencyOptimizationStrategy());

  // Create task executor
  const taskExecutor = new MediaTaskExecutor(deps.providerRegistry, deps.configManager);

  // Register executor with task manager
  taskExecutor.registerWith(deps.taskManager);

  // Create service
  const service = new MediaGenerationService(
    deps.taskManager,
    deps.providerRegistry,
    routingManager
  );

  return {
    adapterRegistry,
    routingManager,
    taskExecutor,
    service,
  };
}
