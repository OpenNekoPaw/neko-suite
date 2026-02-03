/**
 * VSCode Webview API Wrapper
 *
 * Provides centralized, type-safe access to VSCode Webview API.
 * Includes singleton pattern, request-response pattern, and state management.
 *
 * This module is designed to be used in browser context (webview).
 * It will gracefully handle non-VSCode environments (development mode).
 */
import type { VSCodeAPI, RequestMessage, SendRequestOptions, IVSCodeApiWrapper } from './types';
/**
 * Get VSCode API instance (singleton)
 * Returns null when running outside VSCode context (development mode)
 *
 * IMPORTANT: The VSCode API must be pre-acquired in the HTML template
 * before any modules load, and stored on window.vscodeApi.
 * acquireVsCodeApi() can only be called ONCE per webview.
 *
 * Example in HTML template:
 * ```html
 * <script>window.vscodeApi = acquireVsCodeApi();</script>
 * ```
 */
export declare function getVSCodeAPI(): VSCodeAPI | null;
/**
 * Check if running in VSCode webview context
 */
export declare function isVSCodeContext(): boolean;
/**
 * Send message to Extension Host
 * Safe to call even when not in VSCode context (no-op in dev mode)
 */
export declare function postMessage(message: unknown): void;
/**
 * Get persisted state from VSCode
 */
export declare function getState<T>(): T | undefined;
/**
 * Set persisted state in VSCode
 */
export declare function setState<T>(state: T): void;
/**
 * Send a request and wait for response from Extension Host
 * Uses Promise-based pattern with automatic timeout
 *
 * @param message - Message to send (type and payload)
 * @param options - Request options (timeout)
 * @returns Promise that resolves with the response or rejects on timeout/error
 *
 * @example
 * ```typescript
 * const response = await sendRequest({ type: 'getFileInfo', path: '/some/file' });
 * console.log(response.size, response.mtime);
 * ```
 *
 * Note: Extension Host must respond with the same _requestId:
 * ```typescript
 * // In Extension Host:
 * panel.webview.postMessage({
 *   type: 'getFileInfoResponse',
 *   _requestId: message._requestId,
 *   payload: { size: stat.size, mtime: stat.mtime },
 * });
 * ```
 */
export declare function sendRequest<TResponse = unknown>(message: Omit<RequestMessage, '_requestId'>, options?: SendRequestOptions): Promise<TResponse>;
/**
 * Cancel a pending request
 */
export declare function cancelRequest(requestId: string): boolean;
/**
 * Get count of pending requests (useful for debugging)
 */
export declare function getPendingRequestCount(): number;
/**
 * Reset the module state (for testing)
 */
export declare function resetVSCodeApi(): void;
/**
 * VSCode API wrapper object
 * Provides all functions as a single object for convenience
 */
export declare const vscodeApi: IVSCodeApiWrapper;
export default vscodeApi;
//# sourceMappingURL=api.d.ts.map