#!/usr/bin/env node
/**
 * MCP Proxy - Bridges MCP Stdio protocol to Neko Suite HTTP API
 *
 * This standalone script allows Claude Desktop, Cursor, and other
 * MCP-compatible AI tools to communicate with Neko Suite via the
 * Model Context Protocol.
 *
 * Usage:
 *   node mcp-proxy.js [--port PORT] [--host HOST]
 *
 * Environment variables:
 *   NEKO_HTTP_URL - Full URL to Neko Suite HTTP server (default: http://127.0.0.1:9527)
 *   NEKO_PORT     - Port number (default: 9527)
 *   NEKO_HOST     - Host address (default: 127.0.0.1)
 *
 * Claude Desktop configuration example (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "neko": {
 *         "command": "node",
 *         "args": ["/path/to/mcp-proxy.js"],
 *         "env": {
 *           "NEKO_HTTP_URL": "http://127.0.0.1:9527"
 *         }
 *       }
 *     }
 *   }
 */

import * as readline from 'readline';

// =============================================================================
// Types
// =============================================================================

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, unknown>;
  requiresConfirmation?: boolean;
  available?: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

const HTTP_BASE =
  process.env.NEKO_HTTP_URL ||
  `http://${process.env.NEKO_HOST || '127.0.0.1'}:${process.env.NEKO_PORT || '9527'}`;

const SERVER_INFO = {
  name: 'neko',
  version: '1.0.0',
};

const PROTOCOL_VERSION = '2024-11-05';

// =============================================================================
// Logging (to stderr to not interfere with stdio protocol)
// =============================================================================

function log(...args: unknown[]): void {
  console.error('[MCP Proxy]', ...args);
}

// =============================================================================
// HTTP Client
// =============================================================================

async function httpGet(path: string): Promise<unknown> {
  const url = `${HTTP_BASE}${path}`;
  log('GET', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function httpPost(path: string, body: unknown): Promise<unknown> {
  const url = `${HTTP_BASE}${path}`;
  log('POST', url, body);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// =============================================================================
// MCP Protocol Handlers
// =============================================================================

async function handleInitialize(
  params: Record<string, unknown>
): Promise<unknown> {
  log('Initialize:', params);

  // Check if HTTP server is available
  try {
    await httpGet('/api/v1/health');
  } catch (error) {
    log('Warning: HTTP server not available:', error);
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: SERVER_INFO,
  };
}

async function handleListTools(): Promise<{ tools: ToolDefinition[] }> {
  log('Listing tools...');

  try {
    const response = (await httpGet('/api/v1/tools')) as {
      success: boolean;
      data: { tools: ToolInfo[] };
    };

    if (!response.success) {
      throw new Error('Failed to list tools');
    }

    const tools: ToolDefinition[] = response.data.tools.map((tool) => ({
      name: tool.name,
      description: tool.description + (tool.available === false ? ' [UNAVAILABLE - requires open editor]' : ''),
      inputSchema: tool.parameters,
    }));

    log(`Found ${tools.length} tools`);
    return { tools };
  } catch (error) {
    log('Error listing tools:', error);
    // Return empty list if server is unavailable
    return { tools: [] };
  }
}

async function handleCallTool(params: {
  name: string;
  arguments?: Record<string, unknown>;
}): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const { name, arguments: args = {} } = params;
  log('Calling tool:', name, args);

  try {
    const response = (await httpPost(`/api/v1/tools/${name}/execute`, args)) as {
      success: boolean;
      data?: unknown;
      error?: string;
      code?: string;
    };

    if (response.success) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${response.error || 'Unknown error'}\nCode: ${response.code || 'UNKNOWN'}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    log('Tool execution error:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// =============================================================================
// Request Router
// =============================================================================

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params = {} } = request;

  try {
    let result: unknown;

    switch (method) {
      case 'initialize':
        result = await handleInitialize(params);
        break;

      case 'notifications/initialized':
        // Notification, no response needed
        return { jsonrpc: '2.0', id: null, result: null };

      case 'tools/list':
        result = await handleListTools();
        break;

      case 'tools/call':
        result = await handleCallTool(
          params as { name: string; arguments?: Record<string, unknown> }
        );
        break;

      case 'ping':
        result = {};
        break;

      default:
        log('Unknown method:', method);
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  } catch (error) {
    log('Request error:', error);
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  log('Starting MCP Proxy');
  log('HTTP Server:', HTTP_BASE);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line: string) => {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      log('Received:', request.method, request.id);

      const response = await handleRequest(request);

      // Only send response if it has an id (not a notification)
      if (response.id !== null || response.result !== null) {
        const responseStr = JSON.stringify(response);
        console.log(responseStr);
        log('Sent response for:', request.method);
      }
    } catch (error) {
      log('Parse error:', error);
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on('close', () => {
    log('Input closed, exiting');
    process.exit(0);
  });

  // Handle termination signals
  process.on('SIGINT', () => {
    log('Received SIGINT, exiting');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('Received SIGTERM, exiting');
    process.exit(0);
  });
}

main().catch((error) => {
  log('Fatal error:', error);
  process.exit(1);
});
