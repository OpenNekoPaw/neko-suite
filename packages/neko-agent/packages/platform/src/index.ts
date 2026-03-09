/**
 * Neko Suite Platform - AI Service Platform
 *
 * A unified AI service layer providing:
 * - Multi-provider support (OpenAI, Anthropic, Google, Azure, Ollama)
 * - Configuration management with three-tier priority
 * - Model selection driven by taskDefaults config
 */

// =============================================================================
// Types - Re-export from types module
// =============================================================================

export * from './types';

// =============================================================================
// Configuration Layer
// =============================================================================

export {
  getBuiltinProviderTemplates,
  getBuiltinProviderTemplate,
  getBuiltinPrompt,
} from './config/builtin-presets';

export {
  FileUserConfigManager,
  type UserConfig,
  type IUserConfigManager,
} from './config/user-config';

export {
  watchWorkspaceConfig,
  type WorkspaceConfig,
} from './config/workspace-config';

export {
  ConfigManager,
  type MergedConfig,
  type ConfigManagerOptions,
} from './config/config-manager';
export {
  type ConfigExportData,
  type ConfigImportResult,
  type CustomProviderConfig,
} from './config/config-export-service';

// =============================================================================
// Provider Layer
// =============================================================================

export { ProviderRegistry } from './provider/provider-registry';
export { PlatformError } from './provider/platform-error';

// =============================================================================
// Service Layer
// =============================================================================

export { Service, type ServiceConfig } from './service/service';
export { toSharedService } from './service/shared-service-adapter';
export { PromptManager } from './service/prompt-manager';

// =============================================================================
// Media Layer (service + types only; adapters are internal)
// =============================================================================

export { MediaGenerationService } from './media/media-generation-service';
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
} from './media/types';

// =============================================================================
// Factory Functions
// =============================================================================

import { type IUserConfigManager } from './config/user-config';
import { ConfigManager, type ConfigManagerOptions } from './config/config-manager';
import { ProviderRegistry } from './provider/provider-registry';
import { Service } from './service/service';
import type { IToolRegistry } from '@neko/shared';
import type { ITaskManager } from '@neko/shared';
import { PromptManager } from './service/prompt-manager';
// Media Generation imports
import { MediaGenerationService } from './media/media-generation-service';
import { createMediaPlatform } from './media';

/**
 * Platform initialization options
 */
export interface PlatformOptions {
  /** User config manager (file-based) */
  userConfigManager?: IUserConfigManager;
  /** Workspace path for .neko/config.json */
  workspacePath?: string;
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
  /**
   * Tool registry instance (from @neko/agent).
   * Platform no longer creates its own ToolRegistry.
   */
  toolRegistry: IToolRegistry;
}

/**
 * Platform instance with all components
 */
export interface Platform {
  /** Configuration manager */
  config: ConfigManager;
  /** Provider registry */
  providers: ProviderRegistry;
  /** Tool registry */
  tools: IToolRegistry;
  /** Prompt manager */
  prompts: PromptManager;
  /** Media generation service */
  media: MediaGenerationService;
  /** Create a service instance */
  createService: () => Service;
  /** Dispose resources */
  dispose: () => void;
}

/**
 * Create a fully configured platform instance
 */
export function createPlatform(options: PlatformOptions): Platform {
  // Initialize configuration manager with locale support
  const configOptions: ConfigManagerOptions = {
    userConfigManager: options.userConfigManager,
    workspacePath: options.workspacePath,
    locale: options.locale,
  };
  const configManager = new ConfigManager(configOptions);

  // Initialize provider registry (simplified: adapter routing only)
  const providerRegistry = new ProviderRegistry(configManager);

  // Use injected tool registry (from @neko/agent)
  const toolRegistry = options.toolRegistry;

  // Initialize prompt manager (extension registers prompts via platform.prompts.register())
  const promptManager = new PromptManager();

  // ==========================================================================
  // Initialize Media Generation Service
  // ==========================================================================
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

  const mediaGenerationService = mediaPlatform.service;

  // Factory function — model selection is handled inside Service via ModelSelector
  const createService = (): Service => {
    return new Service({
      configManager,
      providerRegistry,
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
    tools: toolRegistry,
    prompts: promptManager,
    media: mediaGenerationService,
    createService,
    dispose,
  };
}
