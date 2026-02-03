/**
 * Asset Library View Provider
 *
 * Provides the AssetLibrary panel as a webview view in the activity bar sidebar.
 * Handles communication between Extension Host and Webview for asset operations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { handleAssetMessage } from '../handlers/assetHandlers';
import { getFFmpegService } from '../services/FFmpegService';
import type { AssetRequest, AssetResponse, AssetEntity, AssetVariant, AssetFile } from '@neko/shared';

// Video file extensions for thumbnail generation
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v']);

// Cache for video thumbnails (path -> data URL)
const thumbnailCache = new Map<string, string>();

export class AssetLibraryViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'neko.assetLibrary';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {}

	/**
	 * Resolve the webview view when it becomes visible
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri,
				// Allow access to workspace folders for thumbnails
				...(vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []),
			],
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
		this._setupMessageHandlers(webviewView.webview);

		// Log when view becomes visible
		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) {
				console.log('[AssetLibrary] View became visible');
			}
		});
	}

	/**
	 * Set up message handlers for webview communication
	 */
	private _setupMessageHandlers(webview: vscode.Webview): void {
		webview.onDidReceiveMessage(async (message: AssetRequest & { _requestId?: string }) => {
			console.log('[AssetLibrary] Received message:', message.type);

			// Handle asset messages through the asset handlers
			const handled = await handleAssetMessage(message, async (response: AssetResponse) => {
				// Enhance response with thumbnail URIs before sending to webview
				const enhancedResponse = await this._enhanceResponseWithThumbnails(response, webview);
				webview.postMessage(enhancedResponse);
			});

			if (!handled) {
				// Handle non-asset messages
				switch (message.type) {
					case 'ready':
						console.log('[AssetLibrary] Webview ready');
						break;
					default:
						console.warn('[AssetLibrary] Unknown message type:', message.type);
				}
			}
		});
	}

	/**
	 * Enhance response with thumbnail URIs for webview
	 */
	private async _enhanceResponseWithThumbnails(response: AssetResponse, webview: vscode.Webview): Promise<AssetResponse> {
		// Handle search results
		if (response.type === 'asset:searchResult' && response.payload) {
			const payload = response.payload as { entities: AssetEntity[]; total: number };
			const enhancedEntities = await Promise.all(
				payload.entities.map(entity => this._enhanceEntityWithThumbnails(entity, webview))
			);
			return {
				...response,
				payload: {
					...payload,
					entities: enhancedEntities,
				},
			};
		}

		// Handle entities loaded
		if (response.type === 'asset:entitiesLoaded' && Array.isArray(response.payload)) {
			const enhancedEntities = await Promise.all(
				(response.payload as AssetEntity[]).map(entity =>
					this._enhanceEntityWithThumbnails(entity, webview)
				)
			);
			return {
				...response,
				payload: enhancedEntities,
			};
		}

		// Handle single entity responses
		if (
			(response.type === 'asset:entityCreated' ||
			response.type === 'asset:entityUpdated' ||
			response.type === 'asset:entityLoaded') &&
			response.payload
		) {
			return {
				...response,
				payload: await this._enhanceEntityWithThumbnails(response.payload as AssetEntity, webview),
			};
		}

		// Handle import results
		if (response.type === 'asset:importResult' && response.payload) {
			const payload = response.payload as { entity: AssetEntity; variant: AssetVariant };
			return {
				...response,
				payload: {
					...payload,
					entity: await this._enhanceEntityWithThumbnails(payload.entity, webview),
				},
			};
		}

		if (response.type === 'asset:importResults' && Array.isArray(response.payload)) {
			const enhancedResults = await Promise.all(
				(response.payload as Array<{ entity: AssetEntity; variant: AssetVariant }>).map(async result => ({
					...result,
					entity: await this._enhanceEntityWithThumbnails(result.entity, webview),
				}))
			);
			return {
				...response,
				payload: enhancedResults,
			};
		}

		return response;
	}

	/**
	 * Enhance an entity with thumbnail URIs
	 */
	private async _enhanceEntityWithThumbnails(entity: AssetEntity, webview: vscode.Webview): Promise<AssetEntity & { _thumbnailUri?: string }> {
		// Find thumbnail from default variant or first variant
		const defaultVariant = entity.variants.find(v => v.id === entity.defaultVariantId) ?? entity.variants[0];

		if (!defaultVariant) {
			return entity;
		}

		// Find thumbnail file
		const thumbnailFile = defaultVariant.thumbnailFileId
			? defaultVariant.files.find(f => f.id === defaultVariant.thumbnailFileId)
			: defaultVariant.files.find(f => f.mediaType === 'image' || f.mediaType === 'video');

		if (!thumbnailFile) {
			return entity;
		}

		// Get thumbnail URI (generate for videos)
		const thumbnailUri = await this._getThumbnailUri(thumbnailFile, webview);

		// Also enhance variants with their thumbnail URIs
		const enhancedVariants = await Promise.all(
			entity.variants.map(async variant => {
				const variantThumbnailFile = variant.thumbnailFileId
					? variant.files.find(f => f.id === variant.thumbnailFileId)
					: variant.files.find(f => f.mediaType === 'image' || f.mediaType === 'video');

				if (variantThumbnailFile) {
					const variantThumbnailUri = await this._getThumbnailUri(variantThumbnailFile, webview);
					return {
						...variant,
						_thumbnailUri: variantThumbnailUri,
					};
				}
				return variant;
			})
		);

		return {
			...entity,
			variants: enhancedVariants,
			_thumbnailUri: thumbnailUri,
		};
	}

	/**
	 * Get thumbnail URI for a file (generate from video if needed)
	 */
	private async _getThumbnailUri(file: AssetFile, webview: vscode.Webview): Promise<string | undefined> {
		const filePath = this._resolveFilePath(file.path);
		if (!filePath) {
			return undefined;
		}

		// Check if it's a video file
		const ext = path.extname(filePath).toLowerCase();
		if (VIDEO_EXTENSIONS.has(ext)) {
			return this._getVideoThumbnailUri(filePath);
		}

		// For images, use webview URI
		return this._getWebviewUri(filePath, webview);
	}

	/**
	 * Generate thumbnail for a video file
	 */
	private async _getVideoThumbnailUri(videoPath: string): Promise<string | undefined> {
		// Check cache first
		const cached = thumbnailCache.get(videoPath);
		if (cached) {
			return cached;
		}

		try {
			const ffmpegService = getFFmpegService();
			// Extract frame at 0.5 seconds (to avoid black frames at the start)
			const frameBuffer = await ffmpegService.extractVideoFrame(videoPath, 0.5, 5, 0.25);

			// Convert to data URL
			const base64 = frameBuffer.toString('base64');
			const dataUrl = `data:image/jpeg;base64,${base64}`;

			// Cache the result
			thumbnailCache.set(videoPath, dataUrl);

			return dataUrl;
		} catch (error) {
			console.error('[AssetLibrary] Failed to generate video thumbnail:', videoPath, error);
			return undefined;
		}
	}

	/**
	 * Resolve file path to absolute path
	 */
	private _resolveFilePath(filePath: string): string | undefined {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}

		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			return path.join(workspaceFolders[0].uri.fsPath, filePath);
		}

		return undefined;
	}

	/**
	 * Convert a file path to a webview URI
	 */
	private _getWebviewUri(filePath: string, webview: vscode.Webview): string | undefined {
		try {
			// Handle absolute paths
			if (path.isAbsolute(filePath)) {
				const uri = vscode.Uri.file(filePath);
				return webview.asWebviewUri(uri).toString();
			}

			// Handle relative paths (relative to workspace)
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				const absolutePath = path.join(workspaceFolders[0].uri.fsPath, filePath);
				const uri = vscode.Uri.file(absolutePath);
				return webview.asWebviewUri(uri).toString();
			}

			return undefined;
		} catch (error) {
			console.error('[AssetLibrary] Failed to convert path to webview URI:', filePath, error);
			return undefined;
		}
	}

	/**
	 * Post message to webview
	 */
	public postMessage(message: AssetResponse): void {
		if (this._view) {
			this._view.webview.postMessage(message);
		}
	}

	/**
	 * Generate HTML for the webview
	 */
	private _getHtmlForWebview(webview: vscode.Webview): string {
		const nonce = getNonce();
		const locale = vscode.env.language;

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'assetLibrary.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'style.css')
		);

		return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Asset Library</title>
  <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Dispose resources
	 */
	public dispose(): void {
		// Clean up resources if needed
	}
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
