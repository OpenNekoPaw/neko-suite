/**
 * AudioEditorProvider - CustomReadonlyEditorProvider for audio editing
 *
 * Opens audio files in a full-featured editor with waveform editing,
 * spectrum analysis, effects chain, and recording capabilities.
 *
 * Uses CustomReadonlyEditorProvider because editing operations (trim, effects)
 * produce new files via transcode rather than modifying the original.
 *
 * Data flow:
 * 1. User opens audio file → resolveCustomEditor()
 * 2. Probe metadata → send to webview
 * 3. Generate waveform → send to webview
 * 4. Webview requests PCM stream via postMessage
 * 5. Web Audio API plays decoded PCM data
 * 6. Editing operations → extension transcode → new file
 */

import * as vscode from 'vscode';
import type { AudioService } from '../services/AudioService';
import type { AudioOutlineProvider } from '../views/audioOutlineProvider';
import type { AudioStatusBar } from '../views/audioStatusBar';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';

const logger = getLogger('AudioEditor');

// =============================================================================
// AudioEditorProvider
// =============================================================================

export class AudioEditorProvider implements vscode.CustomEditorProvider<vscode.CustomDocument> {
  static readonly viewType = 'neko.audioEditor';

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  private readonly _disposables: vscode.Disposable[] = [];
  private _audioService: AudioService | null = null;
  private _outlineProvider: AudioOutlineProvider | null = null;
  private _statusBar: AudioStatusBar | null = null;
  private readonly _activePanels = new Set<vscode.WebviewPanel>();
  private activeWebviewPanel: vscode.WebviewPanel | undefined;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /** Forward a command message to all active webview panels */
  postToActivePanels(message: Record<string, unknown>): boolean {
    if (this._activePanels.size === 0) return false;
    for (const panel of this._activePanels) {
      panel.webview.postMessage(message);
    }
    return true;
  }

  /** Inject a shared AudioService instance */
  setAudioService(service: AudioService): void {
    this._audioService = service;
  }

  /** Inject outline provider for audio metadata display */
  setOutlineProvider(provider: AudioOutlineProvider): void {
    this._outlineProvider = provider;
  }

  /** Inject status bar for audio info display */
  setStatusBar(statusBar: AudioStatusBar): void {
    this._statusBar = statusBar;
  }

  // =========================================================================
  // CustomReadonlyEditorProvider
  // =========================================================================

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Track active panels for command forwarding
    this._activePanels.add(webviewPanel);
    this.activeWebviewPanel = webviewPanel;

    // Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
    };

    // Pin the editor tab
    vscode.commands.executeCommand('workbench.action.pinEditor');

    const filePath = document.uri.fsPath;
    const fileName = filePath.split('/').pop() ?? filePath;

    // Set webview HTML early so it can start loading while we probe
    webviewPanel.webview.html = getWebviewHtml({
      webview: webviewPanel.webview,
      extensionUri: this._extensionUri,
    });

    // Probe audio in background
    const audioInfoPromise = (async () => {
      if (!this._audioService?.isAvailable) {
        webviewPanel.webview.html = this.getErrorHtml(
          'Failed to initialize media engine. Please ensure neko-engine is installed.',
        );
        return null;
      }
      try {
        return await this._audioService.probeAudio(filePath);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        webviewPanel.webview.html = this.getErrorHtml(`Failed to probe audio file: ${msg}`);
        return null;
      }
    })();

    // Per-panel stream state
    let activeStreamId: string | null = null;

    const stopPanelStream = async () => {
      if (activeStreamId) {
        await this._audioService?.stopStream(activeStreamId);
        activeStreamId = null;
      }
    };

    // Handle messages from webview — registered early so no messages are lost
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (msg: Record<string, unknown>) => {
        const type = msg.type as string;

        switch (type) {
          case 'ready': {
            const audioInfo = await audioInfoPromise;
            if (!audioInfo) return;
            await webviewPanel.webview.postMessage({
              type: 'editor:init',
              payload: { filePath, fileName, audioInfo },
            });

            // Update outline view with audio metadata
            if (this._outlineProvider) {
              this._outlineProvider.updateData({
                fileName,
                format: {
                  formatName: audioInfo.format,
                  duration: audioInfo.duration,
                  bitrate: audioInfo.bitrate || 0,
                  size: 0,
                },
                streams: [
                  {
                    index: 0,
                    codecName: audioInfo.codec,
                    codecType: 'audio',
                    sampleRate: audioInfo.sampleRate,
                    channels: audioInfo.channels,
                    bitrate: audioInfo.bitrate,
                  },
                ],
              });
            }

            // Update status bar with audio info
            if (this._statusBar) {
              this._statusBar.update({
                duration: audioInfo.duration,
                sampleRate: audioInfo.sampleRate,
                channels: audioInfo.channels,
                codec: audioInfo.codec,
                bitrate: audioInfo.bitrate,
              });
              this._statusBar.show();
            }

            // Generate and send waveform data
            try {
              const waveform = await this._audioService?.getWaveform(filePath);
              if (waveform) {
                await webviewPanel.webview.postMessage({
                  type: 'editor:waveform',
                  payload: waveform,
                });
              }
            } catch (error) {
              logger.error('Waveform generation failed:', error);
            }
            break;
          }

          case 'editor:play': {
            try {
              await stopPanelStream();

              const result = await this._audioService?.startStream(filePath);
              if (result) {
                activeStreamId = result.streamId;

                const startTime = (msg.startTime as number) ?? 0;
                if (startTime > 0) {
                  await this._audioService?.seekStream(result.streamId, startTime);
                }

                await webviewPanel.webview.postMessage({
                  type: 'editor:streamReady',
                  payload: {
                    streamId: result.streamId,
                    streamUrl: result.streamUrl,
                  },
                });
              }
            } catch (error) {
              logger.error('Failed to start audio stream:', error);
            }
            break;
          }

          case 'editor:pause':
            if (activeStreamId) await this._audioService?.pauseStream(activeStreamId);
            break;

          case 'editor:resume':
            if (activeStreamId) await this._audioService?.resumeStream(activeStreamId);
            break;

          case 'editor:stop':
            await stopPanelStream();
            break;

          case 'editor:seek': {
            const time = msg.time as number;
            if (typeof time === 'number' && activeStreamId) {
              await this._audioService?.seekStream(activeStreamId, time);
            }
            break;
          }

          case 'editor:speed': {
            const speed = (msg.speed as number) ?? 1.0;
            if (activeStreamId) await this._audioService?.setStreamSpeed(activeStreamId, speed);
            break;
          }

          case 'editor:trim': {
            const { startTime, endTime, outputPath } = msg as {
              startTime: number;
              endTime: number;
              outputPath?: string;
            };
            try {
              const output = outputPath ?? this.generateOutputPath(filePath, 'trimmed');
              const result = await this._audioService?.transcode(filePath, output, {
                startTime,
                endTime,
              });
              await webviewPanel.webview.postMessage({
                type: 'editor:trimResult',
                payload: { success: true, outputPath: result },
              });
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              await webviewPanel.webview.postMessage({
                type: 'editor:trimResult',
                payload: { success: false, error: msg },
              });
            }
            break;
          }

          case 'editor:saveRecording': {
            const { data, format } = msg as { data: string; format: string };
            try {
              const ext = format === 'audio/webm' ? 'webm' : 'wav';
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const suggestedName = `recording-${timestamp}.${ext}`;

              const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(suggestedName),
                filters: { 'Audio Files': [ext] },
                title: 'Save Recording',
              });

              if (saveUri) {
                const buffer = Buffer.from(data, 'base64');
                await vscode.workspace.fs.writeFile(saveUri, buffer);
                await webviewPanel.webview.postMessage({
                  type: 'editor:recordingSaved',
                  payload: { success: true, path: saveUri.fsPath },
                });
              }
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              await webviewPanel.webview.postMessage({
                type: 'editor:recordingSaved',
                payload: { success: false, error: errMsg },
              });
            }
            break;
          }

          case 'editor:analyzeLoudness': {
            try {
              const result = await this._audioService?.analyzeLoudness(filePath);
              await webviewPanel.webview.postMessage({
                type: 'editor:loudnessResult',
                payload: result,
              });
            } catch (error) {
              logger.error('Loudness analysis failed:', error);
            }
            break;
          }

          case 'editor:applyEffects': {
            const effects = msg.effects as Array<{
              type: string;
              params: Record<string, unknown>;
            }>;
            try {
              const output = this.generateOutputPath(filePath, 'fx');
              await this._audioService?.transcode(filePath, output, { effects });
              await webviewPanel.webview.postMessage({
                type: 'editor:effectsResult',
                payload: { success: true, outputPath: output },
              });
              // Open the new file
              const uri = vscode.Uri.file(output);
              await vscode.commands.executeCommand('vscode.open', uri);
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              await webviewPanel.webview.postMessage({
                type: 'editor:effectsResult',
                payload: { success: false, error: errMsg },
              });
            }
            break;
          }

          case 'editor:detectSilence': {
            try {
              const threshold = msg.threshold as number | undefined;
              const minDuration = msg.minDuration as number | undefined;
              const regions = await this._audioService?.detectSilence(
                filePath,
                threshold,
                minDuration,
              );
              await webviewPanel.webview.postMessage({
                type: 'editor:silenceResult',
                payload: { regions: regions ?? [] },
              });
            } catch (error) {
              logger.error('Silence detection failed:', error);
            }
            break;
          }

          case 'editor:denoise': {
            try {
              const amount = (msg.amount as number) ?? 0.5;
              const output = this.generateOutputPath(filePath, 'denoised');
              await this._audioService?.transcode(filePath, output, {
                effects: [
                  { type: 'noise-reduction', params: { amount, threshold: 1000, smoothing: 0.5 } },
                ],
              });
              const uri = vscode.Uri.file(output);
              await vscode.commands.executeCommand('vscode.open', uri);
            } catch (error) {
              logger.error('Denoise failed:', error);
            }
            break;
          }

          case 'editor:normalize': {
            try {
              const targetLoudness = (msg.targetLoudness as number) ?? -14;
              // First analyze loudness
              const loudness = await this._audioService?.analyzeLoudness(filePath);
              if (loudness) {
                const gainDb = targetLoudness - loudness.integratedLoudness;
                const output = this.generateOutputPath(filePath, 'normalized');
                await this._audioService?.transcode(filePath, output, {
                  effects: [{ type: 'gain', params: { gain: gainDb } }],
                });
                const uri = vscode.Uri.file(output);
                await vscode.commands.executeCommand('vscode.open', uri);
              }
            } catch (error) {
              logger.error('Normalize failed:', error);
            }
            break;
          }

          case 'editor:exportAs': {
            const format = msg.format as string;
            const quality = msg.quality as number | undefined;
            const sampleRate = msg.sampleRate as number | undefined;
            const bitrate = msg.bitrate as number | undefined;
            const channels = msg.channels as number | undefined;
            try {
              const ext =
                format === 'wav'
                  ? 'wav'
                  : format === 'mp3'
                    ? 'mp3'
                    : format === 'aac'
                      ? 'aac'
                      : format === 'flac'
                        ? 'flac'
                        : format === 'opus'
                          ? 'opus'
                          : 'wav';

              const saveUri = await vscode.window.showSaveDialog({
                filters: { 'Audio Files': [ext] },
                title: 'Export Audio',
              });

              if (saveUri) {
                await this._audioService?.transcode(filePath, saveUri.fsPath, {
                  format,
                  quality,
                  sampleRate,
                  bitrate,
                  channels,
                });
                await vscode.commands.executeCommand('vscode.open', saveUri);
              }
            } catch (error) {
              logger.error('Export failed:', error);
            }
            break;
          }

          case 'editor:listInputDevices': {
            try {
              const devices = await this._audioService?.listInputDevices();
              await webviewPanel.webview.postMessage({
                type: 'editor:inputDevices',
                payload: devices ?? [],
              });
            } catch (error) {
              logger.error('List input devices failed:', error);
            }
            break;
          }

          case 'editor:recordStart': {
            const outputDir = require('path').dirname(filePath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputPath =
              (msg.outputPath as string) ??
              require('path').join(outputDir, `recording-${timestamp}.wav`);
            try {
              const result = await this._audioService?.recordStart({
                outputPath,
                deviceId: msg.deviceId as string | undefined,
                sampleRate: msg.sampleRate as number | undefined,
                channels: msg.channels as number | undefined,
              });
              if (result) {
                await webviewPanel.webview.postMessage({
                  type: 'editor:recordStartResult',
                  payload: result,
                });
              }
            } catch (error) {
              logger.error('Record start failed:', error);
            }
            break;
          }

          case 'editor:recordStop': {
            const streamId = msg.streamId as string;
            try {
              const result = await this._audioService?.recordStop(streamId);
              if (result) {
                await webviewPanel.webview.postMessage({
                  type: 'editor:recordStopResult',
                  payload: result,
                });
              }
            } catch (error) {
              logger.error('Record stop failed:', error);
            }
            break;
          }

          default:
            break;
        }
      },
      undefined,
      this._disposables,
    );

    // Cleanup on dispose
    webviewPanel.onDidDispose(async () => {
      messageDisposable.dispose();
      this._activePanels.delete(webviewPanel);
      await stopPanelStream();
      this._statusBar?.hide();
      this._outlineProvider?.updateData(null);
    });
  }

  // =====================
  // CustomEditorProvider Methods
  // =============

  async saveCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // Notify webview to save
    this.activeWebviewPanel?.webview.postMessage({ type: 'save' });
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // Notify webview to save as
    this.activeWebviewPanel?.webview.postMessage({
      type: 'saveAs',
      path: destination.fsPath,
    });
  }

  async revertCustomDocument(
    document: vscode.CustomDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    // Notify webview to revert
    this.activeWebviewPanel?.webview.postMessage({ type: 'revert' });
  }

  async backupCustomDocument(
    document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    // For now, return a simple backup that does nothing
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination);
        } catch {
          // Ignore errors
        }
      },
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private generateOutputPath(inputPath: string, suffix: string): string {
    const lastDot = inputPath.lastIndexOf('.');
    if (lastDot === -1) return `${inputPath}_${suffix}`;
    return `${inputPath.substring(0, lastDot)}_${suffix}${inputPath.substring(lastDot)}`;
  }

  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<style>
		body {
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100vh;
			margin: 0;
			background: var(--vscode-editor-background);
			color: var(--vscode-errorForeground, #f44);
			font-family: var(--vscode-font-family);
			font-size: 14px;
			text-align: center;
			padding: 20px;
		}
	</style>
</head>
<body>
	<div>
		<p>${message}</p>
	</div>
</body>
</html>`;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}
