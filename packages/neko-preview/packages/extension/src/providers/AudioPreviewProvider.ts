/**
 * AudioPreviewProvider - CustomReadonlyEditorProvider for audio files
 *
 * Opens audio files (.mp3, .wav, .flac, etc.) in a lightweight preview player
 * powered by neko-engine's audio decoding + Web Audio API playback.
 *
 * Data flow:
 * 1. User opens audio file → resolveCustomEditor()
 * 2. Probe media metadata → send to webview
 * 3. Generate waveform data → send to webview
 * 4. Webview requests PCM segments via postMessage
 * 5. Web Audio API plays decoded PCM data
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { PreviewService, type MediaInfo } from '../services/PreviewService';
import { getWebviewHtml } from '../utils/html';
import type { StatusBarManager } from '../ui/StatusBarManager';
import { getLogger } from '../utils/logger';

const logger = getLogger('AudioPreview');

// =============================================================================
// AudioPreviewProvider
// =============================================================================

export class AudioPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'neko.audioPreview';

  private readonly _disposables: vscode.Disposable[] = [];
  private _previewService: PreviewService | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _statusBar: StatusBarManager,
  ) {}

  /** Inject a shared PreviewService instance (avoids duplicate NativeEngine) */
  setPreviewService(service: PreviewService): void {
    this._previewService = service;
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
    // Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview')],
    };

    // Pin the editor tab so it won't be replaced when opening other files
    vscode.commands.executeCommand('workbench.action.pinEditor');

    // Immediately show status bar with file name (placeholder before probe completes)
    const filePath = document.uri.fsPath;
    const fileName = filePath.split('/').pop() ?? filePath;
    this._statusBar.show({ fileName, duration: 0 });

    // Set webview HTML early so it can start loading while we probe
    webviewPanel.webview.html = getWebviewHtml({
      webview: webviewPanel.webview,
      extensionUri: this._extensionUri,
      entry: 'audio',
    });

    // Probe media in background — message handler awaits this before responding
    const mediaInfoPromise = (async (): Promise<MediaInfo | null> => {
      if (!this._previewService) {
        this._previewService = await PreviewService.tryCreate();
      }
      if (!this._previewService?.isAvailable) {
        webviewPanel.webview.html = this.getErrorHtml(
          'Failed to initialize media engine. Please ensure neko-engine is installed.',
        );
        this._statusBar.hide();
        return null;
      }
      try {
        const info = await this._previewService.probeMedia(filePath);
        this._statusBar.show({
          fileName,
          audioCodec: info.audioCodec,
          audioSampleRate: info.audioSampleRate,
          audioChannels: info.audioChannels,
          duration: info.duration,
        });
        return info;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        webviewPanel.webview.html = this.getErrorHtml(`Failed to probe audio file: ${msg}`);
        this._statusBar.hide();
        return null;
      }
    })();

    // Per-panel stream state
    let activeAudioStreamId: string | null = null;

    const stopPanelStream = async () => {
      if (activeAudioStreamId) {
        await this._previewService?.stopStreams(null, activeAudioStreamId);
        activeAudioStreamId = null;
      }
    };

    // Track whether the stream has reached EOF (WebSocket closed by engine)
    let streamEof = false;

    // Handle messages from webview — registered early so no messages are lost
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (msg: Record<string, unknown>) => {
        const type = msg.type as string;

        switch (type) {
          case 'ready': {
            const mediaInfo = await mediaInfoPromise;
            if (!mediaInfo) return;
            await webviewPanel.webview.postMessage({
              type: 'preview:init',
              payload: { filePath, mediaInfo },
            });

            // Generate and send waveform data
            try {
              const waveform = await this._previewService?.getWaveform(filePath);
              await webviewPanel.webview.postMessage({
                type: 'preview:waveform',
                payload: waveform,
              });
            } catch (error) {
              logger.error('Waveform generation failed:', error);
            }

            // Look for lyrics: external .lrc file first, then embedded metadata
            let lrcContent: string | null = null;
            try {
              const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc');
              lrcContent = await fs.readFile(lrcPath, 'utf-8');
            } catch {
              // No external .lrc file
            }

            // Fall back to embedded lyrics from ID3v2 USLT / Vorbis LYRICS
            if (!lrcContent && mediaInfo.metadata?.lyrics) {
              lrcContent = mediaInfo.metadata.lyrics;
            }

            if (lrcContent) {
              await webviewPanel.webview.postMessage({
                type: 'preview:lyrics',
                payload: { lrcContent },
              });
            }
            break;
          }

          case 'preview:play': {
            streamEof = false;
            if (activeAudioStreamId) {
              // Resume existing stream
              const startTime = (msg.startTime as number) ?? 0;
              if (startTime > 0) {
                await this._previewService?.seekStreams(null, activeAudioStreamId, startTime);
              }
              await this._previewService?.resumeStreams(null, activeAudioStreamId);
            } else {
              // First play or stream lost — create new stream
              try {
                const result = await this._previewService?.dispatch({
                  group: 'audios',
                  action: 'stream',
                  options: {
                    source: filePath,
                    sessionId: `audio-preview-${Date.now()}`,
                  },
                });

                if (result?.status === 'ok') {
                  const data = result.data as Record<string, unknown> | undefined;
                  const streamId = data?.streamId as string;
                  activeAudioStreamId = streamId;
                  const streamUrl = this._previewService?.getStreamWebSocketUrl(streamId);

                  const startTime = (msg.startTime as number) ?? 0;
                  if (startTime > 0 && streamId) {
                    await this._previewService?.seekStreams(null, streamId, startTime);
                  }

                  await webviewPanel.webview.postMessage({
                    type: 'preview:streamReady',
                    payload: {
                      streamId,
                      streamUrl,
                      audioStreamId: streamId,
                      audioStreamUrl: streamUrl,
                    },
                  });
                }
              } catch (error) {
                logger.error('Failed to create audio stream:', error);
              }
            }
            break;
          }

          case 'preview:pause':
            await this._previewService?.pauseStreams(null, activeAudioStreamId);
            break;

          case 'preview:eof':
            streamEof = true;
            break;

          case 'preview:resume':
            await this._previewService?.resumeStreams(null, activeAudioStreamId);
            break;

          case 'preview:stop':
            await stopPanelStream();
            break;

          case 'preview:speed': {
            const speed = (msg.speed as number) ?? 1.0;
            await this._previewService?.setStreamSpeed(null, activeAudioStreamId, speed);
            break;
          }

          case 'preview:seek': {
            const time = msg.time as number;
            if (typeof time === 'number') {
              await this._previewService?.seekStreams(null, activeAudioStreamId, time);
              // Only reconnect WebSocket if EOF closed it
              if (streamEof && activeAudioStreamId) {
                streamEof = false;
                const streamUrl = this._previewService?.getStreamWebSocketUrl(activeAudioStreamId);
                await webviewPanel.webview.postMessage({
                  type: 'preview:streamReconnect',
                  payload: {
                    streamId: activeAudioStreamId,
                    audioStreamUrl: streamUrl,
                  },
                });
              }
            }
            break;
          }

          case 'preview:statusUpdate': {
            const state = msg.playbackState as 'playing' | 'paused' | 'stopped';
            const time = (msg.currentTime as number) ?? 0;
            this._statusBar.updatePlayback(state, time);
            break;
          }

          default:
            break;
        }
      },
      undefined,
      this._disposables,
    );

    // Manage status bar visibility with panel lifecycle
    const visibilityDisposable = webviewPanel.onDidChangeViewState(async () => {
      if (!webviewPanel.visible) {
        this._statusBar.hide();
      } else {
        const mediaInfo = await mediaInfoPromise;
        if (mediaInfo) {
          this._statusBar.show({
            fileName,
            audioCodec: mediaInfo.audioCodec,
            audioSampleRate: mediaInfo.audioSampleRate,
            audioChannels: mediaInfo.audioChannels,
            duration: mediaInfo.duration,
          });
        } else {
          this._statusBar.show({ fileName, duration: 0 });
        }
      }
    });

    // Cleanup on dispose — stop this panel's stream only
    webviewPanel.onDidDispose(async () => {
      messageDisposable.dispose();
      visibilityDisposable.dispose();
      this._statusBar.hide();
      await stopPanelStream();
    });
  }

  // =========================================================================
  // Error HTML
  // =========================================================================

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
		<p>⚠️ ${message}</p>
	</div>
</body>
</html>`;
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  dispose(): void {
    // Note: do NOT dispose _previewService here — it may be a shared singleton
    // injected via setPreviewService(). The owner (extension.ts) manages its lifecycle.
    this._disposables.forEach((d) => d.dispose());
  }
}
