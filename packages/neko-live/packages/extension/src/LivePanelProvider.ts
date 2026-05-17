/**
 * LivePanelProvider — VSCode WebviewViewProvider for the Live Preview panel.
 *
 * Manages VMC receiver, puppet engine connection, recording service,
 * and routes messages between webview and backend services.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DeviceInfo,
  DevicePermissionRequest,
  DevicePermissionState,
  DeviceType,
  ILogger,
  TrackingServiceApi,
} from '@neko/shared';
import { EngineClient } from '@neko/neko-client/EngineClient';
import { EngineDeviceManager, type DeviceManager } from '@neko/neko-client/device';
import { LiveSessionService } from './LiveSessionService';
import { LiveRepresentationService } from './LiveRepresentationService';
import { handleError } from './utils/errorHandler';

export class LivePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neko.livePreview';

  private view?: vscode.WebviewView;
  private engineClient?: EngineClient;
  private deviceManager?: DeviceManager;
  private readonly sessionService: LiveSessionService;
  private readonly representationService?: LiveRepresentationService;
  private puppetStreamWs?: { close: () => void };
  private readonly disposables: vscode.Disposable[] = [];
  private readonly logger: ILogger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    logger: ILogger,
    private readonly trackingService: TrackingServiceApi,
  ) {
    this.logger = logger.child('LivePanel');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.representationService = workspaceRoot
      ? new LiveRepresentationService({
          workspaceRoot,
          getAssetsApi: () =>
            vscode.extensions.getExtension('neko.neko-assets')?.exports as
              | import('@neko/shared').NekoAssetsAPI
              | undefined,
        })
      : undefined;
    this.sessionService = new LiveSessionService({
      logger: this.logger,
      getEngineClient: () => this.ensureEngineClient(),
      getDeviceManager: () => this.deviceManager,
      ensureDeviceManager: () => this.ensureDeviceManager(),
    });
    this.disposables.push(
      this.sessionService.onDidChange((event) => {
        if (event.type === 'recordingProgress') {
          this.postMessage({ type: 'recordingProgress', elapsedMs: event.elapsedMs });
        } else if (event.type === 'deviceBindingChanged') {
          this.postMessage({
            type: 'deviceBindingChanged',
            role: event.role,
            binding: event.binding,
          });
        }
      }),
      this.toVSCodeDisposable(
        this.trackingService.onTrackingData((data) => {
          this.postMessage({ type: 'vmcTrackingData', data });
        }),
      ),
      this.toVSCodeDisposable(
        this.trackingService.onStatusChange((status) => {
          if (status.errorMessage) {
            void handleError(new Error(status.errorMessage), { showToUser: true });
          }
          this.postMessage({
            type: 'trackingStatus',
            mode: status.source,
            active: status.active,
          });
        }),
      ),
    );
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
        void this.stopCameraCapture();
        this.closePuppetStream();
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

  public async selectCreativeEntity(): Promise<void> {
    if (!this.representationService) {
      void handleError(new Error('Open a workspace before selecting a creative entity.'), {
        showToUser: true,
        severity: 'warning',
      });
      return;
    }

    const entities = await this.representationService.listCharacters();
    const picked = await vscode.window.showQuickPick(
      entities.map((entity) => ({
        label: entity.displayName ?? entity.canonicalName,
        description: entity.id,
        detail: entity.status,
        entity,
      })),
      {
        title: 'Select Live creative entity',
        placeHolder: 'Live will use live3d → live2d and will not fall back to portrait',
      },
    );
    if (!picked) return;

    const avatar = await this.representationService.resolveAvatar(picked.entity.id);
    if (avatar.status === 'missing-representation') {
      const action = await vscode.window.showWarningMessage(
        `${picked.label} has no Live2D/Live3D representation.`,
        'Generate',
        'Import',
        'Bind Existing',
      );
      if (action === 'Generate' || action === 'Import' || action === 'Bind Existing') {
        await vscode.commands.executeCommand('neko.assets.importFile');
      }
      return;
    }

    if (avatar.avatarPath) {
      await this.loadAvatarFromFile(avatar.avatarPath);
      return;
    }

    void handleError(
      new Error(`Resolved ${picked.label}, but no loadable avatar file was found in the package.`),
      { showToUser: true, severity: 'warning' },
    );
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
      this.sessionService.updateScene({
        avatarUri: webviewUri.toString(),
        avatarType: 'vrm',
      });
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
        void handleError(new Error(vscode.l10n.t('neko.live.avatar.noModelSrc')), {
          showToUser: true,
          severity: 'warning',
        });
        return undefined;
      }
      return path.resolve(path.dirname(nkmPath), src);
    } catch (err) {
      this.logger.error('Failed to read .nkm project', err);
      void handleError(err instanceof Error ? err : new Error(String(err)), { showToUser: true });
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
        void handleError(new Error(vscode.l10n.t('neko.live.avatar.noPuppetSrc')), {
          showToUser: true,
          severity: 'warning',
        });
        return undefined;
      }
      return path.resolve(path.dirname(nkpPath), src);
    } catch (err) {
      this.logger.error('Failed to read .nkp project', err);
      void handleError(err instanceof Error ? err : new Error(String(err)), { showToUser: true });
      return undefined;
    }
  }

  // ─── VMC Tracking ───────────────────────────────────────────────────────

  public startVmc(): void {
    const port = vscode.workspace.getConfiguration('neko.live').get<number>('vmcPort', 39539);
    this.sessionService.updateScene({ trackingMode: 'vmc' });
    this.trackingService.start({ source: 'vmc', port }).catch((err: Error) => {
      this.logger.error('Failed to start VMC tracking', err);
      void handleError(err, { showToUser: true });
    });
  }

  public stopVmc(): void {
    this.trackingService.stop('vmc').catch((err: Error) => {
      this.logger.error('Failed to stop VMC tracking', err);
    });
  }

  // ─── Puppet Management ──────────────────────────────────────────────────

  private async loadPuppet(filePath: string): Promise<void> {
    const client = await this.ensureEngineClient();
    if (!client) {
      void handleError(new Error(vscode.l10n.t('neko.live.engineNotAvailable')), {
        showToUser: true,
      });
      return;
    }

    try {
      await client.loadPuppetSource(filePath);

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
      this.sessionService.updateScene({ avatarUri: filePath, avatarType: 'puppet' });
      this.startPuppetStream(client);
      this.logger.info(vscode.l10n.t('neko.live.puppetLoaded', filePath));
    } catch (err) {
      this.logger.error('Failed to load puppet', err);
      void handleError(err instanceof Error ? err : new Error(String(err)), { showToUser: true });
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

  /**
   * Start audio recording (called after webview confirms canvas capture is active).
   * Video capture runs in webview; audio capture runs via engine.
   */
  public async startRecording(includeAudio: boolean): Promise<void> {
    await this.sessionService.startRecording({ includeAudio });
    // Note: webview already set recording state before sending this message
  }

  /**
   * Stop audio recording (called after webview has stopped canvas capture and sent blob).
   */
  public async stopRecording(): Promise<void> {
    const result = await this.sessionService.stopRecording();

    // Report audio path — video blob arrives separately via videoRecordingBlob
    const filePath = result.audioPath ?? '';
    this.postMessage({ type: 'recordingStopped', filePath });
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

  // ─── Camera Devices ─────────────────────────────────────────────────────

  private async listCameraDevices(): Promise<void> {
    const manager = await this.ensureDeviceManager();
    if (!manager) {
      this.postMessage({ type: 'cameraDevices', devices: [] });
      return;
    }

    try {
      await manager.refresh();
      const devices = manager.list('camera');
      this.postMessage({
        type: 'cameraDevices',
        devices: devices.map((device) => ({
          id: device.id,
          name: device.label,
          isDefault: device.isDefault ?? false,
        })),
      });
    } catch (err) {
      this.logger.error('Failed to list camera devices', err);
      void handleError(err instanceof Error ? err : new Error(String(err)), {
        showToUser: true,
        severity: 'warning',
      });
      this.postMessage({ type: 'cameraDevices', devices: [] });
    }
  }

  private async startCameraCapture(deviceId?: string): Promise<void> {
    const manager = await this.ensureDeviceManager();
    if (!manager) return;

    try {
      await manager.refresh();
      const device = this.pickCameraDevice(manager.list('camera'), deviceId);
      if (!device) {
        void handleError(new Error(vscode.l10n.t('neko.live.camera.noDevice')), {
          showToUser: true,
          severity: 'warning',
        });
        return;
      }
      const session = await this.sessionService.startDeviceStream('camera', device);
      this.postMessage({
        type: 'cameraStreamStarted',
        streamId: session.sessionId,
        wsUrl: session.streamUrl ?? '',
      });
    } catch (err) {
      this.logger.error('Failed to start camera capture', err);
      void handleError(err instanceof Error ? err : new Error(String(err)), { showToUser: true });
    }
  }

  private async stopCameraCapture(): Promise<void> {
    if (!this.deviceManager) {
      this.postMessage({ type: 'cameraStreamStopped' });
      return;
    }
    try {
      await this.sessionService.stopDeviceStream('camera');
      this.postMessage({ type: 'cameraStreamStopped' });
    } catch (err) {
      this.logger.error('Failed to stop camera capture', err);
    }
  }

  private pickCameraDevice(
    devices: readonly DeviceInfo[],
    deviceId: string | undefined,
  ): DeviceInfo | undefined {
    if (deviceId) return devices.find((device) => device.id === deviceId);
    return devices.find((device) => device.isDefault) ?? devices[0];
  }

  public async useDevice(device: DeviceInfo): Promise<boolean> {
    try {
      const manager = await this.ensureDeviceManager();
      if (!manager) {
        void handleError(new Error(vscode.l10n.t('neko.live.device.noManager')), {
          showToUser: true,
          severity: 'warning',
        });
        return false;
      }

      await manager.refresh();
      const current = manager.list(device.type).find((candidate) => candidate.id === device.id);
      if (!current) {
        void handleError(new Error(vscode.l10n.t('neko.live.device.notFound', device.label)), {
          showToUser: true,
          severity: 'warning',
        });
        return false;
      }

      const permissionState = await manager.requestPermission(current.type, current.id);
      if (permissionState !== 'granted') {
        return false;
      }

      const session = await this.sessionService.useDevice(current);
      if (current.type === 'camera' && session) {
        this.postMessage({
          type: 'cameraStreamStarted',
          streamId: session.sessionId,
          wsUrl: session.streamUrl ?? '',
        });
      }
      vscode.window.showInformationMessage(vscode.l10n.t('neko.live.device.bound', current.label));
      return true;
    } catch (err) {
      this.logger.error('Failed to use device in Neko Live', err);
      void handleError(err instanceof Error ? err : new Error(String(err)), { showToUser: true });
      return false;
    }
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

  private async ensureDeviceManager(): Promise<DeviceManager | undefined> {
    if (this.deviceManager) return this.deviceManager;
    const client = await this.ensureEngineClient();
    if (!client) return undefined;
    this.deviceManager = new EngineDeviceManager({
      engine: client,
      permissionPolicy: {
        getPermission: (request) => this.getDevicePermission(request),
        requestPermission: (request) => this.requestDevicePermission(request),
      },
    });
    return this.deviceManager;
  }

  private async getDevicePermission(
    request: DevicePermissionRequest,
  ): Promise<DevicePermissionState> {
    return this.defaultPermissionForDeviceType(request.deviceType);
  }

  private async requestDevicePermission(
    request: DevicePermissionRequest,
  ): Promise<DevicePermissionState> {
    try {
      const state = await vscode.commands.executeCommand<DevicePermissionState>(
        'neko.devices.requestPermission',
        request.deviceType,
        request.deviceId,
      );
      return state ?? this.defaultPermissionForDeviceType(request.deviceType);
    } catch (err) {
      this.logger.warn(`Device permission lookup failed: ${String(err)}`);
      return this.defaultPermissionForDeviceType(request.deviceType);
    }
  }

  private defaultPermissionForDeviceType(type: DeviceType): DevicePermissionState {
    return type === 'audio-input' || type === 'camera' || type === 'xr' ? 'unknown' : 'granted';
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
            this.sessionService.updateScene({ trackingMode: mode });
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

          case 'listCameraDevices':
            await this.listCameraDevices();
            break;

          case 'startCameraCapture':
            await this.startCameraCapture(message.deviceId as string | undefined);
            break;

          case 'stopCameraCapture':
            await this.stopCameraCapture();
            break;

          case 'videoRecordingBlob':
            await this.saveVideoBlob(message.dataUrl as string, message.mimeType as string);
            break;

          case 'showWarning':
            void handleError(new Error(message.message as string), {
              showToUser: true,
              severity: 'warning',
            });
            break;

          case 'showError':
            void handleError(new Error(message.message as string), { showToUser: true });
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

  private toVSCodeDisposable(disposable: { dispose(): void }): vscode.Disposable {
    return new vscode.Disposable(() => disposable.dispose());
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
    void this.stopCameraCapture();
    this.closePuppetStream();
    this.sessionService.dispose();
    this.deviceManager?.dispose();
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
