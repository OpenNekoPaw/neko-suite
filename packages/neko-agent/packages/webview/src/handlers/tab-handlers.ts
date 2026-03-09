/**
 * Tab State Handlers
 *
 * Handles tab state restoration from extension host.
 */

import type { MessageHandler, HandlerRegistration } from './types';

/**
 * Handle 'tabState' message - Restore tab state from extension
 */
const handleTabState: MessageHandler = (message, context) => {
  if (message.tabState) {
    const { openTabs, activeTabId } = message.tabState;

    if (Array.isArray(openTabs)) {
      context.setOpenTabs(openTabs);
    }

    if (activeTabId !== undefined) {
      context.setActiveTabId(activeTabId);
    }
  }
};

/**
 * All tab handler registrations
 */
export const tabHandlers: HandlerRegistration[] = [{ type: 'tabState', handler: handleTabState }];
