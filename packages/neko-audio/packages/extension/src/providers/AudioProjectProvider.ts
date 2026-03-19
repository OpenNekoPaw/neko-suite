/**
 * AudioProjectProvider - CustomEditorProvider for .nka audio project files
 *
 * Opens .nka (Neko Audio Project) files with full save/revert/dirty state support.
 * Supports both v1 (single-source) and v2 (multi-track) .nka formats.
 * v1 files are automatically migrated to v2 on open.
 *
 * .nka v2 JSON schema:
 * {
 *   version: '2.0',
 *   name: string,
 *   sampleRate: number,
 *   channels: number,
 *   tracks: TimelineTrack[],
 *   masterEffectsChain: AudioEffectSnapshot[],
 *   markers: AudioMarkerSnapshot[],
 * }
 *
 * Data flow:
 * 1. Open .nka → parse JSON → migrate v1→v2 if needed → probe tracks → waveforms
 * 2. Send project:init to webview (includes tracks + masterEffectsChain + markers + waveforms)
 * 3. Webview edits → operationApplied → apply to cache → fire onDidChangeCustomDocument
 * 4. Save → serialize cache → write .nka
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AudioService } from '../services/AudioService';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';
import {
  applyAudioOperation,
  applyOperation,
  type AudioProjectData,
  type EditOperation,
  type AudioOperation,
  type TrackOperation,
  type ElementOperation,
} from '@neko/shared';
import type { TimelineTrack } from '@neko/shared';
import type { WaveformData } from '../types/api';
import { generateId } from '@neko/shared';

const logger = getLogger('AudioProject');

// =============================================================================
// .nka Project Schema — v1 (legacy) and v2 (multi-track)
// =============================================================================

/** v1 schema (legacy, single-source) */
export interface AudioProjectV1 {
  version: '1.0';
  name: string;
  audioSource: {
    filePath: string;
    duration: number;
    sampleRate: number;
    channels: number;
    format: string;
  } | null;
  effectsChain: Array<{
    id: string;
    type: string;
    name: string;
    enabled: boolean;
    params: Record<string, unknown>;
  }>;
  markers: Array<{ id: string; time: number; label: string; color?: string }>;
}

/** v2 schema (multi-track) — matches AudioProjectData from @neko/shared */
export type AudioProjectV2 = AudioProjectData;

/** Union of all .nka versions for parsing */
export type AudioProject = AudioProjectV1 | AudioProjectV2;

// =============================================================================
// v1 → v2 Migration
// =============================================================================

function isV1Project(project: AudioProject): project is AudioProjectV1 {
  return project.version === '1.0' || !('tracks' in project);
}

function migrateV1toV2(v1: AudioProjectV1, nkaDir: string): AudioProjectV2 {
  const tracks: TimelineTrack[] = [];
  if (v1.audioSource) {
    // Resolve relative path
    const filePath = path.isAbsolute(v1.audioSource.filePath)
      ? v1.audioSource.filePath
      : path.resolve(nkaDir, v1.audioSource.filePath);

    tracks.push({
      id: generateId(),
      type: 'audio',
      name: path.basename(filePath, path.extname(filePath)),
      elements: [
        {
          id: generateId(),
          type: 'audio',
          name: path.basename(filePath),
          src: filePath,
          duration: v1.audioSource.duration,
          startTime: 0,
          trimStart: 0,
          trimEnd: 0,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          opacity: 1,
          blendMode: 'normal',
          effects: [],
          muted: false,
          hidden: false,
          locked: false,
          speed: 1,
        } as any, // AudioElement extends BaseTimelineElement
      ],
      muted: false,
      locked: false,
      hidden: false,
      isMain: true,
    });
  }

  return {
    version: '2.0',
    name: v1.name,
    sampleRate: v1.audioSource?.sampleRate ?? 48000,
    channels: v1.audioSource?.channels ?? 2,
    tracks,
    masterEffectsChain: v1.effectsChain ?? [],
    markers: v1.markers ?? [],
  };
}

// =============================================================================
// AudioProjectProvider
// =============================================================================

export class AudioProjectProvider implements vscode.CustomEditorProvider {
  static readonly viewType = 'neko.audioProject';

  private readonly _disposables: vscode.Disposable[] = [];
  private _audioService: AudioService | null = null;

  // In-memory project data cache for incremental operation sync (v2 format)
  private readonly _projectDataCache = new Map<string, AudioProjectData>();

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
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached) return;

    // Serialize cache directly to .nka (v2 format)
    const content = JSON.stringify(cached, null, 2);
    await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'));
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
  ): Promise<void> {
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached) return;

    const content = JSON.stringify(cached, null, 2);
    await vscode.workspace.fs.writeFile(destination, Buffer.from(content, 'utf-8'));
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
            // Legacy: webview responding to save request (v1 compat, no longer primary path)
            break;
          }

          case 'operationApplied': {
            // Incremental sync: apply EditOperation to in-memory cache
            const operation = msg.operation as EditOperation;
            const docKey = document.uri.toString();
            const cached = this._projectDataCache.get(docKey);
            if (cached) {
              try {
                const opType = operation.type;
                let newData: AudioProjectData;
                if (opType.startsWith('audio.')) {
                  newData = applyAudioOperation(cached, operation as AudioOperation);
                } else {
                  // track.* / element.* operations — use generic applyOperation
                  newData = applyOperation(
                    cached,
                    operation as TrackOperation | ElementOperation | AudioOperation,
                  );
                }
                this._projectDataCache.set(docKey, newData);
              } catch (e) {
                logger.error('Incremental sync failed, will resync on save', e);
              }
            }
            // Fire dirty event
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {},
              redo: () => {},
            });
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
            const audioPath = await this.resolveAudioPath(document.uri);
            const outputDir = audioPath
              ? path.dirname(audioPath)
              : path.dirname(document.uri.fsPath);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputPath =
              (msg.outputPath as string) ?? path.join(outputDir, `recording-${timestamp}.wav`);
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

          case 'project:importSource': {
            // User wants to import an audio file — creates a new track
            const sourceUris = await vscode.window.showOpenDialog({
              canSelectMany: true,
              filters: { 'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
              title: vscode.l10n.t('neko.audio.import.title'),
            });
            if (!sourceUris || sourceUris.length === 0) break;

            if (!this._audioService?.isAvailable) {
              logger.error('AudioService not available for import');
              break;
            }

            try {
              await this.importAudioFiles(
                sourceUris.map((u) => u.fsPath),
                document,
                webviewPanel,
              );
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              logger.error('Import audio source failed:', error);
              await webviewPanel.webview.postMessage({
                type: 'editor:importSourceFailed',
                payload: { error: errMsg },
              });
            }
            break;
          }

          case 'project:dropImportSource': {
            // User dropped audio file(s) onto the editor
            const droppedUris = (msg as Record<string, unknown>).uris as string[] | undefined;
            if (!droppedUris || droppedUris.length === 0) break;

            if (!this._audioService?.isAvailable) {
              logger.error('AudioService not available for drop import');
              break;
            }

            try {
              const fsPaths = droppedUris.map((u) => vscode.Uri.parse(u).fsPath);
              await this.importAudioFiles(fsPaths, document, webviewPanel);
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              logger.error('Drop import audio source failed:', error);
              await webviewPanel.webview.postMessage({
                type: 'editor:importSourceFailed',
                payload: { error: errMsg },
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

  /**
   * Import audio files as new tracks into the project.
   * Each file creates a new track with a single AudioElement clip.
   */
  private async importAudioFiles(
    filePaths: string[],
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached || !this._audioService?.isAvailable) return;

    const newTracks = [...cached.tracks];

    for (const filePath of filePaths) {
      const audioInfo = await this._audioService.probeAudio(filePath);
      const elementId = generateId();
      const trackId = generateId();

      const element = {
        id: elementId,
        type: 'audio' as const,
        name: path.basename(filePath),
        src: filePath,
        duration: audioInfo.duration,
        startTime: 0,
        trimStart: 0,
        trimEnd: 0,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        opacity: 1,
        blendMode: 'normal',
        effects: [],
        muted: false,
        hidden: false,
        locked: false,
        speed: 1,
      } as any;

      const track: TimelineTrack = {
        id: trackId,
        type: 'audio',
        name: path.basename(filePath, path.extname(filePath)),
        elements: [element],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      };

      newTracks.push(track);
    }

    // Update cache immutably
    this._projectDataCache.set(docKey, { ...cached, tracks: newTracks });

    // Fire dirty event
    this._onDidChangeCustomDocument.fire({
      document,
      undo: () => {},
      redo: () => {},
    });

    // Re-initialize webview with updated project
    await this.initializeWebview(panel, document.uri);
    logger.info(`Imported ${filePaths.length} audio file(s) as new tracks`);
  }

  /** Read .nka JSON and send project:init to webview */
  private async initializeWebview(panel: vscode.WebviewPanel, nkaUri: vscode.Uri): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(nkaUri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf-8')) as AudioProject;
      const nkaDir = path.dirname(nkaUri.fsPath);

      // Migrate v1 → v2 if needed
      const projectData: AudioProjectData = isV1Project(parsed)
        ? migrateV1toV2(parsed, nkaDir)
        : parsed;

      // Cache project data for incremental sync
      const docKey = nkaUri.toString();
      this._projectDataCache.set(docKey, projectData);

      // Collect waveforms for all audio elements across tracks
      const waveforms: Record<string, WaveformData> = {};

      if (this._audioService?.isAvailable) {
        for (const track of projectData.tracks) {
          for (const element of track.elements) {
            if (element.type === 'audio' && 'src' in element) {
              const src = (element as any).src as string;
              try {
                const waveform = await this._audioService.getWaveform(src);
                if (waveform) {
                  waveforms[element.id] = waveform;
                }
              } catch (error) {
                logger.error(`Waveform generation failed for ${src}:`, error);
              }
            }
          }
        }
      }

      // Send project:init v2
      await panel.webview.postMessage({
        type: 'project:init',
        payload: {
          projectData,
          waveforms,
        },
      });
    } catch (error) {
      logger.error('Failed to initialize project:', error);
    }
  }

  /**
   * Resolve the first audio source path from cache (for playback/analysis commands).
   * In multi-track mode, returns the first audio element's src.
   */
  private resolveAudioPathFromCache(nkaUri: vscode.Uri): string | null {
    const cached = this._projectDataCache.get(nkaUri.toString());
    if (!cached) return null;
    for (const track of cached.tracks) {
      for (const element of track.elements) {
        if (element.type === 'audio' && 'src' in element) {
          return (element as any).src as string;
        }
      }
    }
    return null;
  }

  /** @deprecated Use resolveAudioPathFromCache instead */
  private async resolveAudioPath(nkaUri: vscode.Uri): Promise<string | null> {
    // Try cache first
    const fromCache = this.resolveAudioPathFromCache(nkaUri);
    if (fromCache) return fromCache;

    // Fallback: read from disk (handles case where cache not yet populated)
    try {
      const raw = await vscode.workspace.fs.readFile(nkaUri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf-8')) as AudioProject;
      const nkaDir = path.dirname(nkaUri.fsPath);

      if (isV1Project(parsed)) {
        if (!parsed.audioSource) return null;
        return path.isAbsolute(parsed.audioSource.filePath)
          ? parsed.audioSource.filePath
          : path.resolve(nkaDir, parsed.audioSource.filePath);
      }

      // v2: find first audio element
      for (const track of parsed.tracks) {
        for (const element of track.elements) {
          if (element.type === 'audio' && 'src' in element) {
            return (element as any).src as string;
          }
        }
      }
      return null;
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
