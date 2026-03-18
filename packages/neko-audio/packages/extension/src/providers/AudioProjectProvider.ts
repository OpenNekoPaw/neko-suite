/**
 * AudioProjectProvider - CustomEditorProvider for .nka audio project files
 *
 * Opens .nka (Neko Audio Project) files with full save/revert/dirty state support.
 * Unlike AudioEditorProvider (readonly, for raw audio files), this provider
 * persists effects chain, markers, and viewport state.
 *
 * .nka JSON schema:
 * {
 *   version: '1.0',
 *   name: string,
 *   audioSource: { filePath, duration, sampleRate, channels, format },
 *   effectsChain: AudioEffectInstance[],
 *   markers: Array<{ id, time, label, color? }>,
 * }
 *
 * Data flow:
 * 1. Open .nka → parse JSON → resolve audioSource → probe → waveform
 * 2. Send project:init to webview (includes effectsChain + markers)
 * 3. Webview edits → project:changed → fire onDidChangeCustomDocument
 * 4. Save → post 'save' → webview sends project:saveData → write .nka
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AudioService } from '../services/AudioService';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';

const logger = getLogger('AudioProject');

// =============================================================================
// .nka Project Schema
// =============================================================================

interface AudioSource {
  filePath: string;
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
}

interface AudioProject {
  version: '1.0';
  name: string;
  audioSource: AudioSource | null;
  effectsChain: Array<{
    id: string;
    type: string;
    name: string;
    enabled: boolean;
    params: Record<string, unknown>;
  }>;
  markers: Array<{ id: string; time: number; label: string; color?: string }>;
}

// =============================================================================
// AudioProjectProvider
// =============================================================================

export class AudioProjectProvider implements vscode.CustomEditorProvider {
  static readonly viewType = 'neko.audioProject';

  private readonly _disposables: vscode.Disposable[] = [];
  private _audioService: AudioService | null = null;

  // Save/revert coordination: webview sends project data back via postMessage
  private _pendingSaveResolve: ((data: AudioProject) => void) | null = null;

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /** Inject a shared AudioService instance */
  setAudioService(service: AudioService): void {
    this._audioService = service;
  }

  /** Forward a command message to all active webview panels */
  postToActivePanels(message: Record<string, unknown>): boolean {
    if (this._activePanels.size === 0) return false;
    for (const panel of this._activePanels.values()) {
      panel.webview.postMessage(message);
    }
    return true;
  }

  // =========================================================================
  // CustomEditorProvider — Document Lifecycle
  // =========================================================================

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async saveCustomDocument(document: vscode.CustomDocument): Promise<void> {
    const panel = this._activePanels.get(document.uri.toString());
    if (!panel) return;

    const projectData = await this.requestProjectData(panel, undefined);
    if (projectData) {
      const content = JSON.stringify(projectData, null, 2);
      await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'));
    }
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
  ): Promise<void> {
    const panel = this._activePanels.get(document.uri.toString());
    if (!panel) return;

    const projectData = await this.requestProjectData(panel, destination.fsPath);
    if (projectData) {
      // Update audioSource relative path for new location
      const content = JSON.stringify(projectData, null, 2);
      await vscode.workspace.fs.writeFile(destination, Buffer.from(content, 'utf-8'));
    }
  }

  async revertCustomDocument(document: vscode.CustomDocument): Promise<void> {
    const panel = this._activePanels.get(document.uri.toString());
    if (!panel) return;

    await panel.webview.postMessage({ type: 'revert' });
    // Re-send project:init with data from disk
    await this.initializeWebview(panel, document.uri);
  }

  async backupCustomDocument(
    _document: vscode.CustomDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    return {
      id: context.destination.toString(),
      delete: () => {},
    };
  }

  // =========================================================================
  // Resolve Custom Editor
  // =========================================================================

  private readonly _activePanels = new Map<string, vscode.WebviewPanel>();

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const docKey = document.uri.toString();
    this._activePanels.set(docKey, webviewPanel);

    // Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
    };

    vscode.commands.executeCommand('workbench.action.pinEditor');

    webviewPanel.webview.html = getWebviewHtml({
      webview: webviewPanel.webview,
      extensionUri: this._extensionUri,
    });

    // Per-panel stream state
    let activeStreamId: string | null = null;
    const stopPanelStream = async () => {
      if (activeStreamId) {
        await this._audioService?.stopStream(activeStreamId);
        activeStreamId = null;
      }
    };

    // Handle messages from webview
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (msg: Record<string, unknown>) => {
        const type = msg.type as string;

        switch (type) {
          case 'ready':
            await this.initializeWebview(webviewPanel, document.uri);
            break;

          case 'project:changed':
            // Fire dirty event
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {},
              redo: () => {},
            });
            break;

          case 'project:saveData': {
            // Webview responding to save request with serialized project data
            const data = msg.data as AudioProject;
            if (this._pendingSaveResolve) {
              this._pendingSaveResolve(data);
              this._pendingSaveResolve = null;
            }
            break;
          }

          // Playback/editing handlers (shared logic with AudioEditorProvider)
          case 'editor:play': {
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
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
                  payload: { streamId: result.streamId, streamUrl: result.streamUrl },
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

          case 'editor:applyEffects': {
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
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

          case 'editor:trim': {
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
            const { startTime, endTime } = msg as { startTime: number; endTime: number };
            try {
              const output = this.generateOutputPath(filePath, 'trimmed');
              await this._audioService?.transcode(filePath, output, { startTime, endTime });
              await webviewPanel.webview.postMessage({
                type: 'editor:trimResult',
                payload: { success: true, outputPath: output },
              });
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              await webviewPanel.webview.postMessage({
                type: 'editor:trimResult',
                payload: { success: false, error: errMsg },
              });
            }
            break;
          }

          case 'editor:analyzeLoudness': {
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
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

          case 'editor:detectSilence': {
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
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
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
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
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
            try {
              const targetLoudness = (msg.targetLoudness as number) ?? -14;
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
            const filePath = await this.resolveAudioPath(document.uri);
            if (!filePath) break;
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

          default:
            break;
        }
      },
      undefined,
      this._disposables,
    );

    // Cleanup
    webviewPanel.onDidDispose(async () => {
      messageDisposable.dispose();
      this._activePanels.delete(docKey);
      await stopPanelStream();
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Read .nka JSON and send project:init to webview */
  private async initializeWebview(panel: vscode.WebviewPanel, nkaUri: vscode.Uri): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(nkaUri);
      const project = JSON.parse(Buffer.from(raw).toString('utf-8')) as AudioProject;

      // Empty project (no audio source yet) — send minimal init
      if (!project.audioSource) {
        await panel.webview.postMessage({
          type: 'project:init',
          payload: {
            filePath: null,
            fileName: project.name,
            audioInfo: null,
            project: {
              effectsChain: project.effectsChain,
              markers: project.markers,
            },
          },
        });
        return;
      }

      // Resolve audio source path (relative to .nka file)
      const nkaDir = path.dirname(nkaUri.fsPath);
      const audioPath = path.isAbsolute(project.audioSource.filePath)
        ? project.audioSource.filePath
        : path.resolve(nkaDir, project.audioSource.filePath);

      if (!this._audioService?.isAvailable) {
        logger.error('AudioService not available for project init');
        return;
      }

      // Probe audio metadata
      const audioInfo = await this._audioService.probeAudio(audioPath);

      // Send project:init
      await panel.webview.postMessage({
        type: 'project:init',
        payload: {
          filePath: audioPath,
          fileName: path.basename(audioPath),
          audioInfo,
          project: {
            effectsChain: project.effectsChain,
            markers: project.markers,
          },
        },
      });

      // Generate and send waveform
      try {
        const waveform = await this._audioService.getWaveform(audioPath);
        if (waveform) {
          await panel.webview.postMessage({
            type: 'editor:waveform',
            payload: waveform,
          });
        }
      } catch (error) {
        logger.error('Waveform generation failed:', error);
      }
    } catch (error) {
      logger.error('Failed to initialize project:', error);
    }
  }

  /** Request project data from webview for saving */
  private async requestProjectData(
    panel: vscode.WebviewPanel,
    savePath: string | undefined,
  ): Promise<AudioProject | null> {
    return new Promise<AudioProject | null>((resolve) => {
      this._pendingSaveResolve = resolve;

      const msgType = savePath ? 'saveAs' : 'save';
      const payload = savePath ? { type: msgType, path: savePath } : { type: msgType };
      panel.webview.postMessage(payload);

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this._pendingSaveResolve === resolve) {
          this._pendingSaveResolve = null;
          resolve(null);
        }
      }, 5000);
    });
  }

  /** Resolve audio file path from .nka URI */
  private async resolveAudioPath(nkaUri: vscode.Uri): Promise<string | null> {
    try {
      const raw = await vscode.workspace.fs.readFile(nkaUri);
      const project = JSON.parse(Buffer.from(raw).toString('utf-8')) as AudioProject;
      if (!project.audioSource) return null;
      const nkaDir = path.dirname(nkaUri.fsPath);
      return path.isAbsolute(project.audioSource.filePath)
        ? project.audioSource.filePath
        : path.resolve(nkaDir, project.audioSource.filePath);
    } catch {
      return null;
    }
  }

  private generateOutputPath(inputPath: string, suffix: string): string {
    const lastDot = inputPath.lastIndexOf('.');
    if (lastDot === -1) return `${inputPath}_${suffix}`;
    return `${inputPath.substring(0, lastDot)}_${suffix}${inputPath.substring(lastDot)}`;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this._onDidChangeCustomDocument.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
