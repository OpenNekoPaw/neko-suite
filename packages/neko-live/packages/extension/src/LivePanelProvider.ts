/**
 * LivePanelProvider — VSCode WebviewViewProvider for the Live Preview panel.
 *
 * Manages VMC receiver, puppet engine connection, recording service,
 * and routes messages between webview and backend services.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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

  // ─── Avatar Selection ───────────────────────────────────────────────────

  public async selectAvatar(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        [vscode.l10n.t('neko.live.avatar.filterAll')]: [
          'nkm',
          'nkp',
          'vrm',
          'glb',
          'gltf',
          'inp',
          'inx',
        ],
        [vscode.l10n.t('neko.live.avatar.filterProject')]: ['nkm', 'nkp'],
        [vscode.l10n.t('neko.live.avatar.filterVrm')]: ['vrm', 'glb', 'gltf'],
        [vscode.l10n.t('neko.live.avatar.filterPuppet')]: ['inp', 'inx'],
      },
      title: vscode.l10n.t('neko.live.avatar.selectTitle'),
    });

    if (!result?.[0]) return;
    await this.loadAvatarFromFile(result[0].fsPath);
  }

  /** Resolve project files (.nkm/.nkp) to actual model paths, then load */
  private async loadAvatarFromFile(filePath: string): Promise<void> {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

    switch (ext) {
      case 'nkm': {
        // .nkm project → read model.src relative path
        const modelPath = await this.resolveNkmModelPath(filePath);
        if (modelPath) {
          this.loadVrmAvatar(modelPath);
        }
        break;
      }
      case 'nkp': {
        // .nkp project → read puppet.src relative path
        const puppetPath = await this.resolveNkpPuppetPath(filePath);
        if (puppetPath) {
          await this.loadPuppet(puppetPath);
        }
        break;
      }
      case 'inp':
      case 'inx':
        await this.loadPuppet(filePath);
        break;
      default:
        // .vrm, .glb, .gltf — load directly as VRM
        this.loadVrmAvatar(filePath);
        break;
    }
  }

  private loadVrmAvatar(filePath: string): void {
    const uri = vscode.Uri.file(filePath);
    const webviewUri = this.view?.webview.asWebviewUri(uri);
    if (webviewUri) {
      this.postMessage({ type: 'avatarSelected', uri: webviewUri.toString(), avatarType: 'vrm' });
    }
  }

  /** Read .nkm JSON and resolve model.src to absolute path */
  private async resolveNkmModelPath(nkmPath: string): Promise<string | undefined> {
    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(nkmPath));
      const json = JSON.parse(Buffer.from(data).toString('utf-8')) as {
        model?: { src?: string | null };
      };
      const src = json.model?.src;
      if (!src) {
        vscode.window.showWarningMessage(vscode.l10n.t('neko.live.avatar.noModelSrc'));
        return undefined;
      }
      return path.resolve(path.dirname(nkmPath), src);
    } catch (err) {
      this.logger.error('Failed to read .nkm project', err);
      vscode.window.showErrorMessage(
        vscode.l10n.t('neko.live.avatar.projectReadFailed', (err as Error).message),
      );
      return undefined;
    }
  }

  /** Read .nkp JSON and resolve puppet.src to absolute path */
  private async resolveNkpPuppetPath(nkpPath: string): Promise<string | undefined> {
    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(nkpPath));
      const json = JSON.parse(Buffer.from(data).toString('utf-8')) as {
        puppet?: { src?: string | null };
      };
      const src = json.puppet?.src;
      if (!src) {
        vscode.window.showWarningMessage(vscode.l10n.t('neko.live.avatar.noPuppetSrc'));
        return undefined;
      }
      return path.resolve(path.dirname(nkpPath), src);
    } catch (err) {
      this.logger.error('Failed to read .nkp project', err);
      vscode.window.showErrorMessage(
        vscode.l10n.t('neko.live.avatar.projectReadFailed', (err as Error).message),
      );
      return undefined;
    }
  }

  // ─── VMC Tracking ───────────────────────────────────────────────────────

  public startVmc(): void {
    const port = vscode.workspace.getConfiguration('neko.live').get<number>('vmcPort', 39539);
    this.stopVmc();

    this.vmcReceiver = new VmcReceiver(port, this.logger);

    this.vmcReceiver.on('tracking', (data) => {
      this.postMessage({ type: 'vmcTrackingData', data });
    });

    this.vmcReceiver.on('error', (err) => {
      vscode.window.showErrorMessage(vscode.l10n.t('neko.live.vmcError', err.message));
    });

    this.vmcReceiver.on('started', () => {
      this.postMessage({ type: 'trackingStatus', mode: 'vmc', active: true });
    });

    this.vmcReceiver.on('stopped', () => {
      this.postMessage({ type: 'trackingStatus', mode: 'vmc', active: false });
    });

    this.vmcReceiver.start().catch((err: Error) => {
      this.logger.error('Failed to start VMC receiver', err);
      vscode.window.showErrorMessage(
        vscode.l10n.t('neko.live.vmcStartFailed', String(port), err.message),
      );
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
      vscode.window.showErrorMessage(vscode.l10n.t('neko.live.engineNotAvailable'));
      return;
    }

    try {
      const data = fs.readFileSync(filePath);
      await client.loadPuppet(data.buffer as ArrayBuffer);

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

      this.postMessage({ type: 'avatarSelected', uri: filePath, avatarType: 'puppet' });
      this.startPuppetStream(client);
      this.logger.info(vscode.l10n.t('neko.live.puppetLoaded', filePath));
    } catch (err) {
      this.logger.error('Failed to load puppet', err);
      vscode.window.showErrorMessage(
        vscode.l10n.t('neko.live.puppetLoadFailed', (err as Error).message),
      );
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

    await this.recordingService.stop();
    // Video blob will arrive separately via 'videoRecordingBlob' message from webview
    this.recordingService = undefined;
  }

  // ─── Video Blob Save ─────────────────────────────────────────────────────

  private async saveVideoBlob(dataUrl: string, mimeType: string): Promise<void> {
    try {
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
      const dir = await this.getRecordingDir();
      const filePath = vscode.Uri.joinPath(
        vscode.Uri.file(dir),
        `live-video-${Date.now()}.${ext}`,
      ).fsPath;

      const base64 = dataUrl.split(',')[1];
      if (!base64) return;

      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(filePath, buffer);

      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
      this.logger.info(vscode.l10n.t('neko.live.recording.videoSaved', filePath, sizeMB));
      this.postMessage({ type: 'recordingStopped', filePath });
    } catch (err) {
      this.logger.error(vscode.l10n.t('neko.live.recording.videoSaveFailed'), err);
    }
  }

  private async getRecordingDir(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.[0]) {
      const dir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.neko', 'recordings');
      await vscode.workspace.fs.createDirectory(dir);
      return dir.fsPath;
    }
    const os = await import('os');
    return os.tmpdir();
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

          case 'videoRecordingBlob':
            await this.saveVideoBlob(message.dataUrl as string, message.mimeType as string);
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
