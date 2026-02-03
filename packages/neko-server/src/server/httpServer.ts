/**
 * HTTP Server - REST API for external tool access
 */
import * as http from 'http';
import * as vscode from 'vscode';

export interface HTTPRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface HTTPResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

type RouteHandler = (req: HTTPRequest) => Promise<HTTPResponse>;

export class HTTPServer {
  private server: http.Server | null = null;
  private routes = new Map<string, Map<string, RouteHandler>>();

  constructor() {}

  /**
   * Register a route handler
   */
  route(method: string, path: string, handler: RouteHandler): void {
    const methodUpper = method.toUpperCase();
    if (!this.routes.has(methodUpper)) {
      this.routes.set(methodUpper, new Map());
    }
    this.routes.get(methodUpper)!.set(path, handler);
  }

  /**
   * Start the HTTP server
   */
  start(port: number, host: string = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        reject(new Error('Server already running'));
        return;
      }

      this.server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          const response = await this.handleRequest(req);
          res.writeHead(response.status, {
            'Content-Type': 'application/json',
            ...response.headers,
          });
          res.end(JSON.stringify(response.body));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[NekoCutPro] HTTP request error:', errorMessage);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: errorMessage }));
        }
      });

      this.server.listen(port, host, () => {
        console.log(`[NekoCutPro] HTTP server listening on ${host}:${port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('[NekoCutPro] HTTP server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        console.log('[NekoCutPro] HTTP server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  private async handleRequest(req: http.IncomingMessage): Promise<HTTPResponse> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const method = req.method || 'GET';
    const path = url.pathname;

    // Parse query parameters
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Parse body
    let body: unknown = null;
    if (method === 'POST' || method === 'PUT') {
      body = await this.parseBody(req);
    }

    // Build request object
    const request: HTTPRequest = {
      method,
      path,
      query,
      body,
      headers: req.headers as Record<string, string>,
    };

    // Find handler
    const methodRoutes = this.routes.get(method);
    if (!methodRoutes) {
      return { status: 405, body: { error: 'Method not allowed' } };
    }

    // Try exact match first
    let handler = methodRoutes.get(path);

    // Try pattern matching
    if (!handler) {
      for (const [pattern, h] of methodRoutes) {
        if (this.matchPath(pattern, path)) {
          handler = h;
          break;
        }
      }
    }

    if (!handler) {
      return { status: 404, body: { error: 'Not found' } };
    }

    return handler(request);
  }

  private parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          resolve(data);
        }
      });
      req.on('error', reject);
    });
  }

  private matchPath(pattern: string, path: string): boolean {
    // Simple pattern matching with :param support
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    return patternParts.every((part, i) => {
      return part.startsWith(':') || part === pathParts[i];
    });
  }
}
