/**
 * Integration Handler - Handles MCP server management messages
 *
 * Responsible for:
 * - Adding MCP servers via interactive prompts
 * - Testing MCP server connections
 */

import * as vscode from 'vscode';
import {
  getMCPTestService,
  runMCPServerTestRuntime,
  type MCPServerTestRuntimeEffects,
} from '@neko/agent';
import { runAddMCPStdioServerRuntime, type Platform } from '@neko/platform';

/**
 * Dependencies for IntegrationHandler
 */
export interface IntegrationHandlerDeps {
  platform?: Platform;
  sendSettings: () => void;
  mcpServerTester?: MCPServerTestRuntimeEffects['test'];
}

/**
 * Handler for MCP integration webview messages
 */
export class IntegrationHandler {
  constructor(private deps: IntegrationHandlerDeps) {}

  updateDeps(partial: Partial<IntegrationHandlerDeps>): void {
    Object.assign(this.deps, partial);
  }

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

  async addMCPServer(): Promise<void> {
    const serverName = await vscode.window.showInputBox({
      prompt: 'Enter MCP Server name',
      placeHolder: 'e.g., my-mcp-server',
    });

    if (!serverName) return;

    const command = await vscode.window.showInputBox({
      prompt: 'Enter the command to start the MCP server',
      placeHolder: 'e.g., npx -y @modelcontextprotocol/server-filesystem',
    });

    if (!command) return;

    const argsInput = await vscode.window.showInputBox({
      prompt: 'Enter command arguments (comma-separated, optional)',
      placeHolder: 'e.g., /path/to/allowed/dir',
    });

    const result = await runAddMCPStdioServerRuntime(
      {
        serverName,
        command,
        ...(argsInput !== undefined ? { argsInput } : {}),
      },
      this.deps.platform?.config,
    );

    if (result.status === 'added') {
      vscode.window.showInformationMessage(result.message);
      this.deps.sendSettings();
      return;
    }

    if (result.status === 'unavailable' || result.status === 'failed') {
      await vscode.window.showErrorMessage(result.message);
    }
  }
}
