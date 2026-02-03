/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * This is the main entry point for the NekoAgent extension.
 * It provides AI-powered assistance for video and canvas editing.
 */
import * as vscode from 'vscode';
import { AIAssistantProvider } from './views';
import { ToolRegistry } from './services';
import { createNekoCutTools, createNekoCanvasTools } from './tools';
import type { NekoAgentAPI, Tool, ChatOptions, MCPServerConfig, AgentMessage } from './api';

// Extension state
let aiAssistantProvider: AIAssistantProvider;
let toolRegistry: ToolRegistry;
const mcpServers: MCPServerConfig[] = [];

// Events
const _onDidReceiveMessage = new vscode.EventEmitter<AgentMessage>();
const _onDidCallTool = new vscode.EventEmitter<{ name: string; args: Record<string, unknown> }>();

/**
 * Simple chat handler (placeholder - integrate with actual LLM service)
 */
async function handleChat(message: string, _options?: ChatOptions): Promise<string> {
  // Get configuration
  const config = vscode.workspace.getConfiguration('neko.agent');
  const provider = config.get<string>('provider', 'anthropic');
  const model = config.get<string>('model', 'claude-sonnet-4-20250514');

  // For now, return a placeholder response
  // In production, this would call the actual LLM API
  console.log(`[NekoAgent] Chat request: provider=${provider}, model=${model}`);
  console.log(`[NekoAgent] Message: ${message}`);
  console.log(`[NekoAgent] Available tools: ${toolRegistry.getAll().map((t) => t.name).join(', ')}`);

  // Placeholder response
  return `I'm NekoAgent, your AI assistant for creative workflows. I received your message: "${message}"\n\nI have access to ${toolRegistry.getAll().length} tools to help you with video editing and canvas design.\n\nNote: This is a placeholder response. Configure your API key in settings to enable full AI capabilities.`;
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): NekoAgentAPI {
  console.log('[NekoAgent] Activating extension...');

  // Initialize tool registry
  toolRegistry = new ToolRegistry();

  // Register tools from other extensions
  const nekocutTools = createNekoCutTools();
  const nekocanvasTools = createNekoCanvasTools();

  nekocutTools.forEach((tool) => toolRegistry.register(tool));
  nekocanvasTools.forEach((tool) => toolRegistry.register(tool));

  console.log(`[NekoAgent] Registered ${toolRegistry.getAll().length} tools`);

  // Create AI assistant provider
  aiAssistantProvider = new AIAssistantProvider(context, handleChat);

  // Register AI assistant view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AIAssistantProvider.viewType,
      aiAssistantProvider
    )
  );

  // Register commands
  registerCommands(context);

  // Listen for extension changes to update tools
  vscode.extensions.onDidChange(() => {
    updateTools();
  });

  console.log('[NekoAgent] Extension activated');

  // Return API for other extensions
  const api: NekoAgentAPI = {
    chat: (message, options) => handleChat(message, options),
    chatStream: async function* (message, options) {
      // Placeholder for streaming - would integrate with actual LLM
      const response = await handleChat(message, options);
      yield { type: 'text', content: response };
    },
    registerTool: (tool) => toolRegistry.register(tool),
    unregisterTool: (name) => toolRegistry.unregister(name),
    getTools: () => toolRegistry.getAll(),
    events: {
      onDidReceiveMessage: _onDidReceiveMessage.event,
      onDidCallTool: _onDidCallTool.event,
    },
    mcp: {
      connect: async (config) => {
        mcpServers.push(config);
        console.log(`[NekoAgent] Connected to MCP server: ${config.name}`);
      },
      disconnect: async (name) => {
        const index = mcpServers.findIndex((s) => s.name === name);
        if (index !== -1) {
          mcpServers.splice(index, 1);
          console.log(`[NekoAgent] Disconnected from MCP server: ${name}`);
        }
      },
      listServers: () => [...mcpServers],
    },
  };

  return api;
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Open AI Chat
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chat', () => {
      vscode.commands.executeCommand('neko.aiAssistant.focus');
    })
  );

  // Generate Image (placeholder)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateImage', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the image you want to generate',
        placeHolder: 'A beautiful sunset over mountains...',
      });

      if (prompt) {
        vscode.window.showInformationMessage(`Generating image: "${prompt}" (placeholder)`);
      }
    })
  );

  // Generate Video (placeholder)
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.generateVideo', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the video you want to generate',
        placeHolder: 'A timelapse of clouds moving...',
      });

      if (prompt) {
        vscode.window.showInformationMessage(`Generating video: "${prompt}" (placeholder)`);
      }
    })
  );

  // Script commands
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generate', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const selection = editor.selection;
      const text = editor.document.getText(selection.isEmpty ? undefined : selection);

      vscode.window.showInformationMessage(`Generating script from: "${text.substring(0, 50)}..." (placeholder)`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.optimize', async () => {
      vscode.window.showInformationMessage('Optimizing script... (placeholder)');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateImage', async () => {
      vscode.window.showInformationMessage('Generating image from script... (placeholder)');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateVideo', async () => {
      vscode.window.showInformationMessage('Generating video from script... (placeholder)');
    })
  );
}

/**
 * Update tools when extensions change
 */
function updateTools(): void {
  // Clear existing extension tools
  const existingTools = toolRegistry.getAll();
  existingTools.forEach((tool) => {
    if (tool.name.startsWith('Get') || tool.name.startsWith('List') ||
        tool.name.startsWith('Add') || tool.name.startsWith('Update') ||
        tool.name.startsWith('Delete') || tool.name.startsWith('Import') ||
        tool.name.startsWith('Create')) {
      toolRegistry.unregister(tool.name);
    }
  });

  // Re-register tools
  const nekocutTools = createNekoCutTools();
  const nekocanvasTools = createNekoCanvasTools();

  nekocutTools.forEach((tool) => toolRegistry.register(tool));
  nekocanvasTools.forEach((tool) => toolRegistry.register(tool));

  console.log(`[NekoAgent] Updated tools: ${toolRegistry.getAll().length} available`);
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  console.log('[NekoAgent] Deactivating extension...');
  toolRegistry.clear();
}
