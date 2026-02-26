/**
 * VSCode Extension Host API Module
 *
 * Shared base classes for VSCode extension host providers.
 * Requires the vscode module (extension host context only).
 *
 * Import via: @neko/shared/vscode/extension
 *
 * NOTE: Do NOT re-export from @neko/shared/vscode/index.ts.
 * That module is for webview (browser) context.
 */
export { BaseOutlineProvider } from './baseOutlineProvider';
export type { IOutlineProvider } from './baseOutlineProvider';
