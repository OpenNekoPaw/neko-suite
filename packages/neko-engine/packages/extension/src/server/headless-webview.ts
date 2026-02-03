/**
 * Headless Webview Manager
 *
 * Manages a hidden WebviewPanel for executing timeline tools
 * when no editor is open. Uses retainContextWhenHidden to keep
 * the webview active in the background.
 */

import * as vscode from 'vscode';
import type { IToolRegistry as ToolRegistry, ToolResult } from '@neko/agent';
import type { WebviewStatusChecker } from './http-server';

/**
 * Pending tool request
 */
interface PendingRequest {
  resolve: (result: ToolResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Project info from webview
 */
interface ProjectInfo {
  loaded: boolean;
  path?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
}

/**
 * Headless Webview Manager
 *
 * Creates and manages a hidden WebviewPanel that can execute
 * timeline tools without requiring a visible editor.
 */
export class HeadlessWebviewManager implements WebviewStatusChecker, vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private webview: vscode.Webview | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestIdCounter = 0;
  private projectInfo: ProjectInfo | null = null;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  private readonly defaultTimeout = 30000; // 30 seconds

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Initialize the headless webview
   */
  async initialize(): Promise<void> {
    if (this.panel) {
      return;
    }

    // Create ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    // Create hidden webview panel
    this.panel = vscode.window.createWebviewPanel(
      'uniedit.headless',
      'UniEdit (Headless)',
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
          ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) || []),
        ],
      }
    );

    this.webview = this.panel.webview;

    // Set up message handling
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.context.subscriptions
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => {
      this.panel = null;
      this.webview = null;
      this.ready = false;
      this.projectInfo = null;

      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Webview disposed'));
      }
      this.pendingRequests.clear();
    });

    // Set HTML content
    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    // Wait for ready signal
    await this.readyPromise;

    console.log('[HeadlessWebview] Initialized and ready');
  }

  /**
   * Create an empty project in the headless webview
   */
  async createProject(options?: {
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
  }): Promise<void> {
    await this.ensureInitialized();

    const defaults = {
      width: options?.width || 1920,
      height: options?.height || 1080,
      fps: options?.fps || 30,
      duration: options?.duration || 60,
    };

    // Send create project message
    this.webview!.postMessage({
      type: 'createProject',
      defaults,
    });

    // Wait for confirmation
    await this.waitForProjectLoaded();
  }

  /**
   * Load a project file in the headless webview
   */
  async loadProject(path: string): Promise<void> {
    await this.ensureInitialized();

    // Read project file
    const uri = vscode.Uri.file(path);
    const content = await vscode.workspace.fs.readFile(uri);
    const projectData = JSON.parse(content.toString());

    // Send load project message
    this.webview!.postMessage({
      type: 'update',
      content: projectData,
    });

    // Wait for confirmation
    await this.waitForProjectLoaded();

    this.projectInfo = {
      loaded: true,
      path,
      width: projectData.defaults?.width,
      height: projectData.defaults?.height,
      fps: projectData.defaults?.fps,
      duration: projectData.duration,
    };
  }

  /**
   * Execute a tool via the headless webview
   */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    await this.ensureInitialized();

    if (!this.projectInfo?.loaded) {
      return {
        success: false,
        error: 'No project loaded. Call createProject() or loadProject() first.',
      };
    }

    const requestId = `headless-${++this.requestIdCounter}-${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Tool execution timeout' });
      }, this.defaultTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      this.webview!.postMessage({
        type: 'tool.execute',
        requestId,
        toolName,
        params: args,
      });
    });
  }

  /**
   * Check if webview is connected and ready
   */
  isConnected(): boolean {
    return this.ready && this.panel !== null;
  }

  /**
   * Get current project info
   */
  getProjectInfo(): ProjectInfo | null {
    return this.projectInfo;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  /**
   * Ensure webview is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.panel) {
      await this.initialize();
    }
    if (!this.ready) {
      await this.readyPromise;
    }
  }

  /**
   * Wait for project to be loaded
   */
  private waitForProjectLoaded(): Promise<void> {
    return new Promise((resolve) => {
      const checkLoaded = () => {
        if (this.projectInfo?.loaded) {
          resolve();
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      setTimeout(checkLoaded, 100);
    });
  }

  /**
   * Handle messages from webview
   */
  private handleMessage(message: unknown): void {
    const msg = message as Record<string, unknown>;

    switch (msg.type) {
      case 'ready':
        this.ready = true;
        this.readyResolve?.();
        console.log('[HeadlessWebview] Webview ready');
        break;

      case 'projectLoaded':
        this.projectInfo = {
          loaded: true,
          width: msg.width as number,
          height: msg.height as number,
          fps: msg.fps as number,
          duration: msg.duration as number,
        };
        console.log('[HeadlessWebview] Project loaded:', this.projectInfo);
        break;

      case 'tool.result':
        const requestId = msg.requestId as string;
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);
          if (msg.success) {
            pending.resolve({ success: true, data: msg.result });
          } else {
            pending.resolve({ success: false, error: msg.error as string });
          }
        }
        break;

      case 'error':
        console.error('[HeadlessWebview] Error:', msg.error);
        break;

      default:
        // Ignore other messages
        break;
    }
  }

  /**
   * Generate HTML for the headless webview
   */
  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        'webview',
        'assets',
        'index.js'
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        'dist',
        'webview',
        'assets',
        'style.css'
      )
    );

    const nonce = getNonce();
    const locale = vscode.env.language || 'en';

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}" data-headless="true">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; worker-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data: blob: https:; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https: data: blob:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>UniEdit - Headless</title>
  <style>
    /* Hide UI in headless mode */
    body[data-headless="true"] #root {
      visibility: hidden;
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
  </style>
</head>
<body data-headless="true">
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/**
 * Generate a random nonce
 */
function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
