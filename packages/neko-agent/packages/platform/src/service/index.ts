/**
 * Service Module - Public API
 */

export { Service, type ServiceConfig } from './service';
export { SharedServiceAdapter, toSharedService } from './shared-service-adapter';
export { ModelSelector, type ModelTaskType, type ResolvedModel } from './model-selector';
export {
  INTERNAL_CHAT_DEFAULT_MAX_TOKENS,
  runInternalChatRuntime,
  type InternalChatRuntimeDeps,
  type InternalChatRuntimeInput,
  type InternalChatRuntimeLogger,
  type InternalChatRuntimeService,
} from './internal-chat-runtime';

// PromptManager - local implementation
export { PromptManager } from './prompt-manager';
