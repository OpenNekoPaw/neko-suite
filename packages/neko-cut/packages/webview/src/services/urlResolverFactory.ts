/**
 * URL Resolver Factory
 *
 * Creates a URL resolver for use with various media services.
 * Converts file paths to VSCode webview URIs.
 */

import { getFileUri } from '../hooks/useVSCodeMessaging';

/**
 * URL resolver function type (matches media-engine UrlResolver)
 */
export type UrlResolver = (url: string) => Promise<string>;

/**
 * Create a URL resolver that converts file paths to webview URIs.
 *
 * This resolver is designed for use in VSCode webview context.
 * It handles the conversion of relative file paths to webview:// URIs.
 */
export function createWebviewUrlResolver(): UrlResolver {
  return async (path: string): Promise<string> => {
    return await getFileUri(path);
  };
}

// Singleton cached resolver for performance
let cachedResolver: UrlResolver | null = null;

/**
 * Get the singleton URL resolver instance.
 *
 * Reuses the same resolver function for performance.
 */
export function getWebviewUrlResolver(): UrlResolver {
  if (!cachedResolver) {
    cachedResolver = createWebviewUrlResolver();
  }
  return cachedResolver;
}
