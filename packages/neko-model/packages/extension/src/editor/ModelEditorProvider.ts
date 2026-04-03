import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import { ModelDocument } from './ModelDocument';

const logger = new ConsoleLogger('ModelEditorProvider', LogLevel.Info);

/**
 * Custom editor provider for 3D model files (.gltf, .glb, .vrm)
 *
 * Manages the lifecycle of:
 * - Webview panel (R3F 3D viewport)
 * - EngineClient connection (Rust backend for scene ECS)
 * - Bidirectional message passing between webview and engine
 */
export class ModelEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'neko.modelEditor';

  private activeWebviewPanel: vscode.WebviewPanel | undefined;
  private engineClient: EngineClient | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this.activeWebviewPanel = webviewPanel;

    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ...workspaceFolders,
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document.uri);

    webviewPanel.webview.onDidReceiveMessage(
      (msg) => this.handleWebviewMessage(msg, webviewPanel, document),
      undefined,
      this.context.subscriptions,
    );

    webviewPanel.onDidDispose(() => {
      if (this.activeWebviewPanel === webviewPanel) {
        this.activeWebviewPanel = undefined;
      }
    });

    // Try to connect to engine backend
    await this.ensureEngineClient();
  }

  /**
   * Forward keyboard action to active webview
   */
  postKeyboardAction(action: string): void {
    this.activeWebviewPanel?.webview.postMessage({
      type: 'keyboardAction',
      action,
    });
  }

  /**
   * Ensure EngineClient is connected to the Rust backend.
   * Falls back gracefully — webview works standalone (R3F only) without engine.
   */
  private async ensureEngineClient(): Promise<EngineClient | undefined> {
    if (this.engineClient) {
      return this.engineClient;
    }

    try {
      const result = await vscode.commands.executeCommand<{ port: number }>(
        'neko.engine.ensureFrameServer',
      );
      if (result) {
        this.engineClient = new EngineClient(result.port);
      }
    } catch {
      // Engine extension not installed or not running — standalone mode
    }

    return this.engineClient;
  }

  private async handleWebviewMessage(
    message: { type: string; [key: string]: unknown },
    webviewPanel: vscode.WebviewPanel,
    document: vscode.CustomDocument,
  ): Promise<void> {
    switch (message.type) {
      case 'ready': {
        const filePath = document.uri.fsPath;
        const isProject = filePath.endsWith('.nkm');

        if (isProject) {
          // Load .nkm project file via engine backend
          await this.loadProjectInEngine(filePath, webviewPanel);
        } else {
          // Send model file URI to webview for R3F direct loading
          const modelUri = webviewPanel.webview.asWebviewUri(document.uri);
          webviewPanel.webview.postMessage({
            type: 'loadModel',
            uri: modelUri.toString(),
            filePath,
          });

          // Also load in engine backend if available
          await this.loadModelInEngine(filePath, webviewPanel);
        }
        break;
      }

      case 'requestEnginePort': {
        const client = await this.ensureEngineClient();
        if (client) {
          webviewPanel.webview.postMessage({
            type: 'enginePort',
            port: client.port,
          });
        }
        break;
      }

      case 'updateTransform': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        const { nodeId, position, rotation, scale } = message as {
          type: string;
          nodeId: string;
          position: [number, number, number];
          rotation: [number, number, number, number];
          scale: [number, number, number];
        };

        try {
          await client.updateSceneTransform(nodeId, position, rotation, scale);
        } catch (err) {
          this.logError('updateTransform', err);
        }
        break;
      }

      case 'playAnimation': {
        // Animation playback is handled client-side by R3F useAnimations.
        // Engine backend tick is optional for future server-side animation.
        break;
      }

      case 'pauseAnimation':
      case 'stopAnimation': {
        // Handled client-side
        break;
      }

      case 'createShape': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const snapshot = await client.createShape(
            message.shapeType as string,
            message.params as Record<string, number>,
          );
          webviewPanel.webview.postMessage({ type: 'sceneSnapshot', snapshot });
        } catch (err) {
          this.logError('createShape', err);
        }
        break;
      }

      case 'createTextMesh': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const snapshot = await client.createTextMesh(
            message.text as string,
            message.fontSize as number,
            message.extrusionDepth as number,
          );
          webviewPanel.webview.postMessage({ type: 'sceneSnapshot', snapshot });
        } catch (err) {
          this.logError('createTextMesh', err);
        }
        break;
      }

      case 'csgBoolean': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const snapshot = await client.csgBoolean(
            message.entityA as string,
            message.entityB as string,
            message.operation as 'union' | 'difference' | 'intersection',
          );
          webviewPanel.webview.postMessage({ type: 'sceneSnapshot', snapshot });
        } catch (err) {
          this.logError('csgBoolean', err);
        }
        break;
      }

      case 'updateBoneTransform': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.updateSceneTransform(
            message.nodeId as string,
            [0, 0, 0], // position unchanged
            message.rotation as [number, number, number, number],
            [1, 1, 1], // scale unchanged
          );
        } catch (err) {
          this.logError('updateBoneTransform', err);
        }
        break;
      }

      case 'latency:test': {
        // Latency test: forward to engine and echo back response
        const client = await this.ensureEngineClient();
        if (!client) {
          // No engine available, just echo back immediately
          webviewPanel.webview.postMessage({
            type: 'latency:response',
            timestamp: message.timestamp,
          });
          break;
        }

        try {
          // Call engine latency_test action
          await client.dispatch({
            group: 'scenes',
            action: 'latency_test',
            options: {},
          });
          // Echo back to webview
          webviewPanel.webview.postMessage({
            type: 'latency:response',
            timestamp: message.timestamp,
          });
        } catch (err) {
          this.logError('latency_test', err);
          // Still echo back even on error
          webviewPanel.webview.postMessage({
            type: 'latency:response',
            timestamp: message.timestamp,
          });
        }
        break;
      }

      case 'exportGlb': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const result = await client.exportGlb();
          // Decode base64 and write to file
          const saveUri = await vscode.window.showSaveDialog({
            filters: { 'GLB Files': ['glb'] },
            defaultUri: vscode.Uri.file(document.uri.fsPath.replace(/\.[^.]+$/, '.glb')),
          });
          if (saveUri) {
            const binaryStr = Buffer.from(result.data, 'base64');
            await vscode.workspace.fs.writeFile(saveUri, binaryStr);
            webviewPanel.webview.postMessage({
              type: 'exportComplete',
              success: true,
              filePath: saveUri.fsPath,
            });
          }
        } catch (err) {
          this.logError('exportGlb', err);
          webviewPanel.webview.postMessage({
            type: 'exportComplete',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case 'saveProject': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const saveUri = await vscode.window.showSaveDialog({
            filters: { 'Neko Model Project': ['nkm'] },
            defaultUri: vscode.Uri.file(document.uri.fsPath.replace(/\.[^.]+$/, '.nkm')),
          });
          if (saveUri) {
            await client.saveProject(saveUri.fsPath, message.editorState);
            webviewPanel.webview.postMessage({
              type: 'projectSaved',
              success: true,
              filePath: saveUri.fsPath,
            });
          }
        } catch (err) {
          this.logError('saveProject', err);
          webviewPanel.webview.postMessage({
            type: 'projectSaved',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      // ── Keyframe CRUD ──

      case 'requestKeyframeTracks': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const tracks = await client.getSceneKeyframeTracks(message.clipName as string);
          webviewPanel.webview.postMessage({ type: 'keyframeTracks', tracks });
        } catch (err) {
          this.logError('requestKeyframeTracks', err);
        }
        break;
      }

      case 'addKeyframe': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          const result = await client.addSceneKeyframe(
            message.clipName as string,
            message.nodeId as string,
            message.property as string,
            message.timestamp as number,
            message.values as number[],
          );
          webviewPanel.webview.postMessage({
            type: 'keyframeAdded',
            trackProperty: `${message.nodeId as string}.${message.property as string}`,
            keyframeId: result.id,
          });
        } catch (err) {
          this.logError('addKeyframe', err);
        }
        break;
      }

      case 'removeKeyframe': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.removeSceneKeyframe(
            message.clipName as string,
            message.keyframeId as string,
          );
          webviewPanel.webview.postMessage({
            type: 'keyframeRemoved',
            trackProperty: '',
            keyframeId: message.keyframeId as string,
          });
        } catch (err) {
          this.logError('removeKeyframe', err);
        }
        break;
      }

      case 'updateKeyframe': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.updateSceneKeyframe(
            message.clipName as string,
            message.keyframeId as string,
            {
              timestamp: message.timestamp as number | undefined,
              values: message.values as number[] | undefined,
              easing: message.easing as string | undefined,
            },
          );
        } catch (err) {
          this.logError('updateKeyframe', err);
        }
        break;
      }

      case 'createClip': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.createSceneClip(message.name as string, message.duration as number);
        } catch (err) {
          this.logError('createClip', err);
        }
        break;
      }

      case 'crossfadeAnimation': {
        const client = await this.ensureEngineClient();
        if (!client) break;

        try {
          await client.crossfadeSceneAnimation(
            message.clipName as string,
            message.fadeDuration as number,
            (message.loop as boolean | undefined) ?? false,
          );
        } catch (err) {
          this.logError('crossfadeAnimation', err);
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * Load a model file into the Rust ECS backend and send the snapshot to webview.
   */
  private async loadModelInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const client = await this.ensureEngineClient();
    if (!client) return;

    try {
      const data = await client.loadModel(filePath);
      webviewPanel.webview.postMessage({
        type: 'sceneSnapshot',
        snapshot: data,
      });
    } catch (err) {
      this.logError('loadModel', err);
    }
  }

  /**
   * Load a .nkm project file via the engine backend and send snapshot + editor state to webview.
   */
  private async loadProjectInEngine(
    filePath: string,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const client = await this.ensureEngineClient();
    if (!client) return;

    try {
      const result = await client.loadProject(filePath);
      webviewPanel.webview.postMessage({
        type: 'projectLoaded',
        snapshot: result.snapshot,
        editorState: result.editorState,
      });
    } catch (err) {
      this.logError('loadProject', err);
    }
  }

  private logError(action: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${action} failed`, msg);
  }

  private getHtmlForWebview(webview: vscode.Webview, documentUri: vscode.Uri): string {
    const webviewDistUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
    );
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data: blob: https:;
             connect-src ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${webviewDistUri}/assets/index.css">
  <title>3D Model Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.documentUri = "${documentUri.toString()}";</script>
  <script nonce="${nonce}" type="module" src="${webviewDistUri}/assets/index.js"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
