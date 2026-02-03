/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as vscode from 'vscode';
import { ServiceCollection, setGlobalServices } from './base';
import { bootstrapCoreServices, logServicesStatus } from './bootstrap';
import { ChatViewProvider } from './chat';
import { createNekoCutTools, createNekoCanvasTools } from './tools/extensionTools';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[NekoAgent] Activating extension...');

  // Initialize service collection
  const services = new ServiceCollection();
  setGlobalServices(services);

  // Bootstrap core services (Platform, MCP, Tools, etc.)
  const bootstrapResult = await bootstrapCoreServices(services, context);
  logServicesStatus(bootstrapResult);

  // Register tools from other Neko extensions
  registerExtensionTools(bootstrapResult.toolRegistry);

  // Create chat view provider
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    context
  );

  // Register chat view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider
    )
  );

  // Register commands
  registerCommands(context, chatViewProvider);

  // Listen for extension changes to update tools
  vscode.extensions.onDidChange(() => {
    registerExtensionTools(bootstrapResult.toolRegistry);
  });

  console.log('[NekoAgent] Extension activated');
}

/**
 * Register tools from other Neko extensions (NekoCut, NekoCanvas)
 */
function registerExtensionTools(toolRegistry: { register: (tool: unknown) => void }): void {
  // Register NekoCut tools
  const nekocutTools = createNekoCutTools();
  nekocutTools.forEach((tool) => toolRegistry.register(tool));

  // Register NekoCanvas tools
  const nekocanvasTools = createNekoCanvasTools();
  nekocanvasTools.forEach((tool) => toolRegistry.register(tool));

  console.log(`[NekoAgent] Registered ${nekocutTools.length + nekocanvasTools.length} extension tools`);
}

/**
 * Register extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider
): void {
  // Open AI Chat
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.chat', () => {
      vscode.commands.executeCommand('neko.aiAssistant.focus');
    })
  );

  // Send message to AI Assistant
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.ai.sendMessage', async (message: string) => {
      await chatViewProvider.sendMessageToAssistant(message, true);
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
        await chatViewProvider.sendMessageToAssistant(
          `Generate an image: ${prompt}`,
          true
        );
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
        await chatViewProvider.sendMessageToAssistant(
          `Generate a video: ${prompt}`,
          true
        );
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

      await chatViewProvider.sendMessageToAssistant(
        `Generate a script based on: ${text}`,
        true
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.optimize', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const text = editor.document.getText();
      await chatViewProvider.sendMessageToAssistant(
        `Optimize this script: ${text}`,
        true
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateImage', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const text = editor.document.getText();
      await chatViewProvider.sendMessageToAssistant(
        `Generate images for this script: ${text}`,
        true
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('neko.script.generateVideo', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }

      const text = editor.document.getText();
      await chatViewProvider.sendMessageToAssistant(
        `Generate a video from this script: ${text}`,
        true
      );
    })
  );
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  console.log('[NekoAgent] Deactivating extension...');
}
