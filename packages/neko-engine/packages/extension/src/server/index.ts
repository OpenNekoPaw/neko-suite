/**
 * Server Module - External API access for UniEdit
 *
 * This module provides:
 * - HTTP Server for REST API access (Python/Shell scripts)
 * - MCP Proxy for AI tools (Claude Desktop, Cursor)
 * - Headless Webview for tool execution without open editor
 */

export { UniEditHttpServer, type HttpServerConfig, type WebviewStatusChecker } from './http-server';
export { HeadlessWebviewManager } from './headless-webview';
export {
  ExternalAPIServer,
  createExternalAPIServer,
  type ExternalAPIServerConfig,
} from './external-api-server';
