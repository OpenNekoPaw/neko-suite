/**
 * VideoPreviewProvider - CustomReadonlyEditorProvider for video files
 *
 * Opens video files (.mp4, .mov, .mkv, etc.) in a lightweight preview player
 * powered by neko-engine's H.264 streaming pipeline.
 *
 * Data flow:
 * 1. User opens video file → resolveCustomEditor()
 * 2. Probe media metadata → send to webview
 * 3. Start FrameServer → send port to webview
 * 4. Webview connects H264StreamClient via WebSocket
 * 5. Playback control via postMessage ↔ PreviewService dispatch
 */

import * as vscode from 'vscode';
import { PreviewService, type MediaInfo } from '../services/PreviewService';
import { getWebviewHtml } from '../utils/html';
import type { StatusBarManager } from '../ui/StatusBarManager';

// =============================================================================
// VideoPreviewProvider
// =============================================================================

export class VideoPreviewProvider implements vscode.CustomReadonlyEditorProvider {
	static readonly viewType = 'neko.videoPreview';

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

		// Pin the editor tab so it won't be replaced when opening other files
		vscode.commands.executeCommand('workbench.action.pinEditor');

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
				`Failed to probe media file: ${msg}`
			);
			return;
		}

		// Set webview HTML
		webviewPanel.webview.html = getWebviewHtml({
			webview: webviewPanel.webview,
			extensionUri: this._extensionUri,
			entry: 'video',
		});

		// Show status bar with media info
		const fileName = filePath.split('/').pop() ?? filePath;
		this._statusBar.show({
			fileName,
			codec: mediaInfo.codec,
			width: mediaInfo.width,
			height: mediaInfo.height,
			fps: mediaInfo.fps,
			audioCodec: mediaInfo.audioCodec,
			audioSampleRate: mediaInfo.audioSampleRate,
			audioChannels: mediaInfo.audioChannels,
			duration: mediaInfo.duration,
		});

		// Per-panel stream state (independent of other panels)
		let activeVideoStreamId: string | null = null;
		let activeAudioStreamId: string | null = null;

		const stopPanelStreams = async () => {
			if (activeVideoStreamId || activeAudioStreamId) {
				await this._previewService?.stopStreams(activeVideoStreamId, activeAudioStreamId);
				activeVideoStreamId = null;
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
							payload: {
								filePath,
								mediaInfo,
								port: this._previewService?.port ?? null,
							},
						});
						break;

					case 'preview:play': {
						// Stop previous streams for this panel
						await stopPanelStreams();

						const startTime = (msg.startTime as number) ?? 0;
						const speed = (msg.speed as number) ?? 1.0;
						const result = await this._previewService?.startVideoPlayback(
							filePath,
							mediaInfo,
							startTime,
							speed
						);
						if (result?.videoStreamId) {
							activeVideoStreamId = result.videoStreamId;
							activeAudioStreamId = result.audioStreamId;

							const streamUrl = this._previewService?.getStreamWebSocketUrl(result.videoStreamId);
							let audioStreamUrl: string | null = null;
							if (result.audioStreamId) {
								audioStreamUrl = this._previewService?.getStreamWebSocketUrl(result.audioStreamId) ?? null;
							}
							if (streamUrl) {
								await webviewPanel.webview.postMessage({
									type: 'preview:streamReady',
									payload: {
										streamId: result.videoStreamId,
										streamUrl,
										audioStreamId: result.audioStreamId,
										audioStreamUrl,
									},
								});
							}
						}
						break;
					}

					case 'preview:pause':
						await this._previewService?.pauseStreams(activeVideoStreamId, activeAudioStreamId);
						break;

					case 'preview:resume':
						await this._previewService?.resumeStreams(activeVideoStreamId, activeAudioStreamId);
						break;

					case 'preview:stop':
						await stopPanelStreams();
						break;

					case 'preview:seek': {
						const time = msg.time as number;
						if (typeof time === 'number') {
							await this._previewService?.seekStreams(activeVideoStreamId, activeAudioStreamId, time);
						}
						break;
					}

					case 'preview:speed': {
						const speed = msg.speed as number;
						if (typeof speed === 'number') {
							await this._previewService?.setStreamSpeed(activeVideoStreamId, activeAudioStreamId, speed);
						}
						break;
					}

					case 'preview:captureFrame': {
						const time = (msg.time as number) ?? 0;
						try {
							const frameData = await this._previewService?.captureFrame(filePath, time);
							await webviewPanel.webview.postMessage({
								type: 'preview:frameData',
								payload: { imageDataUrl: `data:image/jpeg;base64,${frameData}` },
							});
						} catch (error) {
							console.error('[VideoPreview] Frame capture failed:', error);
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
					codec: mediaInfo.codec,
					width: mediaInfo.width,
					height: mediaInfo.height,
					fps: mediaInfo.fps,
					audioCodec: mediaInfo.audioCodec,
					audioSampleRate: mediaInfo.audioSampleRate,
					audioChannels: mediaInfo.audioChannels,
					duration: mediaInfo.duration,
				});
			}
		});

		// Cleanup on dispose — stop this panel's streams only
		webviewPanel.onDidDispose(async () => {
			messageDisposable.dispose();
			visibilityDisposable.dispose();
			this._statusBar.hide();
			await stopPanelStreams();
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
