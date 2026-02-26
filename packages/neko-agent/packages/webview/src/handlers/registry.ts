/**
 * Message Handler Registry
 *
 * Manages registration and dispatch of message handlers.
 */

import type { MessageHandler, MessageHandlerContext, HandlerRegistration } from './types';

/**
 * Message handler registry
 */
export class MessageHandlerRegistry {
  private handlers: Map<string, MessageHandler> = new Map();

  /**
   * Register a handler for a message type
   */
  register(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Register multiple handlers at once
   */
  registerAll(registrations: HandlerRegistration[]): void {
    for (const { type, handler } of registrations) {
      this.register(type, handler);
    }
  }

  /**
   * Handle a message
   * @returns true if handled, false if no handler found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(message: any, context: MessageHandlerContext): boolean {
    const handler = this.handlers.get(message.type);
    if (handler) {
      handler(message, context);
      return true;
    }
    return false;
  }

  /**
   * Check if a handler exists for a message type
   */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered message types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create a new registry with all handlers registered
 */
export function createMessageHandlerRegistry(): MessageHandlerRegistry {
  const registry = new MessageHandlerRegistry();

  // Import and register all handlers
  // These will be registered in the hook that creates the registry
  return registry;
}
