/**
 * WebSocket Server - Real-time communication with external tools
 */
import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';

export interface WSMessage {
  id: string;
  type: string;
  payload?: unknown;
}

export interface WSResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export class WSServer {
  private server: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  private readonly _onMessage = new vscode.EventEmitter<{ client: WebSocket; message: WSMessage }>();
  public readonly onMessage = this._onMessage.event;

  private readonly _onClientConnect = new vscode.EventEmitter<WebSocket>();
  public readonly onClientConnect = this._onClientConnect.event;

  private readonly _onClientDisconnect = new vscode.EventEmitter<WebSocket>();
  public readonly onClientDisconnect = this._onClientDisconnect.event;

  constructor(private readonly messageHandler: (message: WSMessage) => Promise<unknown>) {}

  /**
   * Start the WebSocket server
   */
  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        reject(new Error('Server already running'));
        return;
      }

      try {
        this.server = new WebSocketServer({ port });

        this.server.on('connection', (ws) => {
          console.log('[NekoCutPro] WebSocket client connected');
          this.clients.add(ws);
          this._onClientConnect.fire(ws);

          ws.on('message', async (data) => {
            try {
              const message = JSON.parse(data.toString()) as WSMessage;
              this._onMessage.fire({ client: ws, message });

              // Handle message and send response
              const result = await this.messageHandler(message);
              const response: WSResponse = {
                id: message.id,
                success: true,
                data: result,
              };
              ws.send(JSON.stringify(response));
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.error('[NekoCutPro] WebSocket message error:', errorMessage);

              // Try to send error response
              try {
                const parsed = JSON.parse(data.toString()) as WSMessage;
                const response: WSResponse = {
                  id: parsed.id,
                  success: false,
                  error: errorMessage,
                };
                ws.send(JSON.stringify(response));
              } catch {
                // Ignore if we can't parse the original message
              }
            }
          });

          ws.on('close', () => {
            console.log('[NekoCutPro] WebSocket client disconnected');
            this.clients.delete(ws);
            this._onClientDisconnect.fire(ws);
          });

          ws.on('error', (error) => {
            console.error('[NekoCutPro] WebSocket client error:', error);
            this.clients.delete(ws);
          });
        });

        this.server.on('listening', () => {
          console.log(`[NekoCutPro] WebSocket server listening on port ${port}`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('[NekoCutPro] WebSocket server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Close all client connections
      this.clients.forEach((client) => {
        client.close();
      });
      this.clients.clear();

      // Close server
      this.server.close(() => {
        console.log('[NekoCutPro] WebSocket server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}
