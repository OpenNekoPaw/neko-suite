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
import * as path from 'path';
import {
  createDefaultLocalResourceAccessService,
  createFocusedWebviewRegistry,
  type IFocusedWebviewRegistry,
} from '@neko/shared/vscode/extension';
import type {
  AudioAnalyzeRequestMessage,
  AudioEffectsRequestMessage,
  AudioExportRequestMessage,
  AudioPlaybackRequestMessage,
  AudioRecordingRequestMessage,
  AudioRequestMessage,
  AudioTrimRequestMessage,
} from '@neko/shared';
import type { AudioService } from '../services/AudioService';
import type { AudioOutlineProvider } from '../views/audioOutlineProvider';
import type { AudioStatusBar } from '../views/audioStatusBar';
import { getWebviewHtml } from '../utils/html';
import { getLogger } from '../utils/logger';
import { exportAudioExtension, generateAudioOutputPath } from './audioFilePaths';
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

const logger = getLogger('AudioEditor');

// =============================================================================
// AudioEditorProvider
// =============================================================================

export class AudioEditorProvider implements vscode.CustomReadonlyEditorProvider<vscode.CustomDocument> {
  static readonly viewType = 'neko.audioEditor';

  private _audioService: AudioService | null = null;
  private _outlineProvider: AudioOutlineProvider | null = null;
  private _statusBar: AudioStatusBar | null = null;
  private readonly _activePanels = new Set<vscode.WebviewPanel>();
  private readonly _stopPanelStreams = new WeakMap<vscode.WebviewPanel, () => Promise<void>>();
  private readonly _focusedWebviews: IFocusedWebviewRegistry;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    focusedWebviews: IFocusedWebviewRegistry = createFocusedWebviewRegistry(),
  ) {
    this._focusedWebviews = focusedWebviews;
  }

  /** Forward a command message to all active webview panels */
  postToActivePanels(message: Record<string, unknown>): boolean {
    if (this._activePanels.size === 0) return false;
    for (const panel of this._activePanels) {
      panel.webview.postMessage(message);
    }
    return true;
  }

  async postCommandToFocusedPanel(command: string): Promise<boolean> {
    return this._focusedWebviews.postKeyboardAction(command, {
      viewType: AudioEditorProvider.viewType,
      allowSingleVisibleFallback: true,
    });
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
    const documentUri = document.uri.toString();
    const focusedRegistration = this._focusedWebviews.register({
      id: documentUri,
      viewType: AudioEditorProvider.viewType,
      documentUri,
      panel: webviewPanel,
      visible: webviewPanel.visible,
      active: webviewPanel.active,
    });

    // Configure webview
    await createDefaultLocalResourceAccessService({
      extensionUri: this._extensionUri,
      includeExtensionCache: false,
    }).configureWebview(webviewPanel.webview, {
      enableScripts: true,
    });

    // Pin the editor tab
    vscode.commands.executeCommand('workbench.action.pinEditor');

    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);

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
    this._stopPanelStreams.set(webviewPanel, stopPanelStream);

    const postAudioError = async (request: AudioRequestMessage, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      await webviewPanel.webview.postMessage({
        type: 'audio:error',
        requestId: request.requestId,
        documentUri: document.uri.toString(),
        success: false,
        error: message,
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

    const handleAudioPlayback = async (request: AudioPlaybackRequestMessage) => {
      try {
        switch (request.action) {
          case 'play': {
            await stopPanelStream();
            const result = await this._audioService?.startStream(filePath);
            if (!result) {
              throw new Error('Unable to start audio stream');
            }
            activeStreamId = result.streamId;
            const startTime = request.startTime ?? 0;
            if (startTime > 0) {
              await this._audioService?.seekStream(result.streamId, startTime);
            }
            await webviewPanel.webview.postMessage({
              type: 'audio:playbackReady',
              requestId: request.requestId,
              documentUri: document.uri.toString(),
              streamId: result.streamId,
              wsUrl: result.streamUrl,
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
              title: 'Export Audio',
            });
        if (!outputUri) return;
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
          const ext = request.mimeType === 'audio/webm' ? 'webm' : 'wav';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const suggestedName = `recording-${timestamp}.${ext}`;
          const saveUri = request.outputPath
            ? vscode.Uri.file(request.outputPath)
            : await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(suggestedName),
                filters: { 'Audio Files': [ext] },
                title: 'Save Recording',
              });
          if (!saveUri) return;
          await vscode.workspace.fs.writeFile(saveUri, Buffer.from(request.data, 'base64'));
          await webviewPanel.webview.postMessage({
            type: 'audio:recordingResult',
            requestId: request.requestId,
            documentUri: document.uri.toString(),
            success: true,
            action: request.action,
            outputPath: saveUri.fsPath,
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
          const outputDir = path.dirname(filePath);
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

    // Handle messages from webview — registered early so no messages are lost
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (msg: Record<string, unknown>) => {
        const type = msg.type as string;

        switch (type) {
          case 'ready': {
            const audioInfo = await audioInfoPromise;
            if (!audioInfo) return;
            await webviewPanel.webview.postMessage({
              type: 'audio:init',
              documentUri: document.uri.toString(),
              filePath,
              fileName,
              audioInfo,
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
                  type: 'audio:waveform',
                  documentUri: document.uri.toString(),
                  waveform,
                });
              }
            } catch (error) {
              logger.error('Waveform generation failed:', error);
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

          default:
            break;
        }
      },
    );

    webviewPanel.onDidChangeViewState((event) => {
      this._focusedWebviews.markVisible(documentUri, event.webviewPanel.visible);
      if (event.webviewPanel.active) {
        this._focusedWebviews.markActive(documentUri);
      }
    });

    // Cleanup on dispose
    webviewPanel.onDidDispose(async () => {
      focusedRegistration.dispose();
      messageDisposable.dispose();
      this._activePanels.delete(webviewPanel);
      this._stopPanelStreams.delete(webviewPanel);
      await stopPanelStream();
      this._statusBar?.hide();
      this._outlineProvider?.updateData(null);
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================
  private getErrorHtml(message: string): string {
    const escapedMessage = escapeHtml(message);
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
		<p>${escapedMessage}</p>
	</div>
</body>
</html>`;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    for (const panel of this._activePanels) {
      this._stopPanelStreams
        .get(panel)?.()
        .catch((error: unknown) => {
          logger.warn('Failed to stop audio stream during provider dispose', error);
        });
      this._stopPanelStreams.delete(panel);
    }
    this._activePanels.clear();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
