/**
 * Integration Handler - Handles MCP server management messages
 *
 * Responsible for:
 * - Testing MCP server connections
 */

import * as vscode from 'vscode';
import {
  getMCPTestService,
  runMCPServerTestRuntime,
  type MCPServerTestRuntimeEffects,
} from '@neko/agent';

/**
 * Dependencies for IntegrationHandler
 */
export interface IntegrationHandlerDeps {
  mcpServerTester?: MCPServerTestRuntimeEffects['test'];
}

/**
 * Handler for MCP integration webview messages
 */
export class IntegrationHandler {
  constructor(private readonly deps: IntegrationHandlerDeps = {}) {}

  async handleTestMCPServer(
    webview: vscode.Webview,
    server: {
      id: string;
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      requestId?: string;
    },
  ): Promise<void> {
    await runMCPServerTestRuntime(
      { server },
      {
        test: this.deps.mcpServerTester ?? ((config) => getMCPTestService().test(config)),
        postMessage: async (message) => {
          await webview.postMessage(message);
        },
      },
    );
  }
}
