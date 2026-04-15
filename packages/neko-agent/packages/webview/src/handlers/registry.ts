/**
 * Message Handler Registry
 *
 * Manages registration and dispatch of message handlers.
 */

import type { ExtensionToWebviewMessage } from './messages';
import type { MessageHandler, MessageHandlerContext, HandlerRegistration } from './types';

/**
 * Message handler registry
 *
 * Dispatches typed ExtensionToWebviewMessage to registered handlers.
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
   * Handle a typed message from the Extension Host.
   * @returns true if handled, false if no handler found
   */
  handle(message: ExtensionToWebviewMessage, context: MessageHandlerContext): boolean {
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
