/**
 * Service Module - Public API
 */

export { Service, type ServiceConfig } from './service';
export { SharedServiceAdapter, toSharedService } from './shared-service-adapter';
export { ModelSelector, type ModelTaskType, type ResolvedModel } from './model-selector';

// PromptManager - local implementation
export { PromptManager } from './prompt-manager';
