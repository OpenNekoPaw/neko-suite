/**
 * AudioProjectProvider - CustomEditorProvider for .nka audio project files
 *
 * Opens .nka (Neko Audio Project) files with full save/revert/dirty state support.
 * The Extension cache is the authoritative project state for save/revert and
 * Engine-facing MixdownConfig construction.
 *
 * .nka v2.1 JSON schema:
 * {
 *   version: '2.1',
 *   name: string,
 *   sampleRate: number,
 *   channels: number,
 *   tracks: TimelineTrack[],
 *   masterEffectsChain: AudioEffectSnapshot[],
 *   markers: AudioMarkerSnapshot[],
 *   trackMix?: Record<string, AudioTrackMixState>,
 *   masterVolume?: number,
 * }
 *
 * Data flow:
 * 1. Open .nka → loadNka() → cache project data → probe tracks → waveforms
 * 2. Send project:init to Webview (projectData + waveforms)
 * 3. Webview edits → operationApplied → apply to cache → fire onDidChangeCustomDocument
 * 4. Save → saveNka(cache) → write .nka
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type {
  AudioAnalyzeRequestMessage,
  AudioEffectsRequestMessage,
  AudioExportRequestMessage,
  AudioPlaybackRequestMessage,
  AudioRecordingRequestMessage,
  AudioRequestMessage,
  AudioTrimRequestMessage,
  AudioElement,
  MixConfigWarning,
  TimelineElement,
} from '@neko/shared';
import type { MixStreamConfig } from '@neko/shared';
import type { AudioService } from '../services/AudioService';
import type {
  AudioProjectEditOperation,
  AudioProjectSessionGateway,
  ProjectSession,
} from '../services/audioProjectSessionGateway';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';
import {
  applyOperation as applySharedOperation,
  buildMixConfig,
  CURRENT_NKA_VERSION,
  invertOperation,
  loadNka,
  saveNka,
  type AudioProjectData,
  type EditOperation,
  type NkaCompatibilityMetadata,
} from '@neko/shared';
import type { TimelineTrack } from '@neko/shared';
import type { WaveformData } from '../types/api';
import { generateId } from '@neko/shared';
import { exportAudioExtension, generateAudioOutputPath } from './audioFilePaths';
import { createDefaultAudioElement } from '../utils/audioElementFactory';
import {
  isAudioAnalyzeRequestMessage,
  isAudioEffectsRequestMessage,
  isAudioExportRequestMessage,
  isAudioPlaybackRequestMessage,
  isAudioRecordingRequestMessage,
  isAudioTrimRequestMessage,
  postInvalidAudioMessage,
  type AudioRequestGuard,
} from './audioMessageGuards';

const logger = getLogger('AudioProject');

function isAudioElementWithSrc(element: TimelineElement): element is AudioElement {
  return element.type === 'audio' && typeof element.src === 'string';
}

function createProjectSnapshotOperation(): AudioProjectEditOperation {
  return {
    type: 'batch',
    meta: {
      id: `snapshot-${Date.now()}`,
      timestamp: Date.now(),
      source: 'system',
      description: 'Restore project snapshot',
    },
    payload: { operations: [] },
  };
}

function createImportOperationMeta(description: string): AudioProjectEditOperation['meta'] {
  return {
    id: `import-${generateId()}`,
    timestamp: Date.now(),
    source: 'user',
    description,
  };
}

function createImportBatchOperation(
  operations: AudioProjectEditOperation[],
): AudioProjectEditOperation {
  if (operations.length === 1) {
    return operations[0]!;
  }
  return {
    type: 'batch',
    meta: createImportOperationMeta('Import audio files'),
    payload: { operations },
  };
}

// =============================================================================
// AudioProjectProvider
// =============================================================================

export class AudioProjectProvider
  implements vscode.CustomEditorProvider, AudioProjectSessionGateway
{
  static readonly viewType = 'neko.audioProject';

  private _audioService: AudioService | null = null;

  // In-memory project data cache for incremental operation sync (v2 format)
  private readonly _projectDataCache = new Map<string, AudioProjectData>();
  private readonly _projectCompatibilityCache = new Map<string, NkaCompatibilityMetadata>();
  private readonly _documents = new Map<string, vscode.CustomDocument>();

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /** Inject a shared AudioService instance */
  setAudioService(service: AudioService): void {
    this._audioService = service;
  }

  /** Get project data from the first active panel's cache */
  getProjectData(): AudioProjectData | null {
    const docKey = this.resolveFocusedProjectKey();
    if (docKey) return this._projectDataCache.get(docKey) ?? null;
    return null;
  }

  async resolveSession(documentUri?: string): Promise<ProjectSession | null> {
    const docKey = documentUri ? this.toDocumentKey(documentUri) : this.resolveFocusedProjectKey();
    if (!docKey) return null;

    const projectData = this._projectDataCache.get(docKey);
    if (!projectData) return null;
    return { documentUri: docKey, projectData };
  }

  async applyOperation(
    session: ProjectSession,
    operation: AudioProjectEditOperation,
    options?: { syncReason?: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change' },
  ): Promise<ProjectSession> {
    const docKey = this.toDocumentKey(session.documentUri);
    const cached = this._projectDataCache.get(docKey);
    if (!cached) {
      throw new Error(`Audio project is not open: ${session.documentUri}`);
    }

    const projectData = this.applyEditOperation(cached, operation);
    this._projectDataCache.set(docKey, projectData);
    this.fireDirty(docKey, {
      operation,
      before: cached,
      after: projectData,
      reason: options?.syncReason ?? 'agent-edit',
    });
    await this.postProjectSync(docKey, projectData, operation, options?.syncReason ?? 'agent-edit');
    return { documentUri: docKey, projectData };
  }

  async buildMixConfig(session: ProjectSession): Promise<{
    config: MixStreamConfig;
    warnings: MixConfigWarning[];
  }> {
    return this.buildProjectMixConfig(vscode.Uri.parse(this.toDocumentKey(session.documentUri)));
  }

  /** Post message to all active webview panels */
  postMessage(message: Record<string, unknown>): void {
    this.postToActivePanels(message);
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
    const docKey = uri.toString();
    const document = {
      uri,
      dispose: () => {
        this._documents.delete(docKey);
      },
    };
    this._documents.set(docKey, document);
    return document;
  }

  async saveCustomDocument(document: vscode.CustomDocument): Promise<void> {
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached) return;

    // Normalize paths for portable .nka files
    const normalized = await this.normalizePathsForSave(cached, document.uri.fsPath);
    const content = await this.serializeProjectForSave(document.uri, normalized);
    if (content === null) return;
    await vscode.workspace.fs.writeFile(document.uri, Buffer.from(content, 'utf-8'));
    this._projectCompatibilityCache.set(docKey, {
      loadedVersion: CURRENT_NKA_VERSION,
      currentVersion: CURRENT_NKA_VERSION,
      mode: 'current',
      readOnly: false,
      warnings: [],
    });
  }

  async saveCustomDocumentAs(
    document: vscode.CustomDocument,
    destination: vscode.Uri,
  ): Promise<void> {
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached) return;

    const normalized = await this.normalizePathsForSave(cached, destination.fsPath);
    const content = await this.serializeProjectForSave(document.uri, normalized);
    if (content === null) return;
    await vscode.workspace.fs.writeFile(destination, Buffer.from(content, 'utf-8'));
    this._projectCompatibilityCache.set(destination.toString(), {
      loadedVersion: CURRENT_NKA_VERSION,
      currentVersion: CURRENT_NKA_VERSION,
      mode: 'current',
      readOnly: false,
      warnings: [],
    });
  }

  async revertCustomDocument(document: vscode.CustomDocument): Promise<void> {
    const panel = this._activePanels.get(document.uri.toString());
    if (!panel) return;

    try {
      await panel.webview.postMessage({ type: 'revert' });
      // Re-send project:init with data from disk
      await this.initializeWebview(panel, document.uri);
    } catch (error) {
      if ((error as Error).message?.includes('disposed')) return;
      throw error;
    }
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
    let activeStreamKind: 'single-file' | 'project' | null = null;
    const stopPanelStream = async () => {
      if (activeStreamId) {
        await this._audioService?.stopStream(activeStreamId);
        activeStreamId = null;
        activeStreamKind = null;
      }
    };

    const postAudioError = async (request: AudioRequestMessage, error: unknown) => {
      await webviewPanel.webview.postMessage({
        type: 'audio:error',
        requestId: request.requestId,
        documentUri: document.uri.toString(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    };

    const parseAudioRequest = async <T extends AudioRequestMessage>(
      message: Record<string, unknown>,
      guard: AudioRequestGuard<T>,
    ): Promise<T | null> => {
      if (guard(message)) {
        return message;
      }
      await postInvalidAudioMessage(message, webviewPanel, document.uri);
      return null;
    };

    const startSingleFilePlayback = async (startTime: number) => {
      const filePath = await this.resolveAudioPath(document.uri);
      if (!filePath) throw new Error('No audio source is available for playback');
      await stopPanelStream();
      const result = await this._audioService?.startStream(filePath);
      if (!result) throw new Error('Unable to start audio stream');
      activeStreamId = result.streamId;
      activeStreamKind = 'single-file';
      if (startTime > 0) {
        await this._audioService?.seekStream(result.streamId, startTime);
      }
      return result;
    };

    const startProjectPlayback = async (startTime: number) => {
      await stopPanelStream();
      const { config, warnings } = await this.buildProjectMixConfig(document.uri);
      const result = await this._audioService?.startMixStream(config);
      this.logMixWarnings(warnings);
      if (!result) throw new Error('Unable to start project mix stream');
      activeStreamId = result.streamId;
      activeStreamKind = 'project';
      if (startTime > 0) {
        await this._audioService?.seekStream(result.streamId, startTime);
      }
      return { ...result, warnings: warnings.map((warning) => warning.message) };
    };

    const updateActiveProjectMixStream = async () => {
      if (!activeStreamId || activeStreamKind !== 'project') return;
      const { config, warnings } = await this.buildProjectMixConfig(document.uri);
      const update = await this._audioService?.updateMixStream(activeStreamId, config);
      this.logMixWarnings(warnings);
      for (const warning of update?.warnings ?? []) {
        logger.warn(warning);
      }
    };

    const handleAudioPlayback = async (request: AudioPlaybackRequestMessage) => {
      try {
        switch (request.action) {
          case 'play': {
            const startTime = request.startTime ?? 0;
            const result =
              request.mode === 'single-file'
                ? await startSingleFilePlayback(startTime)
                : await startProjectPlayback(startTime);
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackReady',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              streamId: result.streamId,
              wsUrl: result.streamUrl,
              warnings: 'warnings' in result ? result.warnings : undefined,
            });
            break;
          }
          case 'pause':
            if (activeStreamId) await this._audioService?.pauseStream(activeStreamId);
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackResult',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              success: true,
              streamId: activeStreamId ?? undefined,
            });
            break;
          case 'resume':
            if (activeStreamId) await this._audioService?.resumeStream(activeStreamId);
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackResult',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              success: true,
              streamId: activeStreamId ?? undefined,
            });
            break;
          case 'stop':
            await stopPanelStream();
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackResult',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              success: true,
            });
            break;
          case 'seek':
            if (typeof request.time === 'number' && activeStreamId) {
              await this._audioService?.seekStream(activeStreamId, request.time);
            }
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackResult',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              success: true,
              streamId: activeStreamId ?? undefined,
            });
            break;
          case 'setSpeed':
            if (typeof request.speed === 'number' && activeStreamId) {
              await this._audioService?.setStreamSpeed(activeStreamId, request.speed);
            }
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackResult',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              success: true,
              streamId: activeStreamId ?? undefined,
            });
            break;
          case 'setLoop':
            if (activeStreamId) {
              const region =
                request.loop &&
                typeof request.startTime === 'number' &&
                typeof request.time === 'number'
                  ? { inPoint: request.startTime, outPoint: request.time }
                  : null;
              await this._audioService?.setStreamLoop(activeStreamId, region);
            }
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackResult',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              success: true,
              streamId: activeStreamId ?? undefined,
            });
            break;
        }
      } catch (error) {
        await postAudioError(request, error);
      }
    };

    const handleAudioTrim = async (request: AudioTrimRequestMessage) => {
      const filePath = await this.resolveAudioPath(document.uri);
      if (!filePath) {
        await postAudioError(request, new Error('No audio source is available for trim'));
        return;
      }
      try {
        const output = request.outputPath ?? generateAudioOutputPath(filePath, 'trimmed');
        const result = await this._audioService?.transcode(filePath, output, {
          startTime: request.startTime,
          endTime: request.endTime,
        });
        await webviewPanel.webview.postMessage({
          type: 'audio:trimResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: true,
          outputPath: result,
        });
      } catch (error) {
        await webviewPanel.webview.postMessage({
          type: 'audio:trimResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const handleAudioEffects = async (request: AudioEffectsRequestMessage) => {
      const filePath = await this.resolveAudioPath(document.uri);
      if (!filePath) {
        await postAudioError(request, new Error('No audio source is available for effects'));
        return;
      }
      try {
        const output = request.outputPath ?? generateAudioOutputPath(filePath, 'fx');
        const result = await this._audioService?.transcode(filePath, output, {
          effects: request.effects,
        });
        await webviewPanel.webview.postMessage({
          type: 'audio:effectsResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: true,
          outputPath: result,
        });
        if (result) {
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(result));
        }
      } catch (error) {
        await webviewPanel.webview.postMessage({
          type: 'audio:effectsResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const handleAudioAnalyze = async (request: AudioAnalyzeRequestMessage) => {
      const filePath = await this.resolveAudioPath(document.uri);
      if (!filePath) {
        await postAudioError(request, new Error('No audio source is available for analysis'));
        return;
      }
      try {
        const result =
          request.kind === 'silence'
            ? { regions: await this._audioService?.detectSilence(filePath) }
            : await this._audioService?.analyzeLoudness(filePath);
        await webviewPanel.webview.postMessage({
          type: 'audio:analysisResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          kind: request.kind,
          result: (result ?? {}) as Record<string, unknown>,
        });
      } catch (error) {
        await postAudioError(request, error);
      }
    };

    const handleAudioExport = async (request: AudioExportRequestMessage) => {
      try {
        const format = request.format ?? request.codec ?? 'wav';
        const outputUri = request.outputPath
          ? vscode.Uri.file(request.outputPath)
          : await vscode.window.showSaveDialog({
              filters: { 'Audio Files': [exportAudioExtension(format)] },
              title: request.mode === 'single-file' ? 'Export Audio' : 'Export Mix',
            });
        if (!outputUri) return;

        if (request.mode === 'single-file') {
          const filePath = await this.resolveAudioPath(document.uri);
          if (!filePath) throw new Error('No audio source is available for export');
          const result = await this._audioService?.transcode(filePath, outputUri.fsPath, {
            format,
            sampleRate: request.sampleRate,
            bitrate: request.bitrate,
            channels: request.channels,
          });
          await webviewPanel.webview.postMessage({
            type: 'audio:exportResult',
            requestId: request.requestId,
            documentUri: document.uri.toString(),
            success: true,
            outputPath: result,
          });
          await vscode.commands.executeCommand('vscode.open', outputUri);
          return;
        }

        const { config, warnings } = await this.buildProjectMixConfig(document.uri);
        const result = await this._audioService?.mixExport(
          config,
          outputUri.fsPath,
          format,
          request.bitrate,
        );
        const allWarnings = [
          ...warnings.map((warning) => warning.message),
          ...(result?.warnings ?? []),
        ];
        for (const warning of allWarnings) {
          logger.warn(warning);
        }
        await webviewPanel.webview.postMessage({
          type: 'audio:exportResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: true,
          outputPath: result?.output ?? outputUri.fsPath,
          warnings: allWarnings,
        });
        await vscode.commands.executeCommand('vscode.open', outputUri);
      } catch (error) {
        await webviewPanel.webview.postMessage({
          type: 'audio:exportResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const handleAudioRecording = async (request: AudioRecordingRequestMessage) => {
      try {
        if (request.action === 'saveBlob') {
          if (!request.data) {
            throw new Error('data is required to save recording');
          }
          const audioPath = await this.resolveAudioPath(document.uri);
          const outputDir = audioPath ? path.dirname(audioPath) : path.dirname(document.uri.fsPath);
          const ext = request.mimeType === 'audio/webm' ? 'webm' : 'wav';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const outputPath =
            request.outputPath ?? path.join(outputDir, `recording-${timestamp}.${ext}`);
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(outputPath),
            Buffer.from(request.data, 'base64'),
          );
          await webviewPanel.webview.postMessage({
            type: 'audio:recordingResult',
            requestId: request.requestId,
            documentUri: document.uri.toString(),
            success: true,
            action: request.action,
            outputPath,
          });
          return;
        }
        if (request.action === 'listDevices') {
          const devices = await this._audioService?.listInputDevices();
          await webviewPanel.webview.postMessage({
            type: 'audio:recordingResult',
            requestId: request.requestId,
            documentUri: document.uri.toString(),
            success: true,
            action: request.action,
            devices: devices ?? [],
          });
          return;
        }
        if (request.action === 'start') {
          const audioPath = await this.resolveAudioPath(document.uri);
          const outputDir = audioPath ? path.dirname(audioPath) : path.dirname(document.uri.fsPath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const outputPath =
            request.outputPath ?? path.join(outputDir, `recording-${timestamp}.wav`);
          const result = await this._audioService?.recordStart({
            outputPath,
            deviceId: request.deviceId,
          });
          await webviewPanel.webview.postMessage({
            type: 'audio:recordingResult',
            requestId: request.requestId,
            documentUri: document.uri.toString(),
            success: true,
            action: request.action,
            streamId: result?.streamId,
            monitorUrl: result?.monitorUrl,
          });
          return;
        }
        if (!request.streamId) {
          throw new Error('streamId is required to stop recording');
        }
        const result = await this._audioService?.recordStop(request.streamId);
        await webviewPanel.webview.postMessage({
          type: 'audio:recordingResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: true,
          action: request.action,
          outputPath: result?.path,
          durationSeconds: result?.durationSeconds,
        });
      } catch (error) {
        await webviewPanel.webview.postMessage({
          type: 'audio:recordingResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: false,
          action: request.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const handleProjectImportAudio = async (
      request:
        | { type: 'project:importAudio' }
        | { type: 'project:dropImportAudio'; uris: string[] },
    ) => {
      try {
        if (!this._audioService?.isAvailable) {
          throw new Error('AudioService not available for import');
        }

        const filePaths =
          request.type === 'project:importAudio'
            ? (
                await vscode.window.showOpenDialog({
                  canSelectMany: true,
                  filters: { 'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
                  title: vscode.l10n.t('neko.audio.import.title'),
                })
              )?.map((uri) => uri.fsPath)
            : request.uris?.map((uri) => vscode.Uri.parse(uri).fsPath);

        if (!filePaths || filePaths.length === 0) return;

        const result = await this.importAudioFiles(filePaths, document, webviewPanel);
        await webviewPanel.webview.postMessage({
          type: 'project:importAudioResult',
          payload: {
            success: result.errors.length === 0,
            importedCount: result.importedCount,
            error:
              result.errors.length > 0
                ? `Failed to import some files:\n${result.errors.join('\n')}`
                : undefined,
          },
        });
      } catch (error) {
        await webviewPanel.webview.postMessage({
          type: 'project:importAudioResult',
          payload: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
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

          case 'operationApplied': {
            // Incremental sync: apply EditOperation to in-memory cache
            if (!msg.operation || typeof msg.operation !== 'object') {
              logger.warn('Ignoring invalid operationApplied message');
              break;
            }
            const operation = msg.operation as EditOperation;
            const docKey = document.uri.toString();
            const cached = this._projectDataCache.get(docKey);
            if (cached) {
              try {
                if (!this.isAudioProjectEditOperation(operation)) {
                  throw new Error(`Unsupported audio project operation: ${operation.type}`);
                }
                const newData = this.applyEditOperation(cached, operation);
                this._projectDataCache.set(docKey, newData);
                this.fireDirty(docKey, {
                  operation,
                  before: cached,
                  after: newData,
                  reason: 'external-change',
                });
                await updateActiveProjectMixStream();
              } catch (e) {
                logger.error('Incremental sync failed, will resync on save', e);
              }
            }
            break;
          }

          case 'audio:playback': {
            const request = await parseAudioRequest(msg, isAudioPlaybackRequestMessage);
            if (request) await handleAudioPlayback(request);
            break;
          }

          case 'audio:trim': {
            const request = await parseAudioRequest(msg, isAudioTrimRequestMessage);
            if (request) await handleAudioTrim(request);
            break;
          }

          case 'audio:effects': {
            const request = await parseAudioRequest(msg, isAudioEffectsRequestMessage);
            if (request) await handleAudioEffects(request);
            break;
          }

          case 'audio:analyze': {
            const request = await parseAudioRequest(msg, isAudioAnalyzeRequestMessage);
            if (request) await handleAudioAnalyze(request);
            break;
          }

          case 'audio:export': {
            const request = await parseAudioRequest(msg, isAudioExportRequestMessage);
            if (request) await handleAudioExport(request);
            break;
          }

          case 'audio:recording': {
            const request = await parseAudioRequest(msg, isAudioRecordingRequestMessage);
            if (request) await handleAudioRecording(request);
            break;
          }

          case 'project:importAudio':
            await handleProjectImportAudio({ type: 'project:importAudio' });
            break;

          case 'project:dropImportAudio': {
            const uris = Array.isArray(msg.uris)
              ? msg.uris.filter((uri): uri is string => typeof uri === 'string')
              : [];
            await handleProjectImportAudio({ type: 'project:dropImportAudio', uris });
            break;
          }

          default:
            break;
        }
      },
    );

    // Cleanup
    webviewPanel.onDidDispose(async () => {
      messageDisposable.dispose();
      this._activePanels.delete(docKey);
      this._documents.delete(docKey);
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
  ): Promise<{ importedCount: number; errors: string[] }> {
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached || !this._audioService?.isAvailable) {
      return { importedCount: 0, errors: ['No audio project is loaded'] };
    }

    const newTracks = [...cached.tracks];
    const errors: string[] = [];

    for (const filePath of filePaths) {
      try {
        logger.info(`Importing audio file: ${filePath}`);
        const audioInfo = await this._audioService.probeAudio(filePath);
        const elementId = generateId();
        const trackId = generateId();

        const element = createDefaultAudioElement({
          id: elementId,
          filePath,
          duration: audioInfo.duration,
        });

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
        logger.info(`Successfully imported: ${filePath}`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to import ${filePath}:`, error);
        errors.push(`${path.basename(filePath)}: ${errMsg}`);
      }
    }

    const importedTracks = newTracks.slice(cached.tracks.length);
    if (importedTracks.length === 0) {
      return { importedCount: 0, errors };
    }

    const importOperations: AudioProjectEditOperation[] = importedTracks.map((track, offset) => ({
      type: 'track.add',
      meta: createImportOperationMeta(`Import audio: ${track.name}`),
      payload: { track, index: cached.tracks.length + offset },
    }));

    // Update cache immutably
    const updated = { ...cached, tracks: newTracks };
    this._projectDataCache.set(docKey, updated);

    this.fireDirty(docKey, {
      operation: createImportBatchOperation(importOperations),
      before: cached,
      after: updated,
      reason: 'external-change',
    });

    // Re-initialize webview with updated project
    await this.initializeWebview(panel, document.uri);
    const successCount = filePaths.length - errors.length;
    logger.info(`Imported ${successCount}/${filePaths.length} audio file(s) as new tracks`);
    return { importedCount: successCount, errors };
  }

  /** Read .nka JSON and send project:init to webview */
  private async initializeWebview(panel: vscode.WebviewPanel, nkaUri: vscode.Uri): Promise<void> {
    try {
      const docKey = nkaUri.toString();

      // Use cached data if available (e.g. after importAudioFiles updates the cache)
      let projectData = this._projectDataCache.get(docKey);

      if (!projectData) {
        // First open: read from disk
        const raw = await vscode.workspace.fs.readFile(nkaUri);
        const content = Buffer.from(raw).toString('utf-8');
        const nkaResult = loadNka(content);
        if (!nkaResult.validation.valid) {
          logger.warn(
            'NKA validation errors:',
            nkaResult.validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
          );
        }
        projectData = nkaResult.data;
        this._projectDataCache.set(docKey, projectData);
        this._projectCompatibilityCache.set(docKey, nkaResult.compatibility);
        if (nkaResult.compatibility.warnings.length > 0) {
          logger.warn('NKA compatibility warnings:', nkaResult.compatibility.warnings.join('; '));
        }
      }

      // Collect waveforms for all audio elements across tracks
      const waveforms: Record<string, WaveformData> = {};

      if (this._audioService?.isAvailable) {
        for (const track of projectData.tracks) {
          for (const element of track.elements) {
            if (isAudioElementWithSrc(element)) {
              const src = element.src;
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
        if (isAudioElementWithSrc(element)) {
          return element.src;
        }
      }
    }
    return null;
  }

  private async resolveAudioPath(nkaUri: vscode.Uri): Promise<string | null> {
    const fromCache = this.resolveAudioPathFromCache(nkaUri);
    if (fromCache) return fromCache;

    // Fallback: read from disk
    try {
      const raw = await vscode.workspace.fs.readFile(nkaUri);
      const nkaResult = loadNka(Buffer.from(raw).toString('utf-8'));
      const parsed = nkaResult.data;

      for (const track of parsed.tracks) {
        for (const element of track.elements) {
          if (isAudioElementWithSrc(element)) {
            return element.src;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async buildProjectMixConfig(nkaUri: vscode.Uri): Promise<{
    config: MixStreamConfig;
    warnings: MixConfigWarning[];
  }> {
    const cached = this._projectDataCache.get(nkaUri.toString());
    if (!cached) {
      throw new Error('No audio project data is loaded');
    }
    const projectDir = path.dirname(nkaUri.fsPath);
    const resolvedSources = await this.resolveProjectSources(cached, projectDir);

    const result = buildMixConfig(cached, {
      projectDir,
      resolveSourcePath: (src) => resolvedSources.get(src) ?? src,
    });

    return result;
  }

  private async resolveProjectSources(
    project: AudioProjectData,
    projectDir: string,
  ): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (isAudioElementWithSrc(element)) {
          resolved.set(element.src, await this.resolveProjectSourcePath(element.src, projectDir));
        }
      }
    }
    return resolved;
  }

  private async resolveProjectSourcePath(src: string, projectDir: string): Promise<string> {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }

    if (src.startsWith('/') || /^[A-Za-z]:[\\/]/.test(src)) {
      return src;
    }

    if (/^\/?\$\{[^}]+\}/.test(src)) {
      try {
        const resolved = await vscode.commands.executeCommand<string>(
          'neko.assets.resolvePath',
          src,
        );
        if (typeof resolved === 'string' && resolved.length > 0 && resolved !== src) {
          return resolved;
        }
      } catch (error) {
        logger.warn(`Unable to resolve audio source variable path: ${src}`, error);
      }
      return src;
    }

    return path.resolve(projectDir, src);
  }

  private logMixWarnings(warnings: MixConfigWarning[]): void {
    for (const warning of warnings) {
      logger.warn(warning.message);
    }
  }

  private applyEditOperation(
    data: AudioProjectData,
    operation: AudioProjectEditOperation,
  ): AudioProjectData {
    return applySharedOperation(data, operation);
  }

  private isAudioProjectEditOperation(
    operation: EditOperation,
  ): operation is AudioProjectEditOperation {
    switch (operation.type) {
      case 'track.add':
      case 'track.remove':
      case 'track.update':
      case 'track.reorder':
      case 'track.toggle':
      case 'element.add':
      case 'element.remove':
      case 'element.update':
      case 'element.move':
      case 'element.toggle':
      case 'element.linkAudio':
      case 'element.unlinkAudio':
      case 'element.splitAt':
      case 'element.splitKeepLeft':
      case 'element.splitKeepRight':
      case 'audio.effect.add':
      case 'audio.effect.remove':
      case 'audio.effect.update':
      case 'audio.effect.toggle':
      case 'audio.effect.move':
      case 'audio.marker.add':
      case 'audio.marker.remove':
      case 'audio.marker.update':
      case 'audio.setBpm':
      case 'track.mix.setVolume':
      case 'track.mix.setPan':
      case 'track.mix.setSolo':
      case 'track.mix.effect.add':
      case 'track.mix.effect.remove':
      case 'track.mix.effect.update':
      case 'track.mix.effect.move':
        return true;
      case 'batch':
        return operation.payload.operations.every((child) =>
          this.isAudioProjectEditOperation(child),
        );
      default:
        return false;
    }
  }

  private resolveFocusedProjectKey(): string | null {
    for (const [key, panel] of this._activePanels) {
      if (panel.active || panel.visible) return key;
    }

    const first = this._activePanels.keys().next();
    return first.done ? null : first.value;
  }

  private toDocumentKey(documentUri: string): string {
    try {
      return vscode.Uri.parse(documentUri).toString();
    } catch {
      return documentUri;
    }
  }

  private fireDirty(
    docKey: string,
    edit: {
      operation?: AudioProjectEditOperation;
      before: AudioProjectData;
      after: AudioProjectData;
      reason: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change';
    },
  ): void {
    const document = this._documents.get(docKey);
    if (!document) {
      logger.warn(`Unable to fire dirty event for unknown audio project document: ${docKey}`);
      return;
    }

    this._onDidChangeCustomDocument.fire({
      document,
      undo: async () => {
        const current = this._projectDataCache.get(docKey);
        const reverted =
          edit.operation && current
            ? this.applyEditOperation(
                current,
                invertOperation(edit.operation) as AudioProjectEditOperation,
              )
            : edit.before;
        this._projectDataCache.set(docKey, reverted);
        await this.postProjectSync(
          docKey,
          reverted,
          edit.operation ?? createProjectSnapshotOperation(),
          edit.reason,
        );
      },
      redo: async () => {
        this._projectDataCache.set(docKey, edit.after);
        await this.postProjectSync(
          docKey,
          edit.after,
          edit.operation ?? createProjectSnapshotOperation(),
          edit.reason,
        );
      },
    });
  }

  private async postProjectSync(
    docKey: string,
    projectData: AudioProjectData,
    operation: EditOperation,
    reason: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change',
  ): Promise<void> {
    const panel = this._activePanels.get(docKey);
    if (!panel) {
      logger.warn(`No active audio project webview for sync: ${docKey}`);
      return;
    }

    await panel.webview.postMessage({
      type: 'project:sync',
      documentUri: docKey,
      projectData,
      operation,
      reason,
    });
  }

  // =========================================================================
  // Path Normalization
  // =========================================================================

  /**
   * Normalize element paths for portable .nka files.
   * External paths → ${VAR}/rest via PathResolver; internal → relative.
   */
  private async normalizePathsForSave(
    project: AudioProjectData,
    projectFilePath: string,
  ): Promise<AudioProjectData> {
    const baseDir = path.dirname(projectFilePath);
    const normalized = structuredClone(project);

    for (const track of normalized.tracks) {
      for (const element of track.elements) {
        if (isAudioElementWithSrc(element) && path.isAbsolute(element.src)) {
          // Try PathVariable for external paths
          let portable: string | undefined;
          try {
            const contracted = await vscode.commands.executeCommand<string>(
              'neko.assets.contractPath',
              element.src,
            );
            if (contracted && contracted.startsWith('${')) {
              portable = contracted;
            }
          } catch {
            // neko-assets not active
          }

          if (!portable) {
            portable = path.relative(baseDir, element.src).split(path.sep).join('/');
          }

          element.src = portable;
        }
      }
    }

    return normalized;
  }

  private async serializeProjectForSave(
    sourceUri: vscode.Uri,
    project: AudioProjectData,
  ): Promise<string | null> {
    const compatibility = this._projectCompatibilityCache.get(sourceUri.toString());
    if (compatibility?.readOnly) {
      const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t(
          'This audio project was created by a newer Neko Audio version. Saving will downgrade it to .nka {0} and remove unsupported future fields.',
          CURRENT_NKA_VERSION,
        ),
        { modal: true },
        vscode.l10n.t('Save and Downgrade'),
      );
      if (choice !== vscode.l10n.t('Save and Downgrade')) {
        logger.info('Cancelled future-version NKA downgrade save');
        return null;
      }
    }

    return saveNka(project);
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    this._onDidChangeCustomDocument.dispose();
    this._activePanels.clear();
    this._projectDataCache.clear();
    this._projectCompatibilityCache.clear();
    this._documents.clear();
  }
}
