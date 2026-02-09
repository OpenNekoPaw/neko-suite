/**
 * Neko Preview Extension
 *
 * Lightweight media preview for video and audio files,
 * powered by neko-engine's hardware-accelerated pipeline.
 *
 * Architecture:
 * extension.ts → VideoPreviewProvider / AudioPreviewProvider
 *   → PreviewService → NativeEngine (NAPI) → Rust EngineApi
 *   → Webview (H264StreamClient / Web Audio API)
 */

import * as vscode from 'vscode';
import { VideoPreviewProvider } from './providers/VideoPreviewProvider';
import { AudioPreviewProvider } from './providers/AudioPreviewProvider';

// =============================================================================
// Extension State
// =============================================================================

let videoProvider: VideoPreviewProvider | null = null;
let audioProvider: AudioPreviewProvider | null = null;

// =============================================================================
// Activation
// =============================================================================

export function activate(context: vscode.ExtensionContext): void {
	console.log('[NekoPreview] Activating extension...');

	// Create providers
	videoProvider = new VideoPreviewProvider(context.extensionUri);
	audioProvider = new AudioPreviewProvider(context.extensionUri);

	// Register custom editors
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			VideoPreviewProvider.viewType,
			videoProvider,
			{
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: false,
			}
		)
	);

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			AudioPreviewProvider.viewType,
			audioProvider,
			{
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: false,
			}
		)
	);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.preview.openVideo', async () => {
			const fileUri = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectMany: false,
				filters: {
					'Video Files': ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv'],
				},
				title: 'Open Video Preview',
			});

			if (fileUri && fileUri.length > 0) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					fileUri[0],
					VideoPreviewProvider.viewType
				);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('neko.preview.openAudio', async () => {
			const fileUri = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectMany: false,
				filters: {
					'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
				},
				title: 'Open Audio Preview',
			});

			if (fileUri && fileUri.length > 0) {
				await vscode.commands.executeCommand(
					'vscode.openWith',
					fileUri[0],
					AudioPreviewProvider.viewType
				);
			}
		})
	);

	// Register providers for disposal
	context.subscriptions.push(videoProvider);
	context.subscriptions.push(audioProvider);

	console.log('[NekoPreview] Extension activated');
}

// =============================================================================
// Deactivation
// =============================================================================

export function deactivate(): void {
	console.log('[NekoPreview] Deactivating extension...');

	videoProvider?.dispose();
	videoProvider = null;

	audioProvider?.dispose();
	audioProvider = null;

	console.log('[NekoPreview] Extension deactivated');
}
