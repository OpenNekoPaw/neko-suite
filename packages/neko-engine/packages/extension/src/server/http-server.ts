/**
 * HTTP Server - REST API for external tools
 *
 * Provides HTTP endpoints for Python/Shell scripts to call UniEdit tools.
 * Binds to localhost only for security.
 */

import * as http from 'http';
import type { IToolRegistry as ToolRegistry, ToolResult } from '@neko/agent';
import { LOCAL_TIMELINE_TOOL_NAMES } from '../tools/timeline-bridge';

/**
 * HTTP Server configuration
 */
export interface HttpServerConfig {
  /** Port number (default: 9527) */
  port: number;
  /** Host to bind (default: 127.0.0.1) */
  host: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HttpServerConfig = {
  port: 9527,
  host: '127.0.0.1',
};

/**
 * API response wrapper
 */
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Tool info for API response
 */
interface ToolInfo {
  name: string;
  description: string;
  category: string;
  parameters: Record<string, unknown>;
  requiresConfirmation?: boolean;
  available?: boolean;
}

/**
 * Webview status checker interface
 */
export interface WebviewStatusChecker {
  isConnected(): boolean;
  getProjectInfo(): { loaded: boolean; path?: string } | null;
}

/**
 * UniEdit HTTP Server
 *
 * REST API endpoints:
 * - GET  /api/v1/health              - Health check
 * - GET  /api/v1/tools               - List all tools
 * - GET  /api/v1/tools/:name         - Get tool info
 * - POST /api/v1/tools/:name/execute - Execute tool
 * - GET  /api/v1/project/status      - Get project status
 * - POST /api/v1/project/load        - Load project file
 * - POST /api/v1/project/create      - Create empty project
 */
export class UniEditHttpServer {
  private server: http.Server | null = null;
  private toolRegistry: ToolRegistry;
  private config: HttpServerConfig;
  private webviewChecker: WebviewStatusChecker | null = null;
  private projectLoader: ((path?: string) => Promise<void>) | null = null;

  constructor(toolRegistry: ToolRegistry, config: Partial<HttpServerConfig> = {}) {
    this.toolRegistry = toolRegistry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set webview status checker
   */
  setWebviewChecker(checker: WebviewStatusChecker): void {
    this.webviewChecker = checker;
  }

  /**
   * Set project loader function
   */
  setProjectLoader(loader: (path?: string) => Promise<void>): void {
    this.projectLoader = loader;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const maxRetries = 10;
    let currentPort = this.config.port;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.tryStartOnPort(currentPort);
        this.config.port = currentPort; // Update config with actual port
        return;
      } catch (error) {
        lastError = error as Error;
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE' ||
            (error as Error).message.includes('already in use')) {
          currentPort++;
        } else {
          throw error;
        }
      }
    }

    throw lastError ?? new Error(`Failed to start server after ${maxRetries} attempts`);
  }

  /**
   * Try to start server on a specific port
   */
  private async tryStartOnPort(port: number): Promise<void> {
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        console.error('[UniEdit HTTP] Request error:', error);
        this.sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.on('error', (error: NodeJS.ErrnoException) => {
        this.server = null;
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });

      this.server!.listen(port, this.config.host, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server!.close(() => {
        resolve();
      });
    });
    this.server = null;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    // Route request
    try {
      // Health check
      if (path === '/api/v1/health' && method === 'GET') {
        await this.handleHealth(res);
      }
      // List tools
      else if (path === '/api/v1/tools' && method === 'GET') {
        await this.handleListTools(res, url);
      }
      // Get tool info
      else if (path.match(/^\/api\/v1\/tools\/[^/]+$/) && method === 'GET') {
        const toolName = path.split('/').pop()!;
        await this.handleGetTool(res, toolName);
      }
      // Execute tool
      else if (path.match(/^\/api\/v1\/tools\/[^/]+\/execute$/) && method === 'POST') {
        const toolName = path.split('/').slice(-2)[0];
        const body = await this.readBody(req);
        await this.handleExecuteTool(res, toolName, body);
      }
      // Project status
      else if (path === '/api/v1/project/status' && method === 'GET') {
        await this.handleProjectStatus(res);
      }
      // Load project
      else if (path === '/api/v1/project/load' && method === 'POST') {
        const body = await this.readBody(req);
        await this.handleLoadProject(res, body);
      }
      // Create project
      else if (path === '/api/v1/project/create' && method === 'POST') {
        const body = await this.readBody(req);
        await this.handleCreateProject(res, body);
      }
      // Not found
      else {
        this.sendError(res, 404, `Endpoint not found: ${method} ${path}`, 'NOT_FOUND');
      }
    } catch (error) {
      console.error('[UniEdit HTTP] Handler error:', error);
      this.sendError(res, 500, String(error), 'HANDLER_ERROR');
    }
  }

  /**
   * Handle health check
   */
  private async handleHealth(res: http.ServerResponse): Promise<void> {
    const webviewConnected = this.webviewChecker?.isConnected() ?? false;
    const projectInfo = this.webviewChecker?.getProjectInfo() ?? null;
    const projectLoaded = projectInfo?.loaded ?? false;

    this.sendJson(res, {
      success: true,
      data: {
        status: 'ok',
        version: '1.0.0',
        webview: {
          connected: webviewConnected,
          project: projectInfo,
        },
        tools: {
          total: this.toolRegistry.list().length,
          available: projectLoaded
            ? this.toolRegistry.list().length
            : this.toolRegistry.list().filter((t) => t.category !== 'timeline').length,
        },
      },
    });
  }

  /**
   * Handle list tools
   */
  private async handleListTools(
    res: http.ServerResponse,
    url: URL
  ): Promise<void> {
    const category = url.searchParams.get('category');
    const webviewConnected = this.webviewChecker?.isConnected() ?? false;
    const projectLoaded = this.webviewChecker?.getProjectInfo()?.loaded ?? false;

    let tools = this.toolRegistry.list();

    // Filter by category if specified
    if (category) {
      tools = tools.filter((t) => t.category === category);
    }

    const toolInfos: ToolInfo[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      parameters: tool.parameters,
      requiresConfirmation: tool.requiresConfirmation,
      // Timeline 工具：本地可执行的仅需 projectLoaded；其余仍需 webviewConnected
      available:
        tool.category !== 'timeline'
          ? true
          : webviewConnected || (projectLoaded && LOCAL_TIMELINE_TOOL_NAMES.has(tool.name as any)),
    }));

    this.sendJson(res, {
      success: true,
      data: {
        tools: toolInfos,
        total: toolInfos.length,
        webviewConnected,
      },
    });
  }

  /**
   * Handle get single tool
   */
  private async handleGetTool(
    res: http.ServerResponse,
    toolName: string
  ): Promise<void> {
    const tool = this.toolRegistry.get(toolName);

    if (!tool) {
      this.sendError(res, 404, `Tool '${toolName}' not found`, 'TOOL_NOT_FOUND');
      return;
    }

    const webviewConnected = this.webviewChecker?.isConnected() ?? false;
    const projectLoaded = this.webviewChecker?.getProjectInfo()?.loaded ?? false;

    this.sendJson(res, {
      success: true,
      data: {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
        requiresConfirmation: tool.requiresConfirmation,
        available:
          tool.category !== 'timeline'
            ? true
            : webviewConnected || (projectLoaded && LOCAL_TIMELINE_TOOL_NAMES.has(tool.name as any)),
      },
    });
  }

  /**
   * Handle execute tool
   */
  private async handleExecuteTool(
    res: http.ServerResponse,
    toolName: string,
    body: string
  ): Promise<void> {
    const tool = this.toolRegistry.get(toolName);

    if (!tool) {
      this.sendError(res, 404, `Tool '${toolName}' not found`, 'TOOL_NOT_FOUND');
      return;
    }

    const webviewConnected = this.webviewChecker?.isConnected() ?? false;
    const projectLoaded = this.webviewChecker?.getProjectInfo()?.loaded ?? false;

    // Timeline 工具：
    // - 本地可执行：只要 projectLoaded 就允许（无需 webviewConnected）
    // - UI-only/未迁移：仍要求 webviewConnected（或 headless webview）
    if (tool.category === 'timeline' && !webviewConnected) {
      const canRunLocally = projectLoaded && LOCAL_TIMELINE_TOOL_NAMES.has(tool.name as any);
      if (!canRunLocally) {
        const message = projectLoaded
          ? 'This timeline tool requires an active webview (render/export/UI-only).'
          : 'No project loaded. Use POST /api/v1/project/load or /api/v1/project/create first.';

        this.sendError(res, 503, message, projectLoaded ? 'WEBVIEW_NOT_CONNECTED' : 'PROJECT_NOT_LOADED');
        return;
      }
    }

    // Parse arguments
    let args: Record<string, unknown> = {};
    if (body) {
      try {
        args = JSON.parse(body);
      } catch {
        this.sendError(res, 400, 'Invalid JSON body', 'INVALID_JSON');
        return;
      }
    }

    // Execute tool
    try {
      const result = await this.toolRegistry.execute(toolName, args);
      this.sendJson(res, {
        success: result.success,
        data: result.data,
        error: result.error,
        duration: result.duration,
      });
    } catch (error) {
      this.sendError(res, 500, `Tool execution failed: ${error}`, 'EXECUTION_ERROR');
    }
  }

  /**
   * Handle project status
   */
  private async handleProjectStatus(res: http.ServerResponse): Promise<void> {
    const webviewConnected = this.webviewChecker?.isConnected() ?? false;
    const projectInfo = this.webviewChecker?.getProjectInfo() ?? null;

    this.sendJson(res, {
      success: true,
      data: {
        webviewConnected,
        project: projectInfo,
      },
    });
  }

  /**
   * Handle load project
   */
  private async handleLoadProject(
    res: http.ServerResponse,
    body: string
  ): Promise<void> {
    if (!this.projectLoader) {
      this.sendError(res, 503, 'Project loader not available', 'LOADER_NOT_AVAILABLE');
      return;
    }

    let path: string | undefined;
    if (body) {
      try {
        const data = JSON.parse(body);
        path = data.path;
      } catch {
        this.sendError(res, 400, 'Invalid JSON body', 'INVALID_JSON');
        return;
      }
    }

    if (!path) {
      this.sendError(res, 400, 'Project path is required', 'PATH_REQUIRED');
      return;
    }

    try {
      await this.projectLoader(path);
      this.sendJson(res, {
        success: true,
        data: { message: 'Project loaded', path },
      });
    } catch (error) {
      this.sendError(res, 500, `Failed to load project: ${error}`, 'LOAD_ERROR');
    }
  }

  /**
   * Handle create project
   */
  private async handleCreateProject(
    res: http.ServerResponse,
    body: string
  ): Promise<void> {
    if (!this.projectLoader) {
      this.sendError(res, 503, 'Project loader not available', 'LOADER_NOT_AVAILABLE');
      return;
    }

    let options: { width?: number; height?: number; fps?: number; duration?: number } = {};
    if (body) {
      try {
        options = JSON.parse(body);
      } catch {
        this.sendError(res, 400, 'Invalid JSON body', 'INVALID_JSON');
        return;
      }
    }

    try {
      // Create with no path = new empty project
      await this.projectLoader(undefined);
      this.sendJson(res, {
        success: true,
        data: { message: 'Empty project created', options },
      });
    } catch (error) {
      this.sendError(res, 500, `Failed to create project: ${error}`, 'CREATE_ERROR');
    }
  }

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  private sendJson(res: http.ServerResponse, data: ApiResponse): void {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(200);
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  private sendError(
    res: http.ServerResponse,
    status: number,
    message: string,
    code: string
  ): void {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.writeHead(status);
    res.end(
      JSON.stringify(
        {
          success: false,
          error: message,
          code,
        },
        null,
        2
      )
    );
  }
}
