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
import { PreviewService, type MediaInfo } from '../services/PreviewService';
import { getWebviewHtml } from '../utils/html';
import type { StatusBarManager } from '../ui/StatusBarManager';

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

	// =========================================================================
	// CustomReadonlyEditorProvider
	// =========================================================================

	async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken
	): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} };
	}

	async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Configure webview
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
			],
		};

		// Initialize preview service (lazy)
		if (!this._previewService) {
			this._previewService = await PreviewService.tryCreate();
		}

		if (!this._previewService?.isAvailable) {
			webviewPanel.webview.html = this.getErrorHtml(
				'Failed to initialize media engine. Please ensure neko-engine is installed.'
			);
			return;
		}

		// Probe media file
		const filePath = document.uri.fsPath;
		let mediaInfo: MediaInfo;

		try {
			mediaInfo = await this._previewService.probeMedia(filePath);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			webviewPanel.webview.html = this.getErrorHtml(
				`Failed to probe audio file: ${msg}`
			);
			return;
		}

		// Set webview HTML
		webviewPanel.webview.html = getWebviewHtml({
			webview: webviewPanel.webview,
			extensionUri: this._extensionUri,
			entry: 'audio',
		});

		// Show status bar with media info
		const fileName = filePath.split('/').pop() ?? filePath;
		this._statusBar.show({
			fileName,
			audioCodec: mediaInfo.audioCodec,
			audioSampleRate: mediaInfo.audioSampleRate,
			audioChannels: mediaInfo.audioChannels,
			duration: mediaInfo.duration,
		});

		// Per-panel stream state
		let activeAudioStreamId: string | null = null;

		const stopPanelStream = async () => {
			if (activeAudioStreamId) {
				await this._previewService?.stopStreams(null, activeAudioStreamId);
				activeAudioStreamId = null;
			}
		};

		// Handle messages from webview
		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
			async (msg: Record<string, unknown>) => {
				const type = msg.type as string;

				switch (type) {
					case 'ready':
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
							console.error('[AudioPreview] Waveform generation failed:', error);
						}
						break;

					case 'preview:play': {
						try {
							// Stop previous stream for this panel
							await stopPanelStream();

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
									await this._previewService?.dispatch({
										group: 'audios',
										action: 'seek',
										options: { streamId, time: startTime },
									});
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
							console.error('[AudioPreview] Failed to start audio stream:', error);
						}
						break;
					}

					case 'preview:pause':
						await this._previewService?.pauseStreams(null, activeAudioStreamId);
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
			this._disposables
		);

		// Manage status bar visibility with panel lifecycle
		const visibilityDisposable = webviewPanel.onDidChangeViewState(() => {
			if (!webviewPanel.visible) {
				this._statusBar.hide();
			} else {
				this._statusBar.show({
					fileName,
					audioCodec: mediaInfo.audioCodec,
					audioSampleRate: mediaInfo.audioSampleRate,
					audioChannels: mediaInfo.audioChannels,
					duration: mediaInfo.duration,
				});
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
		this._previewService?.dispose();
		this._disposables.forEach((d) => d.dispose());
	}
}
