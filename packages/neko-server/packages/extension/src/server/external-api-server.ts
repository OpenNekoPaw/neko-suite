/**
 * External API Server
 *
 * Unified manager for HTTP Server and Headless Webview.
 * Provides external access to UniEdit tools via REST API and MCP protocol.
 */

import * as vscode from 'vscode';
import type { IToolRegistry as ToolRegistry, ToolResult } from '@uniedit/agent';
import { UniEditHttpServer, type HttpServerConfig, type WebviewStatusChecker } from './http-server';
import { HeadlessWebviewManager } from './headless-webview';
import type { IProjectSessionService } from '../services/ProjectSessionService';

/**
 * External API Server configuration
 */
export interface ExternalAPIServerConfig {
  /** HTTP server configuration */
  http?: Partial<HttpServerConfig>;
  /** Whether to auto-start HTTP server */
  autoStart?: boolean;
  /** Whether to enable headless webview */
  enableHeadless?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ExternalAPIServerConfig = {
  http: {
    port: 9527,
    host: '127.0.0.1',
  },
  autoStart: true,
  enableHeadless: true,
};

/**
 * Webview status checker that combines editor webview and headless webview
 */
class CombinedWebviewChecker implements WebviewStatusChecker {
  constructor(
    private readonly getEditorWebview: () => vscode.Webview | null,
    private readonly headlessManager: HeadlessWebviewManager | null,
    private readonly projectSession: IProjectSessionService
  ) {}

  isConnected(): boolean {
    // Check editor webview first
    if (this.getEditorWebview() !== null) {
      return true;
    }
    // Fall back to headless webview
    return this.headlessManager?.isConnected() ?? false;
  }

  getProjectInfo(): { loaded: boolean; path?: string } | null {
    // Prefer ProjectSession (HTTP/外部调用的当前上下文)
    const sessionInfo = this.projectSession.getInfo();
    if (sessionInfo?.loaded) {
      return { loaded: true, path: sessionInfo.path };
    }

    // Prefer editor webview info
    const editorWebview = this.getEditorWebview();
    if (editorWebview) {
      // TODO: Get project info from editor
      return { loaded: true };
    }
    // Fall back to headless webview
    return this.headlessManager?.getProjectInfo() ?? null;
  }
}

/**
 * External API Server
 *
 * Manages:
 * - HTTP Server for REST API access
 * - Headless Webview for tool execution without open editor
 * - Integration with editor webviews
 */
export class ExternalAPIServer implements vscode.Disposable {
  private httpServer: UniEditHttpServer;
  private headlessManager: HeadlessWebviewManager | null = null;
  private config: ExternalAPIServerConfig;
  private disposables: vscode.Disposable[] = [];
  private getEditorWebview: () => vscode.Webview | null = () => null;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly context: vscode.ExtensionContext,
    private readonly projectSession: IProjectSessionService,
    config: Partial<ExternalAPIServerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create HTTP server
    this.httpServer = new UniEditHttpServer(toolRegistry, this.config.http);

    // Create headless webview manager if enabled
    if (this.config.enableHeadless) {
      this.headlessManager = new HeadlessWebviewManager(context);
      this.disposables.push(this.headlessManager);
    }

    // Set up webview checker
    const webviewChecker = new CombinedWebviewChecker(
      () => this.getEditorWebview(),
      this.headlessManager,
      this.projectSession
    );
    this.httpServer.setWebviewChecker(webviewChecker);

    // Set up project loader
    this.httpServer.setProjectLoader(async (path?: string) => {
      if (path) {
        await this.projectSession.load(path);
      } else {
        await this.projectSession.create();
      }
    });
  }

  /**
   * Set the function to get the active editor webview
   */
  setEditorWebviewGetter(getter: () => vscode.Webview | null): void {
    this.getEditorWebview = getter;
  }

  /**
   * Start the external API server
   */
  async start(): Promise<void> {
    try {
      await this.httpServer.start();

      // Show info message
      vscode.window.showInformationMessage(
        `UniEdit HTTP API available at ${this.httpServer.getUrl()}`
      );
    } catch (error) {
      console.error('[ExternalAPI] Failed to start HTTP server:', error);
      vscode.window.showErrorMessage(
        `Failed to start UniEdit HTTP API: ${error}`
      );
    }
  }

  /**
   * Stop the external API server
   */
  async stop(): Promise<void> {
    await this.httpServer.stop();
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.httpServer.isRunning();
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return this.httpServer.getUrl();
  }

  /**
   * Get headless webview manager
   */
  getHeadlessManager(): HeadlessWebviewManager | null {
    return this.headlessManager;
  }

  /**
   * Execute a tool (automatically uses editor webview or headless webview)
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.toolRegistry.get(toolName);

    if (!tool) {
      return { success: false, error: `Tool '${toolName}' not found` };
    }

    // Non-timeline tools can be executed directly
    if (tool.category !== 'timeline') {
      return this.toolRegistry.execute(toolName, args);
    }

    // Timeline tools：优先尝试 Extension 本地执行（无需 Webview）
    const localResult = await this.toolRegistry.execute(toolName, args);
    if (localResult.success) {
      return localResult;
    }

    // 若本地执行失败且当前无编辑器 Webview，则尝试回退到 Headless Webview（用于 UI-only/渲染类工具）
    const editorWebview = this.getEditorWebview();
    if (!editorWebview && this.headlessManager?.isConnected()) {
      return this.headlessManager.executeTool(toolName, args);
    }

    return localResult;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop().catch(console.error);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

/**
 * Create External API Server with VSCode configuration
 */
export function createExternalAPIServer(
  toolRegistry: ToolRegistry,
  context: vscode.ExtensionContext,
  projectSession: IProjectSessionService
): ExternalAPIServer {
  // Read configuration from VSCode settings
  const config = vscode.workspace.getConfiguration('uniedit.server');

  const serverConfig: ExternalAPIServerConfig = {
    http: {
      port: config.get('http.port', 9527),
      host: config.get('http.host', '127.0.0.1'),
    },
    autoStart: config.get('http.enabled', true),
    enableHeadless: config.get('headless.enabled', true),
  };

  return new ExternalAPIServer(toolRegistry, context, projectSession, serverConfig);
}
