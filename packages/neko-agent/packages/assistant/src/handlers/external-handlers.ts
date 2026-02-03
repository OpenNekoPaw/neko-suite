/**
 * External Message Handlers
 *
 * Handles messages from external commands (e.g., script context menu)
 * - externalMessage: Auto-send message to AI assistant
 * - prefillInput: Prefill the input field without sending
 */

import type { MessageHandler, HandlerRegistration } from './types';

/**
 * Extended context with external message support
 */
export interface ExternalMessageContext {
  setInputValue: (value: string) => void;
  triggerSend: (message: string) => void;
}

// Context for external handlers (set by main component)
let externalContext: ExternalMessageContext | null = null;

/**
 * Set the external message context
 * Called by the main component to provide access to input/send functions
 */
export function setExternalMessageContext(ctx: ExternalMessageContext): void {
  externalContext = ctx;
}

/**
 * Handle 'externalMessage' - Auto-send message to AI assistant
 */
const handleExternalMessage: MessageHandler = (message) => {
  if (!externalContext) {
    console.warn('[AIAssistant] External message context not set');
    return;
  }

  const messageText = message.message as string;
  if (messageText?.trim()) {
    console.log('[AIAssistant] Received external message, auto-sending:', messageText.substring(0, 50));
    externalContext.triggerSend(messageText);
  }
};

/**
 * Handle 'prefillInput' - Prefill input field without sending
 */
const handlePrefillInput: MessageHandler = (message) => {
  if (!externalContext) {
    console.warn('[AIAssistant] External message context not set');
    return;
  }

  const messageText = message.message as string;
  if (messageText) {
    console.log('[AIAssistant] Prefilling input:', messageText.substring(0, 50));
    externalContext.setInputValue(messageText);
  }
};

/**
 * All external handler registrations
 */
export const externalHandlers: HandlerRegistration[] = [
  { type: 'externalMessage', handler: handleExternalMessage },
  { type: 'prefillInput', handler: handlePrefillInput },
];
