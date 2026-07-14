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
 * 1. Open .nka → ProjectFileStore → cache project data → probe tracks → waveforms
 * 2. Send project:init to Webview (projectData + waveforms)
 * 3. Webview edits → operationApplied → apply to cache → fire onDidChangeCustomDocument
 * 4. Save → ProjectFileStore(cache) → write .nka
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
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
import {
  contractWorkspaceMediaPath,
  createDefaultProjectFormatCodecRegistry,
  handleProjectSourceAddHostRequest,
  handleProjectSourceAddRequest,
  ingestProjectSourceAddRequest,
  nkaSourcePathPolicy,
  ProjectFileStore,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
  resolveWorkspaceMediaPath,
  type ProjectFileSaveReason,
  type WorkspaceMediaPathContext,
} from '@neko/shared';
import {
  contractHostContentMediaPath,
  createHostContentAccessRuntime,
  createFocusedWebviewRegistry,
  createProjectSnapshotPackage,
  createVSCodeProjectFileIoAdapter,
  createVSCodeWorkspaceMediaPathContext,
  formatProjectFileDiagnostics,
  normalizeVSCodeProjectSourceAddRequest,
  ProjectFileSaveSession,
  resolveHostContentMediaPath,
  type HostContentPathResolverOptions,
  type IFocusedWebviewRegistry,
} from '@neko/shared/vscode/extension';
import type { MixStreamConfig } from '@neko/shared';
import type { AudioService } from '../services/AudioService';
import type {
  AudioProjectEditOperation,
  AudioProjectSessionGateway,
  ProjectSession,
} from '../services/audioProjectSessionGateway';
import {
  createAudioStreamRequiredError,
  diagnosticsFromAudioRuntimeError,
} from '../services/audioRuntimeDiagnostics';
import { promoteDurableAudioRecording } from '../services/recordingPromotion';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';
import {
  applyOperation as applySharedOperation,
  buildMixConfig,
  CURRENT_NKA_VERSION,
  invertOperation,
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

function isExistingLocalFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isPathAuthorized(filePath: string, roots: readonly string[] | undefined): boolean {
  if (!roots || roots.length === 0) return true;
  return roots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
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

function readProjectSourceAddDisplayName(
  request: ProjectSourceAddRequest,
  fallbackPath: string,
): string {
  const metadataName = request.metadata?.['name'];
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName;
  }
  return request.browserFile?.name ?? path.basename(request.sourcePath ?? fallbackPath);
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
  private readonly _focusedWebviews: IFocusedWebviewRegistry;
  private readonly _projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly _projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: this._projectFileAdapter.fileOps,
    logger,
  });
  private readonly _projectFileSession = new ProjectFileSaveSession<AudioProjectData>({
    formatId: 'nka',
    store: this._projectFileStore,
    sourcePolicy: nkaSourcePathPolicy,
    createSourcePolicyOptions: (uri) => ({
      context: this.createWorkspaceMediaPathContext(vscode.Uri.file(uri.fsPath)),
    }),
    logger,
  });

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<vscode.CustomDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ) {
    this._focusedWebviews = focusedWebviews;
  }

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

  /** Read only the live cache bound to the requested project URI. */
  getProjectDataForDocument(documentUri: string): AudioProjectData | undefined {
    return this._projectDataCache.get(this.toDocumentKey(documentUri));
  }

  async resolveSession(documentUri?: string): Promise<ProjectSession | null> {
    const docKey = documentUri ? this.toDocumentKey(documentUri) : this.resolveFocusedProjectKey();
    if (!docKey) return null;

    return await this.ensureProjectSession(docKey);
  }

  async linkAudioSource(session: ProjectSession, sourcePath: string): Promise<string> {
    const docKey = this.toDocumentKey(session.documentUri);
    await this.ensureProjectSession(docKey);
    const projectUri = vscode.Uri.parse(docKey);
    const fileName = path.basename(sourcePath);
    const result = await this.acquireAudioProjectSource(
      {
        requestId: `audio-tool-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        kind: 'programmatic',
        formatId: 'nka',
        documentUri: projectUri.toString(),
        sourcePath,
        browserFile: { name: fileName },
        target: { role: 'audio' },
        destination: { kind: 'project', directory: 'audio', copyMode: 'link' },
        ingestMode: 'link',
        caller: 'neko-audio.tool-add-source',
        metadata: { audioAdd: true, name: fileName },
      },
      projectUri,
    );
    if (!result.ok || !result.durablePath) {
      throw new Error(
        result.diagnostics[0]?.message ?? `Unable to link audio source: ${sourcePath}`,
      );
    }
    return result.durablePath;
  }

  async applyOperation(
    session: ProjectSession,
    operation: AudioProjectEditOperation,
    options?: { syncReason?: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change' },
  ): Promise<ProjectSession> {
    const docKey = this.toDocumentKey(session.documentUri);
    const current = await this.ensureProjectSession(docKey);
    const syncReason = options?.syncReason ?? 'agent-edit';

    const projectData = this.applyEditOperation(current.projectData, operation);
    const projectUri = vscode.Uri.parse(docKey);
    const normalized = await this.normalizePathsForSave(projectData, projectUri);
    const savedProjectData = await this.saveAuthoringProjectWithStore(
      projectUri,
      normalized,
      this.toProjectFileSaveReason(syncReason),
    );
    this._projectDataCache.set(docKey, savedProjectData);
    await this.postProjectSync(docKey, savedProjectData, operation, syncReason);
    return { documentUri: docKey, projectData: savedProjectData };
  }

  async buildMixConfig(session: ProjectSession): Promise<{
    config: MixStreamConfig;
    warnings: MixConfigWarning[];
  }> {
    const current = await this.ensureProjectSession(session.documentUri);
    return this.buildProjectMixConfig(vscode.Uri.parse(current.documentUri));
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

  async postCommandToFocusedPanel(command: string): Promise<boolean> {
    return this._focusedWebviews.postKeyboardAction(command, {
      viewType: AudioProjectProvider.viewType,
      allowRecentVisibleFallback: false,
      allowSingleVisibleFallback: true,
    });
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
    const normalized = await this.normalizePathsForSave(cached, document.uri);
    const saved = await this.saveProjectWithStore(
      document.uri,
      document.uri,
      normalized,
      'vscode-save',
    );
    if (!saved) return;
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

    const normalized = await this.normalizePathsForSave(cached, destination);
    const saved = await this.saveProjectWithStore(destination, document.uri, normalized, 'save-as');
    if (!saved) return;
    this._projectCompatibilityCache.set(destination.toString(), {
      loadedVersion: CURRENT_NKA_VERSION,
      currentVersion: CURRENT_NKA_VERSION,
      mode: 'current',
      readOnly: false,
      warnings: [],
    });
  }

  async revertCustomDocument(document: vscode.CustomDocument): Promise<void> {
    const docKey = document.uri.toString();
    const panel = this._activePanels.get(docKey);
    if (!panel) return;

    try {
      await panel.webview.postMessage({ type: 'revert' });
      if (!this._activePanels.has(docKey)) return;
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
    const focusedRegistration = this._focusedWebviews.register({
      id: docKey,
      viewType: AudioProjectProvider.viewType,
      documentUri: docKey,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });

    // Configure webview
    const contentRuntime = createHostContentAccessRuntime({
      extensionUri: this._extensionUri,
      localResourceAccessOptions: { includeExtensionCache: false },
      sourceFileProvider: { enabled: false },
      documentEntryProvider: { enabled: false },
      ingest: { enabled: false },
    });
    if (!contentRuntime.localResourceAccess) {
      throw new Error('Audio project editor requires LocalResourceAccessService.');
    }
    await contentRuntime.localResourceAccess.configureWebview(webviewPanel.webview, {
      enableScripts: true,
    });

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
        diagnostics: diagnosticsFromAudioRuntimeError(error),
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
            if (!activeStreamId) {
              throw createAudioStreamRequiredError(
                'audio-project.playback.seek',
                'Cannot seek because no audio stream is active.',
              );
            }
            if (typeof request.time === 'number') {
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
            if (!activeStreamId) {
              throw createAudioStreamRequiredError(
                'audio-project.playback.setSpeed',
                'Cannot set playback speed because no audio stream is active.',
              );
            }
            if (typeof request.speed === 'number') {
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
            if (!activeStreamId) {
              throw createAudioStreamRequiredError(
                'audio-project.playback.setLoop',
                'Cannot set playback loop because no audio stream is active.',
              );
            }
            const region =
              request.loop &&
              typeof request.startTime === 'number' &&
              typeof request.time === 'number'
                ? { inPoint: request.startTime, outPoint: request.time }
                : null;
            await this._audioService?.setStreamLoop(activeStreamId, region);
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
          const warnings = await promoteDurableAudioRecording({
            filePath: outputPath,
            workspaceRoot:
              vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          });
          await webviewPanel.webview.postMessage({
            type: 'audio:recordingResult',
            requestId: request.requestId,
            documentUri: document.uri.toString(),
            success: true,
            action: request.action,
            outputPath,
            warnings,
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
        const warnings = result?.path
          ? await promoteDurableAudioRecording({
              filePath: result.path,
              workspaceRoot:
                vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            })
          : [];
        await webviewPanel.webview.postMessage({
          type: 'audio:recordingResult',
          requestId: request.requestId,
          documentUri: document.uri.toString(),
          success: true,
          action: request.action,
          outputPath: result?.path,
          durationSeconds: result?.durationSeconds,
          warnings,
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

    // Handle messages from webview
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (msg: Record<string, unknown>) => {
        const type = msg.type as string;

        switch (type) {
          case 'ready':
            this._focusedWebviews.syncFocus(docKey);
            await this.initializeWebview(webviewPanel, document.uri);
            break;

          case 'webviewKeyboardFocus':
            if (typeof msg.focused !== 'boolean') {
              break;
            }
            this._focusedWebviews.markKeyboardFocused(docKey, msg.focused);
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

          case 'project:package': {
            const cached = this._projectDataCache.get(docKey);
            const sourceBytes = cached
              ? Buffer.from(
                  saveNka(await this.normalizePathsForSave(cached, document.uri)),
                  'utf-8',
                )
              : undefined;
            await createProjectSnapshotPackage({
              packageId: 'neko-audio',
              title: 'Package Audio Project',
              sourceUri: document.uri,
              sourceBytes,
              metadata: {
                kind: 'audio-project',
                viewType: AudioProjectProvider.viewType,
              },
            });
            break;
          }

          case 'audio:recording': {
            const request = await parseAudioRequest(msg, isAudioRecordingRequestMessage);
            if (request) await handleAudioRecording(request);
            break;
          }

          case 'project:addSource': {
            await this.handleAudioProjectAddSource(
              (msg as { request?: ProjectSourceAddRequest }).request,
              document,
              webviewPanel,
            );
            break;
          }

          default:
            break;
        }
      },
    );

    webviewPanel.onDidChangeViewState((event) => {
      this._focusedWebviews.markVisible(docKey, event.webviewPanel.visible);
      if (event.webviewPanel.active) {
        this._focusedWebviews.markActive(docKey);
      } else {
        this._focusedWebviews.markInactive(docKey);
      }
    });

    // Cleanup
    webviewPanel.onDidDispose(async () => {
      focusedRegistration.dispose();
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
  private async handleAudioProjectAddSource(
    request: ProjectSourceAddRequest | undefined,
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    if (!request) return;
    if (this.isAudioFilePickerSourceAddRequest(request)) {
      await this.handleAudioProjectFilePickerSourceAdd(request, document, panel);
      return;
    }
    await handleProjectSourceAddHostRequest(request, {
      addSource: (sourceRequest) =>
        this.addAudioProjectSource(
          normalizeVSCodeProjectSourceAddRequest(sourceRequest),
          document,
          panel,
        ),
      postMessage: (message) => panel.webview.postMessage(message),
      logger,
    });
  }

  private isAudioFilePickerSourceAddRequest(request: ProjectSourceAddRequest): boolean {
    return (
      request.kind === 'file-picker' &&
      request.formatId === 'nka' &&
      !request.sourcePath &&
      !request.sourceUri &&
      !request.bytes &&
      !request.generatedAssetId
    );
  }

  private async handleAudioProjectFilePickerSourceAdd(
    request: ProjectSourceAddRequest,
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    try {
      if (!this._audioService?.isAvailable) {
        throw new Error('AudioService not available for import');
      }

      const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: { 'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
        title: vscode.l10n.t('neko.audio.import.title'),
      });
      if (!uris || uris.length === 0) {
        await handleProjectSourceAddHostRequest(request, {
          addSource: async () => ({
            requestId: request.requestId,
            ok: false,
            diagnostics: [
              {
                code: 'add-source-cancelled',
                severity: 'info',
                message: 'Audio source selection was cancelled.',
                recoverability: 'none',
              },
            ],
          }),
          postMessage: (message) => panel.webview.postMessage(message),
          logger,
        });
        return;
      }

      const selectedRequests = uris.map((uri, index) =>
        this.createAudioProjectSourceAddRequest(uri, document.uri, {
          kind: 'file-picker',
          requestId: index === 0 ? request.requestId : `${request.requestId}-${index}`,
          caller: request.caller ?? 'neko-audio.project-add-source',
          metadata: request.metadata,
        }),
      );
      await this.addAudioProjectSources(selectedRequests, document, panel);
    } catch (error) {
      await handleProjectSourceAddHostRequest(request, {
        addSource: async () => ({
          requestId: request.requestId,
          ok: false,
          diagnostics: [
            {
              code: 'add-source-failed',
              severity: 'error',
              message: error instanceof Error ? error.message : String(error),
              recoverability: 'manual',
            },
          ],
        }),
        postMessage: (message) => panel.webview.postMessage(message),
        logger,
      });
    }
  }

  private async addAudioProjectSources(
    requests: readonly ProjectSourceAddRequest[],
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    for (const request of requests) {
      await handleProjectSourceAddHostRequest(request, {
        addSource: (sourceRequest) =>
          this.addAudioProjectSource(
            normalizeVSCodeProjectSourceAddRequest(sourceRequest),
            document,
            panel,
          ),
        postMessage: (message) => panel.webview.postMessage(message),
        logger,
      });
    }
  }

  private async addAudioProjectSource(
    request: ProjectSourceAddRequest,
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<ProjectSourceAddResult> {
    const docKey = document.uri.toString();
    const cached = this._projectDataCache.get(docKey);
    if (!cached || !this._audioService?.isAvailable) {
      return {
        requestId: request.requestId,
        ok: false,
        diagnostics: [
          {
            code: 'invalid-document',
            severity: 'error',
            message: 'No audio project is loaded',
            recoverability: 'manual',
          },
        ],
      };
    }

    const result = await this.acquireAudioProjectSource(request, document.uri);

    if (!result.ok || !result.durablePath) {
      return result;
    }

    try {
      const runtimePath = await this.resolveProjectSourcePath(result.durablePath, document.uri);
      logger.info(`Importing audio source: ${runtimePath}`);
      const audioInfo = await this._audioService.probeAudio(runtimePath);
      const elementId = generateId();
      const trackId = generateId();
      const name = readProjectSourceAddDisplayName(request, runtimePath);

      const element = createDefaultAudioElement({
        id: elementId,
        filePath: result.durablePath,
        duration: audioInfo.duration,
      });

      const track: TimelineTrack = {
        id: trackId,
        type: 'audio',
        name: path.basename(name, path.extname(name)),
        elements: [element],
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
      };

      const operation: AudioProjectEditOperation = {
        type: 'track.add',
        meta: createImportOperationMeta(`Add audio source: ${track.name}`),
        payload: { track, index: cached.tracks.length },
      };
      const updated = this.applyEditOperation(cached, operation);
      this._projectDataCache.set(docKey, updated);

      this.fireDirty(docKey, {
        operation,
        before: cached,
        after: updated,
        reason: 'external-change',
      });

      await this.initializeWebview(panel, document.uri);
      logger.info(`Successfully added audio source: ${runtimePath}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to add audio source:`, error);
      return {
        ...result,
        ok: false,
        diagnostics: [
          ...result.diagnostics,
          {
            code: 'add-source-failed',
            severity: 'error',
            message,
            recoverability: 'manual',
          },
        ],
      };
    }
  }

  private createAudioProjectSourceAddRequest(
    uri: vscode.Uri,
    documentUri: vscode.Uri,
    options: {
      readonly kind: ProjectSourceAddRequest['kind'];
      readonly requestId: string;
      readonly caller: string;
      readonly metadata?: Record<string, unknown>;
    },
  ): ProjectSourceAddRequest {
    return {
      requestId: options.requestId,
      kind: options.kind,
      formatId: 'nka',
      documentUri: documentUri.toString(),
      sourceUri: uri.toString(),
      sourcePath: uri.fsPath,
      browserFile: { name: path.basename(uri.fsPath) },
      target: { role: 'audio' },
      destination: { kind: 'project', directory: 'audio', copyMode: 'link' },
      ingestMode: 'link',
      caller: options.caller,
      metadata: { ...(options.metadata ?? {}), audioAdd: true, name: path.basename(uri.fsPath) },
    };
  }

  private async acquireAudioProjectSource(
    request: ProjectSourceAddRequest,
    projectUri: vscode.Uri,
  ): Promise<ProjectSourceAddResult> {
    return await handleProjectSourceAddRequest(
      {
        ...request,
        caller: request.caller ?? 'neko-audio.project-add-source',
        target: request.target ?? { role: 'audio' },
        destination: {
          kind: 'project',
          directory: request.destination.directory ?? 'audio',
          copyMode: request.destination.copyMode ?? (request.bytes ? 'copy' : 'link'),
        },
      },
      {
        ingest: (ingestRequest) =>
          ingestProjectSourceAddRequest(ingestRequest, {
            documentPath: projectUri.fsPath,
            assetDirectory: request.destination.directory ?? 'audio',
            workspaceContext: this.createWorkspaceMediaPathContext(projectUri),
            fileOps: this.createAudioSourceAssetFileOps(),
            contractPath: (absolutePath) =>
              this.contractExternalAudioSourcePath(absolutePath, projectUri),
            unmanagedSourceMessage:
              'Audio source must be moved into the project, asset library, or a configured media root before saving.',
          }),
      },
    );
  }

  private createAudioSourceAssetFileOps() {
    return {
      createDirectory: async (dirPath: string) =>
        vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath)),
      fileExists: async (filePath: string) => {
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
          return true;
        } catch {
          return false;
        }
      },
      writeFile: async (filePath: string, bytes: Uint8Array) =>
        vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), bytes),
    };
  }

  private async contractExternalAudioSourcePath(
    absolutePath: string,
    projectUri: vscode.Uri,
  ): Promise<string | undefined> {
    const context = this.createWorkspaceMediaPathContext(projectUri);
    const contracted = await contractHostContentMediaPath(
      absolutePath,
      this.createHostContentPathOptions(projectUri, context),
    );
    if (contracted && !path.isAbsolute(contracted)) {
      return contracted;
    }
    return undefined;
  }

  /** Read .nka JSON and send project:init to webview */
  private async initializeWebview(panel: vscode.WebviewPanel, nkaUri: vscode.Uri): Promise<void> {
    try {
      const docKey = nkaUri.toString();

      // Use cached data if available (e.g. after importAudioFiles updates the cache)
      let projectData = this._projectDataCache.get(docKey);

      if (!projectData) {
        // First open: read from disk
        const loaded = await this.loadProjectWithStore(nkaUri);
        if (!loaded.projectData) {
          throw new Error(formatProjectFileDiagnostics(loaded.diagnostics, 'Failed to load NKA'));
        }
        projectData = loaded.projectData;
        this._projectDataCache.set(docKey, projectData);
        if (loaded.compatibility) {
          this._projectCompatibilityCache.set(docKey, loaded.compatibility);
          if (loaded.compatibility.warnings.length > 0) {
            logger.warn('NKA compatibility warnings:', loaded.compatibility.warnings.join('; '));
          }
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
                const waveformSource = await this.resolveProjectSourcePath(src, nkaUri);
                const waveform = await this._audioService.getWaveform(waveformSource);
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
    if (fromCache) return this.resolveProjectSourcePath(fromCache, nkaUri);

    // Fallback: read from disk
    try {
      const loaded = await this.loadProjectWithStore(nkaUri);
      const parsed = loaded.projectData;
      if (!parsed) return null;

      for (const track of parsed.tracks) {
        for (const element of track.elements) {
          if (isAudioElementWithSrc(element)) {
            return this.resolveProjectSourcePath(element.src, nkaUri);
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
    const session = await this.ensureProjectSession(nkaUri.toString());
    const cached = session.projectData;
    const projectDir = path.dirname(nkaUri.fsPath);
    const resolvedSources = await this.resolveProjectSources(cached, nkaUri);

    const result = buildMixConfig(cached, {
      projectDir,
      resolveSourcePath: (src) => resolvedSources.get(src) ?? src,
    });

    return result;
  }

  private async resolveProjectSources(
    project: AudioProjectData,
    nkaUri: vscode.Uri,
  ): Promise<Map<string, string>> {
    const resolved = new Map<string, string>();
    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (isAudioElementWithSrc(element)) {
          resolved.set(element.src, await this.resolveProjectSourcePath(element.src, nkaUri));
        }
      }
    }
    return resolved;
  }

  private async resolveProjectSourcePath(src: string, nkaUri: vscode.Uri): Promise<string> {
    const context = this.createWorkspaceMediaPathContext(nkaUri);

    try {
      return await resolveHostContentMediaPath(
        src,
        this.createHostContentPathOptions(nkaUri, context, { fileExists: isExistingLocalFile }),
      );
    } catch (error) {
      logger.warn(
        `Unable to resolve audio source path through shared content policy: ${src}`,
        error,
      );
    }

    const resolved = resolveWorkspaceMediaPath({
      source: src,
      context,
      fileExists: isExistingLocalFile,
      isPathAuthorized: (filePath) => isPathAuthorized(filePath, context.allowedRoots),
    });
    if (resolved.status === 'resolved-local') return resolved.path;
    if (resolved.status === 'remote') return resolved.url;

    const diagnostic = resolved.diagnostics[resolved.diagnostics.length - 1];
    throw new Error(diagnostic?.message ?? `Unable to resolve audio source: ${src}`);
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
      case 'audio.setTimeSignature':
      case 'audio.setMasterVolume':
      case 'track.mix.setVolume':
      case 'track.mix.setPan':
      case 'track.mix.setSolo':
      case 'track.mix.effect.add':
      case 'track.mix.effect.remove':
      case 'track.mix.effect.update':
      case 'track.mix.effect.move':
      case 'track.mix.setAutomation':
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
      if (path.isAbsolute(documentUri)) {
        return vscode.Uri.file(documentUri).toString();
      }
      return vscode.Uri.parse(documentUri).toString();
    } catch {
      return documentUri;
    }
  }

  private async ensureProjectSession(documentUri: string): Promise<ProjectSession> {
    const docKey = this.toDocumentKey(documentUri);
    const cached = this._projectDataCache.get(docKey);
    if (cached) {
      return { documentUri: docKey, projectData: cached };
    }

    const projectUri = vscode.Uri.parse(docKey);
    const loaded = await this.loadProjectWithStore(projectUri);
    if (!loaded.projectData) {
      throw new Error(formatProjectFileDiagnostics(loaded.diagnostics, 'Failed to load NKA'));
    }

    this._projectDataCache.set(docKey, loaded.projectData);
    if (loaded.compatibility) {
      this._projectCompatibilityCache.set(docKey, loaded.compatibility);
    }
    return { documentUri: docKey, projectData: loaded.projectData };
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
    projectUri: vscode.Uri,
  ): Promise<AudioProjectData> {
    const context = this.createWorkspaceMediaPathContext(projectUri);
    const normalized = structuredClone(project);

    for (const track of normalized.tracks) {
      for (const element of track.elements) {
        if (isAudioElementWithSrc(element) && path.isAbsolute(element.src)) {
          // Try PathVariable for external paths
          let portable = await contractHostContentMediaPath(
            element.src,
            this.createHostContentPathOptions(projectUri, context),
          );
          if (portable && path.isAbsolute(portable)) {
            portable = undefined;
          }

          if (!portable) {
            const contracted = contractWorkspaceMediaPath(element.src, context);
            portable = contracted.path;
          }

          element.src = portable;
        }
      }
    }

    return normalized;
  }

  private createWorkspaceMediaPathContext(nkaUri: vscode.Uri): WorkspaceMediaPathContext {
    const documentDir = path.dirname(nkaUri.fsPath);
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const context = createVSCodeWorkspaceMediaPathContext({
      documentUri: nkaUri,
      workspaceFolders,
      pathVariables: new Map([['PROJECT', documentDir]]),
    });
    const pathVariables = new Map(context.pathVariables ?? []);
    pathVariables.set('PROJECT', documentDir);
    return {
      ...context,
      owningWorkspaceRoot: context.owningWorkspaceRoot ?? documentDir,
      documentDir,
      pathVariables,
      allowedRoots: [documentDir, ...(context.allowedRoots ?? context.workspaceRoots ?? [])],
    };
  }

  private createHostContentPathOptions(
    nkaUri: vscode.Uri,
    context: WorkspaceMediaPathContext,
    options: Pick<HostContentPathResolverOptions, 'fileExists'> = {},
  ): HostContentPathResolverOptions {
    return {
      documentUri: nkaUri,
      ...(context.owningWorkspaceRoot ? { workspaceRoot: context.owningWorkspaceRoot } : {}),
      workspaceFolders: vscode.workspace.workspaceFolders ?? [],
      allowedRoots: context.allowedRoots,
      ...(options.fileExists ? { fileExists: options.fileExists } : {}),
      getExtension: vscode.extensions.getExtension,
    };
  }

  private async serializeProjectForSave(sourceUri: vscode.Uri): Promise<boolean> {
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
        return false;
      }
    }

    return true;
  }

  private async loadProjectWithStore(nkaUri: vscode.Uri): Promise<{
    readonly projectData?: AudioProjectData;
    readonly diagnostics: readonly { readonly message: string }[];
    readonly compatibility?: NkaCompatibilityMetadata;
  }> {
    const context = this.createWorkspaceMediaPathContext(nkaUri);
    const result = await this._projectFileStore.load<AudioProjectData>({
      filePath: nkaUri.fsPath,
      formatId: 'nka',
      sourcePolicy: nkaSourcePathPolicy,
      sourcePolicyOptions: {
        context,
        fileExists: isExistingLocalFile,
        isPathAuthorized: (filePath) => isPathAuthorized(filePath, context.allowedRoots),
      },
    });
    return {
      projectData: result.document,
      diagnostics: result.diagnostics,
      compatibility: result.loadResult?.compatibility as NkaCompatibilityMetadata | undefined,
    };
  }

  private async saveProjectWithStore(
    targetUri: vscode.Uri,
    sourceUri: vscode.Uri,
    project: AudioProjectData,
    saveReason: ProjectFileSaveReason = 'manual',
  ): Promise<boolean> {
    if (!(await this.serializeProjectForSave(sourceUri))) {
      return false;
    }
    await this._projectFileSession.save({
      targetUri,
      sourceUri,
      document: project,
      saveReason,
      defaultMessage: 'Failed to save NKA',
      useSaveAs: saveReason === 'save-as',
    });
    return true;
  }

  private async saveAuthoringProjectWithStore(
    targetUri: vscode.Uri,
    project: AudioProjectData,
    saveReason: ProjectFileSaveReason,
  ): Promise<AudioProjectData> {
    const docKey = targetUri.toString();
    const compatibility = this._projectCompatibilityCache.get(docKey);
    if (compatibility?.readOnly) {
      throw new Error(
        `Audio project ${docKey} is read-only because it was created by a newer NKA version.`,
      );
    }

    const result = await this._projectFileSession.save({
      targetUri,
      sourceUri: targetUri,
      document: project,
      saveReason,
      defaultMessage: 'Failed to save NKA',
    });
    this._projectCompatibilityCache.set(docKey, {
      loadedVersion: CURRENT_NKA_VERSION,
      currentVersion: CURRENT_NKA_VERSION,
      mode: 'current',
      readOnly: false,
      warnings: [],
    });
    return result.document ?? project;
  }

  private toProjectFileSaveReason(
    syncReason: 'agent-edit' | 'reload' | 'revert' | 'save' | 'external-change',
  ): ProjectFileSaveReason {
    switch (syncReason) {
      case 'agent-edit':
        return 'agent-edit';
      case 'external-change':
        return 'external-sync';
      case 'save':
        return 'vscode-save';
      case 'reload':
      case 'revert':
        return 'manual';
    }
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
