/**
 * Media Module - AI media generation
 *
 * Public API: MediaGenerationService + types + createMediaPlatform factory.
 * Adapter classes, registries, routing, and executors are internal implementation details.
 */

// =============================================================================
// Public Types
// =============================================================================

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
  MediaTask,
  MediaProgressCallback,
} from './types';

// =============================================================================
// Public Service
// =============================================================================

export { MediaGenerationService } from './media-generation-service';
export { downloadMediaOutputs, detectMediaExtension, type DownloadMediaOptions } from './media-file-downloader';

// Factory
import { ConfigManager } from '../config/config-manager';
import { ProviderRegistry } from '../provider/provider-registry';
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
  adapterRegistry.registerBuiltin('newapi', openaiCompatAdapter); // NewAPI is OpenAI-compatible
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

  // Create routing manager
  const routingManager = new MediaRoutingManager(deps.providerRegistry, deps.configManager);

  // Create task executor
  const taskExecutor = new MediaTaskExecutor(deps.providerRegistry, deps.configManager);

  // Register executor with task manager
  taskExecutor.registerWith(deps.taskManager);

  // Create service
  const service = new MediaGenerationService(
    deps.taskManager,
    deps.providerRegistry,
    routingManager,
  );

  return {
    adapterRegistry,
    routingManager,
    taskExecutor,
    service,
  };
}
