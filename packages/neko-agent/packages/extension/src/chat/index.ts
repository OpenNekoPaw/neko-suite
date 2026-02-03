/**
 * AI Assistant Module (Chat UI Layer)
 */

export { ChatViewProvider } from './chatProvider';
export { SettingsManager } from './settingsManager';
export { ProviderManager } from './providerManager';
export { ConversationHandler } from './conversationHandler';
export { MessageHandler } from './messageHandler';
export { SystemPromptManager } from './systemPromptManager';
export * from './types';

// Re-export from ai module for backward compatibility
export * from '../ai';
