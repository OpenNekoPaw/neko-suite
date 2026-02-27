/**
 * Integration Handler - Handles MCP server management messages
 *
 * Responsible for:
 * - Adding MCP servers via interactive prompts
 * - Testing MCP server connections
 */

import * as vscode from 'vscode';
import { getMCPTestService } from '@neko/agent';

/**
 * Dependencies for IntegrationHandler
 */
export interface IntegrationHandlerDeps {
  context: vscode.ExtensionContext;
  sendSettings: () => void;
}

/**
 * Handler for MCP integration webview messages
 */
export class IntegrationHandler {
  constructor(private deps: IntegrationHandlerDeps) {}

  async handleTestMCPServer(
    webview: vscode.Webview,
    server: { id: string; name: string; command: string; args?: string[]; env?: Record<string, string>; requestId?: string }
  ): Promise<void> {
    const requestId = server.requestId || `mcp-test-${Date.now()}`;

    try {
      const testService = getMCPTestService();
      const result = await testService.test({
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
        timeout: 10000,
      });

      webview.postMessage({
        type: 'mcpServerTestResult',
        requestId,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      webview.postMessage({
        type: 'mcpServerTestResult',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
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

    const args = argsInput ? argsInput.split(',').map(s => s.trim()) : [];

    const mcpServers = this.deps.context.globalState.get<Record<string, any>>('neko.mcpServers', {});
    mcpServers[serverName] = { command, args };
    await this.deps.context.globalState.update('neko.mcpServers', mcpServers);

    vscode.window.showInformationMessage(`MCP Server "${serverName}" added successfully.`);
    this.deps.sendSettings();
  }
}
