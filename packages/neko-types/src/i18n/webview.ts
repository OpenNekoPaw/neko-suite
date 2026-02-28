/**
 * i18n Webview Utilities
 *
 * Browser/DOM-dependent utilities for webview locale detection.
 * Import via: @neko/shared/i18n/webview (only in webview context)
 *
 * NOT exported from the main @neko/shared entry to avoid
 * requiring DOM types in Node.js consumers.
 */

import { normalizeLocale } from './core';
import type { SupportedLocale } from './types';

/**
 * Detect locale from a VSCode webview's DOM attribute
 *
 * VSCode injects `data-vscode-locale` on the <html> element.
 * Returns 'en' if attribute is missing or not in browser context.
 *
 * Usage in webview:
 * ```typescript
 * import { detectWebviewLocale } from '@neko/shared/i18n/webview';
 * const locale = detectWebviewLocale();
 * ```
 */
export function detectWebviewLocale(): SupportedLocale {
  if (typeof document === 'undefined') return 'en';
  const attr = document.documentElement.getAttribute('data-vscode-locale');
  return attr ? normalizeLocale(attr) : 'en';
}
