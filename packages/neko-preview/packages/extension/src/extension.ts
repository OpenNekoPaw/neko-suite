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
 *
 * Exports NekoPreviewAPI for other extensions (e.g. neko-canvas)
 * to share the same NativeEngine instance and frame server.
 */

import * as vscode from 'vscode';
import { VideoPreviewProvider } from './providers/VideoPreviewProvider';
import { AudioPreviewProvider } from './providers/AudioPreviewProvider';
import { PreviewService } from './services/PreviewService';
import { StatusBarManager } from './ui/StatusBarManager';
import type { NekoPreviewAPI } from './types/api';

// =============================================================================
// Extension State
// =============================================================================

let videoProvider: VideoPreviewProvider | null = null;
let audioProvider: AudioPreviewProvider | null = null;
let statusBarManager: StatusBarManager | null = null;
let sharedPreviewService: PreviewService | null = null;

// =============================================================================
// Activation
// =============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<NekoPreviewAPI> {
	console.log('[NekoPreview] Activating extension...');

	// Create shared PreviewService singleton (NativeEngine + frame server)
	sharedPreviewService = await PreviewService.tryCreate();
	if (sharedPreviewService) {
		context.subscriptions.push(sharedPreviewService);
		console.log(`[NekoPreview] Shared PreviewService ready (port: ${sharedPreviewService.port})`);
	} else {
		console.warn('[NekoPreview] Failed to create PreviewService — native engine unavailable');
	}

	// Create shared status bar
	statusBarManager = new StatusBarManager();
	context.subscriptions.push(statusBarManager);

	// Create providers and inject shared PreviewService
	videoProvider = new VideoPreviewProvider(context.extensionUri, statusBarManager);
	audioProvider = new AudioPreviewProvider(context.extensionUri, statusBarManager);

	if (sharedPreviewService) {
		videoProvider.setPreviewService(sharedPreviewService);
		audioProvider.setPreviewService(sharedPreviewService);
	}

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

	// Build and return public API for other extensions
	const api: NekoPreviewAPI = {
		get isAvailable() {
			return sharedPreviewService?.isAvailable ?? false;
		},
		get port() {
			return sharedPreviewService?.port ?? null;
		},
		getStreamWebSocketUrl(streamId: string) {
			return sharedPreviewService?.getStreamWebSocketUrl(streamId) ?? null;
		},
		probeMedia(filePath: string) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.reject(new Error('PreviewService not available'));
			}
			return sharedPreviewService.probeMedia(filePath);
		},
		startPlayback(filePath, mediaInfo, startTime = 0, speed = 1.0) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.reject(new Error('PreviewService not available'));
			}
			return sharedPreviewService.startVideoPlayback(filePath, mediaInfo, startTime, speed);
		},
		stopStreams(videoStreamId, audioStreamId) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.resolve();
			}
			return sharedPreviewService.stopStreams(videoStreamId, audioStreamId);
		},
		seekStreams(videoStreamId, audioStreamId, time) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.resolve();
			}
			return sharedPreviewService.seekStreams(videoStreamId, audioStreamId, time);
		},
		pauseStreams(videoStreamId, audioStreamId) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.resolve();
			}
			return sharedPreviewService.pauseStreams(videoStreamId, audioStreamId);
		},
		resumeStreams(videoStreamId, audioStreamId) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.resolve();
			}
			return sharedPreviewService.resumeStreams(videoStreamId, audioStreamId);
		},
		setStreamSpeed(videoStreamId, audioStreamId, speed) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.resolve();
			}
			return sharedPreviewService.setStreamSpeed(videoStreamId, audioStreamId, speed);
		},
		captureFrame(filePath, time, quality = 80) {
			if (!sharedPreviewService?.isAvailable) {
				return Promise.reject(new Error('PreviewService not available'));
			}
			return sharedPreviewService.captureFrame(filePath, time, quality);
		},
	};

	return api;
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

	statusBarManager?.dispose();
	statusBarManager = null;

	// sharedPreviewService is disposed via context.subscriptions
	sharedPreviewService = null;

	console.log('[NekoPreview] Extension deactivated');
}
