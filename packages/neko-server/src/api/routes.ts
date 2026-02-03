/**
 * API Routes - Define HTTP API endpoints
 */
import * as vscode from 'vscode';
import { HTTPServer, HTTPRequest, HTTPResponse } from '../server/httpServer';

// NekoCut API type
interface NekoCutAPI {
  timeline: {
    getInfo(): Promise<unknown>;
    addElement(config: unknown): Promise<string>;
    updateElement(id: string, updates: unknown): Promise<void>;
    deleteElement(id: string): Promise<void>;
    listElements(): Promise<unknown[]>;
  };
}

/**
 * Register API routes
 */
export function registerRoutes(server: HTTPServer): void {
  // Health check
  server.route('GET', '/health', async () => ({
    status: 200,
    body: { status: 'ok', timestamp: Date.now() },
  }));

  // API info
  server.route('GET', '/api', async () => ({
    status: 200,
    body: {
      name: 'NekoCutPro API',
      version: '1.0.0',
      endpoints: [
        'GET /health',
        'GET /api',
        'GET /api/timeline',
        'GET /api/timeline/elements',
        'POST /api/timeline/elements',
        'PUT /api/timeline/elements/:id',
        'DELETE /api/timeline/elements/:id',
        'POST /api/commands/:command',
      ],
    },
  }));

  // Timeline info
  server.route('GET', '/api/timeline', async () => {
    const api = await getNekoCutAPI();
    if (!api) {
      return { status: 503, body: { error: 'NekoCut not available' } };
    }

    const info = await api.timeline.getInfo();
    return { status: 200, body: info };
  });

  // List elements
  server.route('GET', '/api/timeline/elements', async () => {
    const api = await getNekoCutAPI();
    if (!api) {
      return { status: 503, body: { error: 'NekoCut not available' } };
    }

    const elements = await api.timeline.listElements();
    return { status: 200, body: elements };
  });

  // Add element
  server.route('POST', '/api/timeline/elements', async (req: HTTPRequest) => {
    const api = await getNekoCutAPI();
    if (!api) {
      return { status: 503, body: { error: 'NekoCut not available' } };
    }

    const id = await api.timeline.addElement(req.body);
    return { status: 201, body: { id } };
  });

  // Update element
  server.route('PUT', '/api/timeline/elements/:id', async (req: HTTPRequest) => {
    const api = await getNekoCutAPI();
    if (!api) {
      return { status: 503, body: { error: 'NekoCut not available' } };
    }

    const id = req.path.split('/').pop()!;
    await api.timeline.updateElement(id, req.body);
    return { status: 200, body: { success: true } };
  });

  // Delete element
  server.route('DELETE', '/api/timeline/elements/:id', async (req: HTTPRequest) => {
    const api = await getNekoCutAPI();
    if (!api) {
      return { status: 503, body: { error: 'NekoCut not available' } };
    }

    const id = req.path.split('/').pop()!;
    await api.timeline.deleteElement(id);
    return { status: 200, body: { success: true } };
  });

  // Execute command
  server.route('POST', '/api/commands/:command', async (req: HTTPRequest) => {
    const command = req.path.split('/').pop()!;
    const fullCommand = `neko.${command}`;

    try {
      const result = await vscode.commands.executeCommand(fullCommand, req.body);
      return { status: 200, body: { result } };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { status: 400, body: { error: errorMessage } };
    }
  });
}

/**
 * Get NekoCut API
 */
async function getNekoCutAPI(): Promise<NekoCutAPI | null> {
  const ext = vscode.extensions.getExtension<NekoCutAPI>('neko.nekocut');
  if (!ext) {
    return null;
  }

  if (ext.isActive) {
    return ext.exports;
  }

  return ext.activate();
}
