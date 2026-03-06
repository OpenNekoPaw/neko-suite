/**
 * NekoAgent Extension - AI Agent for creative workflows in VSCode
 *
 * Main entry point for the NekoAgent extension.
 * Provides AI-powered assistance for video and canvas editing.
 */

import * as vscode from 'vscode';
import { ServiceCollection, setGlobalServices, setRootLogger, setErrorHandler, getRootLogger } from './base';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import { bootstrapCoreServices, logServicesStatus, IPlatform } from './bootstrap';
import { ChatViewProvider } from './chat';
import { createNekoCutTools, createNekoCanvasTools, createNekoEngineEffectsTools } from './tools/extensionTools';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize logger
  const logger = createVSCodeLogger('Neko Agent', 'NekoAgent', context);
  setRootLogger(logger);

  // Initialize error handler
  setErrorHandler(new VSCodeErrorHandler(logger));

  logger.info('Activating extension...');

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
  registerCommands(context, chatViewProvider, services);

  // Listen for extension changes to update tools (register disposable + avoid duplicates)
  let extensionToolsRegistered = true; // Already registered above
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      if (!extensionToolsRegistered) {
        registerExtensionTools(bootstrapResult.toolRegistry);
        extensionToolsRegistered = true;
      }
    })
  );

  getRootLogger().info('Extension activated');
}

/**
 * Register tools from other Neko extensions (NekoCut, NekoCanvas, Engine Effects)
 */
function registerExtensionTools(toolRegistry: { register: (tool: unknown) => void }): void {
  // Register NekoCut tools
  const nekocutTools = createNekoCutTools();
  nekocutTools.forEach((tool) => toolRegistry.register(tool));

  // Register NekoCanvas tools
  const nekocanvasTools = createNekoCanvasTools();
  nekocanvasTools.forEach((tool) => toolRegistry.register(tool));

  // Register Engine Effects tools (GPU shader management)
  const effectsTools = createNekoEngineEffectsTools();
  effectsTools.forEach((tool) => toolRegistry.register(tool));

  getRootLogger().info(`Registered ${nekocutTools.length + nekocanvasTools.length + effectsTools.length} extension tools`);
}

/**
 * Register extension commands
 */
function registerCommands(
  context: vscode.ExtensionContext,
  chatViewProvider: ChatViewProvider,
  services: ServiceCollection,
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

  // Internal API: allows other Neko extensions to use the configured LLM
  // without taking a direct dependency on @neko/platform.
  // Returns null if no service is configured or on any error.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.agent.internalChat',
      async (
        messages: Array<{
          role: 'system' | 'user' | 'assistant' | 'tool';
          content: string | Array<{ type: string; [k: string]: unknown }>;
          name?: string;
          toolCallId?: string;
        }>,
        options?: { maxTokens?: number },
      ): Promise<string | null> => {
        try {
          const platform = services.get(IPlatform);
          if (!platform) return null;
          const service = platform.createService();
          const response = await service.chat(messages as import('@neko/platform').ChatMessage[], {
            maxTokens: options?.maxTokens ?? 1000,
          });
          const content = response.message.content;
          return typeof content === 'string' ? content : null;
        } catch {
          return null;
        }
      },
    ),
  );
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  getRootLogger().info('Deactivating extension...');
}
