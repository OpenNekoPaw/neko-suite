/**
 * Context Management Message Handlers
 *
 * Handles: contextTokenCount, compressionResult, compressionError
 */

import type { MessageHandler, HandlerRegistration } from './types';
import { getLogger } from '../utils/logger';

const logger = getLogger('ContextHandlers');

/**
 * Handle 'contextTokenCount' - Token count update for a conversation
 */
const handleContextTokenCount: MessageHandler = (message, context) => {
  if (message.conversationId) {
    context.conversationTokenCountRef.current.set(message.conversationId, message.tokenCount || 0);
    // Trigger re-render if it's the current conversation
    if (message.conversationId === context.activeConversationIdRef.current) {
      context.forceUpdate();
    }
  }
};

/**
 * Handle 'compressionResult' - Compression completed for a conversation
 */
const handleCompressionResult: MessageHandler = (message, context) => {
  if (message.conversationId) {
    context.conversationCompressingRef.current.set(message.conversationId, false);
    context.conversationTokenCountRef.current.set(message.conversationId, message.compressedTokens || 0);
    // Trigger re-render if it's the current conversation
    if (message.conversationId === context.activeConversationIdRef.current) {
      context.forceUpdate();
    }
  }
};

/**
 * Handle 'compressionError' - Compression failed for a conversation
 */
const handleCompressionError: MessageHandler = (message, context) => {
  if (message.conversationId) {
    context.conversationCompressingRef.current.set(message.conversationId, false);
    if (message.conversationId === context.activeConversationIdRef.current) {
      context.forceUpdate();
    }
  }
  logger.error('Compression failed:', message.error);
};

export const contextHandlers: HandlerRegistration[] = [
  { type: 'contextTokenCount', handler: handleContextTokenCount },
  { type: 'compressionResult', handler: handleCompressionResult },
  { type: 'compressionError', handler: handleCompressionError },
];
