/**
 * ConfigBridge shared types
 */

import type { ConfigState } from '@neko/shared';
import type { ConnectionStatus } from '../connectionStateManager';

/**
 * Function type for sending messages to a webview
 */
export type PostMessageFn = (message: Record<string, unknown>) => void;

/**
 * Extended config state with connection status
 */
export interface ConfigStateWithStatus extends ConfigState {
  connectionStates: Record<string, { status: ConnectionStatus; error?: string }>;
}
