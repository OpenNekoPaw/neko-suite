/**
 * Message protocol types for puppet editor
 *
 * Defines the messages exchanged between extension host and puppet webview.
 */

/** Messages from extension → webview */
export type ExtensionToWebviewMessage =
  | { type: 'loadPuppet'; data: string }
  | { type: 'enginePort'; port: number }
  | { type: 'setLocale'; locale: string };

/** Messages from webview → extension */
export type WebviewToExtensionMessage = { type: 'ready' } | { type: 'requestEnginePort' };
