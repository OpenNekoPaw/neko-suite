/**
 * NekoCutPro Extension - Advanced features for NekoCut
 *
 * This extension provides WebSocket and HTTP API servers for external tool integration.
 * It requires NekoCut to be installed.
 */
import * as vscode from 'vscode';
import { WSServer, HTTPServer, WSMessage } from './server';
import { registerRoutes } from './api';

// Extension state
let wsServer: WSServer | null = null;
let httpServer: HTTPServer | null = null;
let statusBarItem: vscode.StatusBarItem;

/**
 * Handle WebSocket messages
 */
async function handleWSMessage(message: WSMessage): Promise<unknown> {
  // Execute VSCode command based on message type
  const command = `neko.${message.type}`;
  return vscode.commands.executeCommand(command, message.payload);
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[NekoCutPro] Activating extension...');

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'neko.server.status';
  context.subscriptions.push(statusBarItem);

  // Register commands
  registerCommands(context);

  // Auto-start servers if configured
  const config = vscode.workspace.getConfiguration('neko.server');
  if (config.get<boolean>('ws.enabled') || config.get<boolean>('http.enabled')) {
    // Delay auto-start to allow NekoCut to activate first
    setTimeout(() => {
      vscode.commands.executeCommand('neko.server.start');
    }, 1000);
  }

  console.log('[NekoCutPro] Extension activated');
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Start Server
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.server.start', async () => {
      const config = vscode.workspace.getConfiguration('neko.server');

      try {
        // Start WebSocket server
        if (config.get<boolean>('ws.enabled')) {
          const wsPort = config.get<number>('ws.port', 9528);
          wsServer = new WSServer(handleWSMessage);
          await wsServer.start(wsPort);
          vscode.window.showInformationMessage(`WebSocket server started on port ${wsPort}`);
        }

        // Start HTTP server
        if (config.get<boolean>('http.enabled')) {
          const httpPort = config.get<number>('http.port', 9527);
          const httpHost = config.get<string>('http.host', '127.0.0.1');
          httpServer = new HTTPServer();
          registerRoutes(httpServer);
          await httpServer.start(httpPort, httpHost);
          vscode.window.showInformationMessage(`HTTP server started on ${httpHost}:${httpPort}`);
        }

        updateStatusBar();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to start server: ${errorMessage}`);
      }
    })
  );

  // Stop Server
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.server.stop', async () => {
      try {
        if (wsServer) {
          await wsServer.stop();
          wsServer = null;
        }

        if (httpServer) {
          await httpServer.stop();
          httpServer = null;
        }

        vscode.window.showInformationMessage('Servers stopped');
        updateStatusBar();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to stop server: ${errorMessage}`);
      }
    })
  );

  // Server Status
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.server.status', async () => {
      const config = vscode.workspace.getConfiguration('neko.server');
      const wsPort = config.get<number>('ws.port', 9528);
      const httpPort = config.get<number>('http.port', 9527);
      const httpHost = config.get<string>('http.host', '127.0.0.1');

      const wsStatus = wsServer?.isRunning()
        ? `Running on port ${wsPort} (${wsServer.getClientCount()} clients)`
        : 'Stopped';

      const httpStatus = httpServer?.isRunning()
        ? `Running on ${httpHost}:${httpPort}`
        : 'Stopped';

      const message = `WebSocket: ${wsStatus}\nHTTP: ${httpStatus}`;

      const action = await vscode.window.showInformationMessage(
        message,
        wsServer?.isRunning() || httpServer?.isRunning() ? 'Stop' : 'Start'
      );

      if (action === 'Start') {
        vscode.commands.executeCommand('neko.server.start');
      } else if (action === 'Stop') {
        vscode.commands.executeCommand('neko.server.stop');
      }
    })
  );

  // Open API Documentation
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.server.openDocs', () => {
      const config = vscode.workspace.getConfiguration('neko.server');
      const httpPort = config.get<number>('http.port', 9527);
      const httpHost = config.get<string>('http.host', '127.0.0.1');

      if (httpServer?.isRunning()) {
        vscode.env.openExternal(vscode.Uri.parse(`http://${httpHost}:${httpPort}/api`));
      } else {
        vscode.window.showWarningMessage('HTTP server is not running');
      }
    })
  );
}

/**
 * Update status bar item
 */
function updateStatusBar(): void {
  const wsRunning = wsServer?.isRunning();
  const httpRunning = httpServer?.isRunning();

  if (wsRunning || httpRunning) {
    const parts = [];
    if (wsRunning) parts.push('WS');
    if (httpRunning) parts.push('HTTP');
    statusBarItem.text = `$(broadcast) NekoCutPro: ${parts.join('+')}`;
    statusBarItem.tooltip = 'Click to view server status';
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
  console.log('[NekoCutPro] Deactivating extension...');

  if (wsServer) {
    await wsServer.stop();
    wsServer = null;
  }

  if (httpServer) {
    await httpServer.stop();
    httpServer = null;
  }
}
