/**
 * SSO Message Handlers
 *
 * Handles: ssoSessionChanged
 */

import type { SsoSession } from '@/components/types';
import type { MessageHandler, HandlerRegistration } from './types';

/**
 * Handle 'ssoSessionChanged' - SSO session update from extension
 */
const handleSsoSessionChanged: MessageHandler = (message, context) => {
  const session = (message.session as SsoSession | null) ?? null;
  context.updateSettings({ ssoSession: session });
  // Only dismiss onboarding when a real session arrives (not on logout)
  if (session) {
    context.setShowOnboarding(false);
  }
};

export const ssoHandlers: HandlerRegistration[] = [
  { type: 'ssoSessionChanged', handler: handleSsoSessionChanged },
];
