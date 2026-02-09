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

// =============================================================================
// AudioPreviewProvider
// =============================================================================

export class AudioPreviewProvider implements vscode.CustomReadonlyEditorProvider {
	static readonly viewType = 'neko.audioPreview';

	private readonly _disposables: vscode.Disposable[] = [];
	private _previewService: PreviewService | null = null;

	constructor(private readonly _extensionUri: vscode.Uri) {}

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

		// Handle messages from webview
		const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
			(msg) => this.handleMessage(msg, webviewPanel, filePath, mediaInfo),
			undefined,
			this._disposables
		);

		// Cleanup on dispose
		webviewPanel.onDidDispose(() => {
			messageDisposable.dispose();
		});
	}

	// =========================================================================
	// Message Handling
	// =========================================================================

	private async handleMessage(
		msg: Record<string, unknown>,
		panel: vscode.WebviewPanel,
		filePath: string,
		mediaInfo: MediaInfo
	): Promise<void> {
		const type = msg.type as string;

		switch (type) {
			case 'ready':
				// Webview loaded — send initial config with media info
				await panel.webview.postMessage({
					type: 'preview:init',
					payload: {
						filePath,
						mediaInfo,
					},
				});

				// Generate and send waveform data
				try {
					const waveform = await this._previewService?.getWaveform(filePath);
					await panel.webview.postMessage({
						type: 'preview:waveform',
						payload: waveform,
					});
				} catch (error) {
					console.error('[AudioPreview] Waveform generation failed:', error);
				}
				break;

			case 'preview:decodeSegment': {
				const startTime = (msg.startTime as number) ?? 0;
				const duration = (msg.duration as number) ?? 10;
				const requestId = msg.requestId as string;

				try {
					const audioData = await this._previewService?.decodeAudioSegment(
						filePath,
						startTime,
						duration
					);
					await panel.webview.postMessage({
						type: 'preview:audioData',
						requestId,
						payload: audioData,
					});
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					await panel.webview.postMessage({
						type: 'preview:audioData',
						requestId,
						error: errorMsg,
					});
				}
				break;
			}

			default:
				break;
		}
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
