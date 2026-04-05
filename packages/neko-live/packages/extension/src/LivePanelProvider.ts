/**
 * LivePanelProvider — VSCode WebviewViewProvider for the Live Preview panel.
 *
 * Manages VMC receiver, puppet engine connection, recording service,
 * and routes messages between webview and backend services.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import type { ILogger } from '@neko/shared';
import { EngineClient } from '@neko/neko-client';
import { VmcReceiver } from './vmc/VmcReceiver';
import { RecordingService } from './RecordingService';

export class LivePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.livePreview';

  private view?: vscode.WebviewView;
  private vmcReceiver?: VmcReceiver;
  private engineClient?: EngineClient;
  private recordingService?: RecordingService;
  private puppetStreamWs?: { close: () => void };
  private readonly disposables: vscode.Disposable[] = [];
  private readonly logger: ILogger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    logger: ILogger,
  ) {
    this.logger = logger.child('LivePanel');
  }

  // ─── WebviewViewProvider ────────────────────────────────────────────────

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? []),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    this.setupMessageHandlers(webviewView.webview);

    webviewView.onDidDispose(
      () => {
        this.stopVmc();
        this.closePuppetStream();
        this.recordingService?.dispose();
      },
      null,
      this.disposables,
    );

    this.logger.debug('Webview resolved');
  }

  // ─── Public API (for commands) ──────────────────────────────────────────

  public async selectAvatar(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        'All Avatars': ['vrm', 'glb', 'gltf', 'inp', 'inx'],
        'VRM Models': ['vrm', 'glb', 'gltf'],
        'Puppet Models': ['inp', 'inx'],
      },
      title: 'Select Avatar Model',
    });

    if (!result?.[0]) return;

    const filePath = result[0].fsPath;
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const isPuppet = ext === 'inp' || ext === 'inx';
    const avatarType = isPuppet ? 'puppet' : 'vrm';

    if (isPuppet) {
      await this.loadPuppet(filePath);
    } else {
      const webviewUri = this.view?.webview.asWebviewUri(result[0]);
      if (webviewUri) {
        this.postMessage({ type: 'avatarSelected', uri: webviewUri.toString(), avatarType });
      }
    }
  }

  public startVmc(): void {
    const port = vscode.workspace.getConfiguration('neko.live').get<number>('vmcPort', 39539);
    this.stopVmc();

    this.vmcReceiver = new VmcReceiver(port, this.logger);

    this.vmcReceiver.on('tracking', (data) => {
      this.postMessage({ type: 'vmcTrackingData', data });
    });

    this.vmcReceiver.on('error', (err) => {
      vscode.window.showErrorMessage(`VMC receiver error: ${err.message}`);
    });

    this.vmcReceiver.on('started', () => {
      this.postMessage({ type: 'trackingStatus', mode: 'vmc', active: true });
    });

    this.vmcReceiver.on('stopped', () => {
      this.postMessage({ type: 'trackingStatus', mode: 'vmc', active: false });
    });

    this.vmcReceiver.start().catch((err: Error) => {
      this.logger.error('Failed to start VMC receiver', err);
      vscode.window.showErrorMessage(`Failed to start VMC on port ${port}: ${err.message}`);
    });
  }

  public stopVmc(): void {
    if (this.vmcReceiver) {
      this.vmcReceiver.stop();
      this.vmcReceiver = undefined;
    }
  }

  // ─── Puppet Management ──────────────────────────────────────────────────

  private async loadPuppet(filePath: string): Promise<void> {
    const client = await this.ensureEngineClient();
    if (!client) {
      vscode.window.showErrorMessage('Engine not available. Cannot load puppet.');
      return;
    }

    try {
      const data = fs.readFileSync(filePath);
      await client.loadPuppet(data.buffer as ArrayBuffer);

      // Get puppet parameters for webview
      const params = await client.getPuppetParameters();
      this.postMessage({
        type: 'puppetLoaded',
        parameters: params as {
          name: string;
          min: number;
          max: number;
          default: number;
          current: number;
        }[],
      });

      // Notify webview of puppet avatar
      this.postMessage({
        type: 'avatarSelected',
        uri: filePath,
        avatarType: 'puppet',
      });

      // Start puppet stream
      this.startPuppetStream(client);

      this.logger.info(`Puppet loaded: ${filePath}`);
    } catch (err) {
      this.logger.error('Failed to load puppet', err);
      vscode.window.showErrorMessage(`Failed to load puppet: ${(err as Error).message}`);
    }
  }

  private startPuppetStream(client: EngineClient): void {
    this.closePuppetStream();

    const ws = client.openPuppetStream();

    ws.onmessage = (event: { data: unknown }) => {
      try {
        const delta = JSON.parse(event.data as string);
        this.postMessage({ type: 'puppetDelta', delta });
      } catch {
        // Ignore parse errors on binary frames
      }
    };

    ws.onerror = () => {
      this.logger.error('Puppet stream error');
    };

    ws.onclose = () => {
      this.logger.debug('Puppet stream closed');
    };

    this.puppetStreamWs = ws as { close: () => void };
    this.logger.info('Puppet stream started');
  }

  private closePuppetStream(): void {
    if (this.puppetStreamWs) {
      this.puppetStreamWs.close();
      this.puppetStreamWs = undefined;
    }
  }

  // ─── Recording ──────────────────────────────────────────────────────────

  public async startRecording(includeAudio: boolean): Promise<void> {
    const client = await this.ensureEngineClient();

    this.recordingService = new RecordingService(
      client,
      (elapsedMs) => this.postMessage({ type: 'recordingProgress', elapsedMs }),
      this.logger,
    );

    await this.recordingService.start({ includeAudio });
    this.postMessage({ type: 'recordingStarted' });
  }

  public async stopRecording(): Promise<void> {
    if (!this.recordingService) return;

    const result = await this.recordingService.stop();
    const filePath = result.audioPath ?? result.videoPath ?? '';
    this.postMessage({ type: 'recordingStopped', filePath });
    this.recordingService = undefined;
  }

  // ─── Engine Client ──────────────────────────────────────────────────────

  private async ensureEngineClient(): Promise<EngineClient | undefined> {
    if (this.engineClient) return this.engineClient;

    try {
      const result = await vscode.commands.executeCommand<{ port: number }>(
        'neko.engine.ensureFrameServer',
      );
      if (result) {
        this.engineClient = new EngineClient(result.port);
        return this.engineClient;
      }
    } catch (err) {
      this.logger.error('Failed to connect to engine', err);
    }
    return undefined;
  }

  // ─── Message Routing ────────────────────────────────────────────────────

  private setupMessageHandlers(webview: vscode.Webview): void {
    webview.onDidReceiveMessage(
      async (message: { type: string; [key: string]: unknown }) => {
        switch (message.type) {
          case 'ready':
            this.logger.debug('Webview ready');
            break;

          case 'startVmcReceiver':
            this.startVmc();
            break;

          case 'stopVmcReceiver':
            this.stopVmc();
            break;

          case 'selectAvatar':
            await this.selectAvatar();
            break;

          case 'setTrackingMode': {
            const mode = message.mode as string;
            this.logger.info(`Tracking mode set to: ${mode}`);
            break;
          }

          case 'setPuppetParam': {
            const client = await this.ensureEngineClient();
            if (client) {
              await client.setPuppetParameter(message.name as string, message.value as number);
            }
            break;
          }

          case 'startRecording':
            await this.startRecording(message.includeAudio as boolean);
            break;

          case 'stopRecording':
            await this.stopRecording();
            break;

          default:
            this.logger.warn(`Unknown message type: ${message.type}`);
        }
      },
      undefined,
      this.disposables,
    );
  }

  private postMessage(msg: unknown): void {
    this.view?.webview.postMessage(msg);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const locale = vscode.env.language;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'index.css'),
    );

    return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; img-src ${webview.cspSource} https: data: blob:; media-src ${webview.cspSource} https: data:; connect-src ws://127.0.0.1:* http://127.0.0.1:*; worker-src blob:;">
  <title>Neko Live</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    this.stopVmc();
    this.closePuppetStream();
    this.recordingService?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
