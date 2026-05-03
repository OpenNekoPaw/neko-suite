import type { AssistantConfigState } from '@neko/platform/config/assistant-config';
import type { ConnectionStatus, ExtensionToWebviewMessage } from '@neko-agent/types';

/**
 * Function type for sending messages to a webview
 */
export type PostMessageFn = (message: ExtensionToWebviewMessage) => void;

export type WebviewConfigState = AssistantConfigState;

/**
 * Extended config state with connection status
 */
export interface ConfigStateWithStatus extends WebviewConfigState {
  connectionStates: Record<string, { status: ConnectionStatus; error?: string }>;
}
