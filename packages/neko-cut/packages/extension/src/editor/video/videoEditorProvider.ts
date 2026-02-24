/**
 * 视频编辑器 Provider
 * 使用新架构 (VideoEditorModel + EditorRegistry)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { IEditorRegistry } from '../common/editorRegistry';
import { VideoEditorModel } from './videoEditorModel';
import { MessageHandler } from './messageHandler';
import { MediaService } from '../../services/MediaService';
import { FrameServerService } from '../../services/FrameServerService';
import { getService } from '../../base';
import { IStatusBar } from '../../views/statusBar';
import { IVideoProjectOutlineProvider } from '../../views/outlineProvider';
import type { TimelineElement, ProjectDefaults } from '@neko/shared';

/**
 * 元素选择事件数据
 */
export interface IElementSelectedEvent {
	element: TimelineElement | null;
	trackId: string | null;
	currentTime: number;
}

/**
 * 当前时间更新事件数据
 */
export interface ICurrentTimeUpdateEvent {
	currentTime: number;
}

/**
 * 项目默认值更新事件数据
 */
export interface IProjectDefaultsUpdateEvent {
	defaults: ProjectDefaults | null;
}

export class VideoEditorProvider implements vscode.CustomTextEditorProvider {
	private static readonly viewType = 'neko.videoEditor';
	private activeWebviews: Map<string, vscode.Webview> = new Map();
	private activeWebviewPanels: Map<string, vscode.WebviewPanel> = new Map();
	private modelDisposables: Map<string, vscode.Disposable> = new Map();
	private mediaServices: Map<string, MediaService> = new Map();
	private frameServerServices: Map<string, FrameServerService> = new Map();

	// 事件发射器 - 用于解耦与 PropertyPanel 的通信
	private readonly _onElementSelected = new vscode.EventEmitter<IElementSelectedEvent>();
	public readonly onElementSelected = this._onElementSelected.event;

	private readonly _onCurrentTimeUpdate = new vscode.EventEmitter<ICurrentTimeUpdateEvent>();
	public readonly onCurrentTimeUpdate = this._onCurrentTimeUpdate.event;

	private readonly _onProjectDefaultsUpdate = new vscode.EventEmitter<IProjectDefaultsUpdateEvent>();
	public readonly onProjectDefaultsUpdate = this._onProjectDefaultsUpdate.event;

	constructor(private readonly context: vscode.ExtensionContext) {}

	/**
	 * Handle messages from the PropertyPanel
	 * Forwards the message to the active webview
	 */
	public handlePropertyPanelMessage(message: unknown): void {
		const webview = this.getActiveWebview();
		if (webview) {
			webview.postMessage(message);
		}
	}

	/**
	 * Pin the editor tab for the given document URI to prevent accidental closure during export
	 */
	private pinEditorTab(documentUri: vscode.Uri): void {
		try {
			// The editor should be active when export starts, so we can just pin the active editor
			vscode.commands.executeCommand('workbench.action.pinEditor');
		} catch (error) {
			console.warn('[VideoEditorProvider] Failed to pin editor tab:', error);
		}
	}

	/**
	 * Unpin the editor tab for the given document URI after export completes
	 */
	private unpinEditorTab(_documentUri: vscode.Uri): void {
		// Don't auto-unpin - let user decide when to unpin
		// This is safer as the user might want to continue editing
	}

	/**
	 * Find project root by looking for package.json or .git directory
	 */
	private findProjectRoot(filePath: string): string | null {
		const fs = require('fs');
		let currentDir = path.dirname(filePath);
		const root = path.parse(currentDir).root;

		while (currentDir !== root) {
			// Check for project markers
			if (
				fs.existsSync(path.join(currentDir, 'package.json')) ||
				fs.existsSync(path.join(currentDir, '.git'))
			) {
				return currentDir;
			}
			currentDir = path.dirname(currentDir);
		}

		return null;
	}

	/**
	 * Get the webview for a specific document URI
	 */
	public getWebviewForDocument(documentUri: string): vscode.Webview | null {
		return this.activeWebviews.get(documentUri) || null;
	}

	/**
	 * Get the currently active/visible webview based on active/visible editors
	 */
	public getActiveWebview(): vscode.Webview | null {
		// Find the visible/active webview panel
		for (const [uri, panel] of this.activeWebviewPanels) {
			if (panel.visible && panel.active) {
				return panel.webview;
			}
		}

		// Fallback: find any visible panel
		for (const [uri, panel] of this.activeWebviewPanels) {
			if (panel.visible) {
				return panel.webview;
			}
		}

		// Last resort: return any webview (for single project case)
		for (const [uri, webview] of this.activeWebviews) {
			return webview;
		}

		return null;
	}

	/**
	 * Get the currently active/visible webview panel
	 */
	public getActiveWebviewPanel(): vscode.WebviewPanel | null {
		// Find the visible/active webview panel
		for (const [uri, panel] of this.activeWebviewPanels) {
			if (panel.visible && panel.active) {
				return panel;
			}
		}

		// Fallback: find any visible panel
		for (const [uri, panel] of this.activeWebviewPanels) {
			if (panel.visible) {
				return panel;
			}
		}

		// Last resort: return any panel (for single project case)
		for (const [uri, panel] of this.activeWebviewPanels) {
			return panel;
		}

		return null;
	}

	/**
	 * Focus the active video editor panel
	 * @returns true if successfully focused, false if no panel available
	 */
	public async focusActiveEditor(): Promise<boolean> {
		const panel = this.getActiveWebviewPanel();
		if (!panel) {
			return false;
		}

		// Reveal the panel to bring it to focus
		panel.reveal(undefined, true); // preserveFocus = true to avoid stealing focus from webview
		return true;
	}

	/**
	 * Broadcast export status to all active webviews
	 * NOTE: Export is now handled by neko-engine
	 */
	private broadcastExportStatus() {
		// Export status is managed by neko-engine
		// This method is kept for API compatibility
		for (const [_uri, webview] of this.activeWebviews) {
			webview.postMessage({
				type: 'export:globalStatus',
				hasActiveExport: false,
			});
		}
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		// 从 DI 容器获取服务
		const statusBar = getService<IStatusBar>(IStatusBar);
		const outlineProvider = getService<IVideoProjectOutlineProvider>(IVideoProjectOutlineProvider);
		const editorRegistry = getService<IEditorRegistry>(IEditorRegistry);

		// Validate required services
		if (!editorRegistry) {
			throw new Error('EditorRegistry service not available');
		}

		// Track this webview and panel
		const docUri = document.uri.toString();
		this.activeWebviews.set(docUri, webviewPanel.webview);
		this.activeWebviewPanels.set(docUri, webviewPanel);

		// Setup webview options
		const localResourceRoots = [
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
		];

		// Add workspace folders to allow access to media files
		if (vscode.workspace.workspaceFolders) {
			localResourceRoots.push(...vscode.workspace.workspaceFolders.map(f => f.uri));
		}

		// Add the .jvi file's directory and its parent directories
		// This allows access to media files relative to the project file
		const jviDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
		if (!localResourceRoots.some(root => root.fsPath === jviDir.fsPath)) {
			localResourceRoots.push(jviDir);
		}

		// Also add common parent directories that might contain media files
		// (e.g., if .jvi is in /project/videos/ and media is in /project/assets/)
		const jviParent = vscode.Uri.file(path.dirname(path.dirname(document.uri.fsPath)));
		if (jviParent.fsPath !== '/' && !localResourceRoots.some(root => root.fsPath === jviParent.fsPath)) {
			localResourceRoots.push(jviParent);
		}

		// Add project root directory (find by looking for package.json or .git)
		const detectedProjectRoot = this.findProjectRoot(document.uri.fsPath);
		if (detectedProjectRoot && !localResourceRoots.some(root => root.fsPath === detectedProjectRoot)) {
			localResourceRoots.push(vscode.Uri.file(detectedProjectRoot));
		}

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots,
		};

		// 从 EditorRegistry 获取或创建 VideoEditorModel
		let model = editorRegistry.getEditorByUri(document.uri) as VideoEditorModel | undefined;

		if (!model) {
			// 通过 provider 创建新模型
			const provider = editorRegistry.getModelProvider('video');
			if (!provider) {
				throw new Error('Video editor model provider not registered');
			}
			model = provider.createModel(document) as VideoEditorModel;

			// 注册模型到 EditorRegistry
			const modelDisposable = editorRegistry.registerModel(model);
			this.modelDisposables.set(docUri, modelDisposable);
		}

		// 设置为活动编辑器
		editorRegistry.setActiveEditor(model);

		// Initialize Frame Server (NativeEngine-backed, required for all media operations)
		let frameServerPort: number | null = null;
		const frameServerService = await FrameServerService.tryCreate({ port: 0 });
		if (!frameServerService) {
			console.error('[VideoEditorProvider] Frame server not available — media operations will fail');
		} else {
			frameServerPort = frameServerService.getPort();
			this.frameServerServices.set(docUri, frameServerService);
			console.log(`[VideoEditorProvider] Frame server started on port ${frameServerPort}`);
		}

		// Create MediaService — routes Webview messages to NativeEngine via FrameServerService
		if (frameServerService) {
			const mediaService = new MediaService(webviewPanel, frameServerService, document.uri);
			this.mediaServices.set(docUri, mediaService);

			// Create editor-level stream (paused state) immediately
			try {
				const projectData = JSON.parse(document.getText());
				await mediaService.createEditorStream(projectData);
			} catch (err) {
				console.error('[VideoEditorProvider] Failed to create editor stream:', err);
				// Non-fatal: Webview will show "初始化 GPU..." until stream becomes available
			}
		}

		// Create message handler
		const messageHandler = new MessageHandler(
			webviewPanel.webview,
			model,
			this.context
		);

		// Set up the webview HTML content
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

		// Handle messages from the webview
		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				// 1. Try to handle media requests via MediaService (media:*)
				const mediaService = this.mediaServices.get(docUri);
				if (mediaService) {
					const mediaHandled = await mediaService.handleMessage(message);
					if (mediaHandled) {
						return;
					}
				}

				// 2. Handle status updates separately
				if (message.type === 'statusUpdate') {
					statusBar?.update({
						currentTime: message.currentTime ?? 0,
						totalDuration: message.totalDuration ?? 0,
						trackCount: message.trackCount ?? 0,
						elementCount: message.elementCount ?? 0,
						isPlaying: message.isPlaying ?? false,
						fps: message.fps ?? 30,
					});
					return;
				}

				// Handle export progress updates (Webview -> Extension status bar)
				if (message.type === 'exportProgress') {
					statusBar?.updateExportProgress({
						isExporting: message.isExporting,
						percent: message.percent,
						message: message.message,
						currentFrame: message.currentFrame,
						totalFrames: message.totalFrames,
						currentFps: message.currentFps,
						estimatedTimeRemaining: message.estimatedTimeRemaining,
					});
					return;
				}

				// Forward element selection via event (decoupled from PropertyPanel)
				if (message.type === 'elementSelected') {
					this._onElementSelected.fire({
						element: message.element,
						trackId: message.trackId,
						currentTime: message.currentTime,
					});
					return;
				}

				// Forward current time updates via event
				if (message.type === 'currentTimeUpdate') {
					this._onCurrentTimeUpdate.fire({
						currentTime: message.currentTime,
					});
					return;
				}

				// Handle export global status query
				// NOTE: Export is now handled by neko-engine
				if (message.type === 'export:queryGlobalStatus') {
					webviewPanel.webview.postMessage({
						type: 'export:globalStatus',
						hasActiveExport: false,
					});
					return;
				}

				// Handle file validation request
				if (message.type === 'validateFile') {
					const filePath = message.path;
					let exists = false;
					let absolutePath = filePath;

					try {
						const fs = await import('fs');
						const path = await import('path');

						// Resolve relative paths based on .jvi file location
						if (!path.isAbsolute(filePath)) {
							// Get .jvi file directory
							const jviDir = path.dirname(document.uri.fsPath);
							absolutePath = path.join(jviDir, filePath);
						}

						// Check if file exists and is accessible
						exists = fs.existsSync(absolutePath);
					} catch (error) {
						console.error('[VideoEditorProvider] File validation error:', error);
						exists = false;
					}

					// CRITICAL: Always send response, even if there's an error
					try {
						webviewPanel.webview.postMessage({
							type: 'fileValidation',
							path: filePath,
							exists,
						});
					} catch (postError) {
						console.error('[VideoEditorProvider] Failed to send validation response:', postError);
					}
					return;
				}

				// Broadcast export status changes to all webviews
				if (message.type === 'export:streaming:init' ||
					message.type === 'export:complete' ||
					message.type === 'export:error' ||
					message.type === 'export:cancelled') {
					// Broadcast after a short delay to ensure the export state is updated
					setTimeout(() => {
						this.broadcastExportStatus();
					}, 100);
				}

				// Handle webview ready message - send frame server config
				if (message.type === 'ready') {
					console.log('[VideoEditorProvider] Webview ready, sending frame server config');
					if (frameServerPort) {
						webviewPanel.webview.postMessage({
							type: 'frameServer:config',
							port: frameServerPort,
						});
					}
					// Re-notify stream info (stream was created before webview loaded)
					const ms = this.mediaServices.get(docUri);
					if (ms) {
						ms.notifyStreamCreated();
					}
					return;
				}

				messageHandler.handleMessage(message);

				// Update FrameServer and outline on incremental sync
				if (message.type === 'operationApplied') {
					const mediaService = this.mediaServices.get(docUri);
					if (mediaService) {
						const operation = message.operation;
						// Operations that Rust engine can apply incrementally
						const RUST_FAST_PATH_OPS = new Set([
							// P0: field patches
							'element.update', 'track.toggle', 'element.toggle',
							// P1: simple mutations
							'track.update', 'element.splitKeepLeft', 'element.splitKeepRight', 'project.update',
							// P2: structural operations
							'element.add', 'element.remove', 'element.move',
							'track.add', 'track.remove', 'track.reorder',
							'element.splitAt', 'element.linkAudio', 'element.unlinkAudio',
							'batch',
						]);
						const isIncremental = RUST_FAST_PATH_OPS.has(operation.type);
						if (isIncremental) {
							// Fast path: send just the operation to Rust (~100 bytes)
							mediaService.handleMessage({
								type: 'media:frameServer:projectPlayback:applyOperation',
								payload: { operation },
							}).catch(() => {
								// Fallback to full update on failure
								const content = model!.getProjectData();
								mediaService.handleMessage({
									type: 'media:frameServer:projectPlayback:update',
									payload: { projectData: content },
								}).catch((err: unknown) => {
									console.warn('[VideoEditorProvider] Stream fallback update failed:', err);
								});
							});
						} else {
							// Slow path: send full ProjectData for complex operations
							const content = model!.getProjectData();
							mediaService.handleMessage({
								type: 'media:frameServer:projectPlayback:update',
								payload: { projectData: content },
							}).catch((err: unknown) => {
								console.warn('[VideoEditorProvider] Stream update from operation failed:', err);
							});
						}
					}

					if (webviewPanel.visible) {
						outlineProvider?.updateProject(model!.getProjectData());
					}
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Show status bar when this editor is visible
		const updateStatusBarVisibility = () => {
			if (webviewPanel.visible) {
				statusBar?.show();
				// Update outline with current project data
				const content = model!.getProjectData();
				outlineProvider?.updateProject(content);
				// Notify project defaults update via event
				this._onProjectDefaultsUpdate.fire({
					defaults: content.defaults || null,
				});
				// Request initial status from webview
				webviewPanel.webview.postMessage({ type: 'requestStatus' });
			} else {
				statusBar?.hide();
				// Clear outline when editor is not visible
				outlineProvider?.updateProject(null);
			}
		};

		// Track visibility changes
		webviewPanel.onDidChangeViewState(() => {
			updateStatusBarVisibility();
		});

		// Initial visibility check
		updateStatusBarVisibility();

		// Send initial document content to webview
		const projectRoot = path.dirname(document.uri.fsPath);
		const updateWebview = () => {
			const content = model!.getProjectData();
			webviewPanel.webview.postMessage({
				type: 'update',
				content,
				projectRoot, // Project root directory for resolving relative media paths
			});
			// Update outline when document changes
			if (webviewPanel.visible) {
				outlineProvider?.updateProject(content);
			}
			// Notify project defaults update via event
			this._onProjectDefaultsUpdate.fire({
				defaults: content.defaults || null,
			});
		};

		// Listen for model changes (来自 VideoEditorModel 的事件)
		const modelChangeSubscription = model.onDidChange(() => {
			updateWebview();

			// Hot-update timeline data in the active stream
			const mediaService = this.mediaServices.get(docUri);
			if (mediaService) {
				const content = model!.getProjectData();
				mediaService.handleMessage({
					type: 'media:frameServer:projectPlayback:update',
					payload: { projectData: content },
				}).catch((err: unknown) => {
					console.warn('[VideoEditorProvider] Timeline update failed:', err);
				});
			}
		});

		// Listen for document changes (来自 VSCode TextDocument 的事件，用于外部修改)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
			(e) => {
				if (e.document.uri.toString() === document.uri.toString()) {
					// Skip reload if this is an internal save (from webview)
					// This prevents the save operation from overwriting webview state
					if (model!.isInternalSave) {
						console.log('[VideoEditorProvider] Skipping reload for internal save');
						// Decrement counter after processing the event
						model!.decrementInternalSaveCounter();
						return;
					}
					// 重新加载模型内容 (only for external changes)
					console.log('[VideoEditorProvider] External change detected, reloading model');
					model!.reload();
				}
			}
		);

		// Clean up when editor is closed
		webviewPanel.onDidDispose(async () => {
			// NOTE: Export is now handled by neko-engine
			// Export cancellation is managed by neko-engine when connection is lost

			changeDocumentSubscription.dispose();
			modelChangeSubscription.dispose();

			// Remove from active webviews and panels
			this.activeWebviews.delete(docUri);
			this.activeWebviewPanels.delete(docUri);

			// Destroy editor stream, then dispose MediaService
			const mediaService = this.mediaServices.get(docUri);
			if (mediaService) {
				await mediaService.destroyEditorStream();
				mediaService.dispose();
				this.mediaServices.delete(docUri);
			}

			// Dispose FrameServerService
			const frameServer = this.frameServerServices.get(docUri);
			if (frameServer) {
				await frameServer.dispose();
				this.frameServerServices.delete(docUri);
			}

			// Clear outline when editor is closed
			outlineProvider?.updateProject(null);

			// 注销模型（如果这是最后一个使用该文档的编辑器）
			const modelDisposable = this.modelDisposables.get(docUri);
			if (modelDisposable) {
				modelDisposable.dispose();
				this.modelDisposables.delete(docUri);
			}

			// 清除活动编辑器（如果是当前活动的）
			if (editorRegistry.getActiveEditor() === model) {
				editorRegistry.setActiveEditor(undefined);
			}
		});

		// Initial update
		updateWebview();
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		// Check if running in development mode
		const isDev = process.env.VITE_DEV_MODE === 'true';
		const devServerPort = process.env.VITE_DEV_PORT || '5173';

		// Use a nonce to only allow specific scripts to be run
		const nonce = getNonce();

		// Get VS Code locale
		const locale = vscode.env.language || 'en';

		if (isDev) {
			// Development mode: connect to Vite dev server for HMR
			const devServerUrl = `http://localhost:${devServerPort}`;
			console.log(`[VideoEditorProvider] Dev mode enabled, connecting to ${devServerUrl}`);

			return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' http://localhost:${devServerPort}; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:${devServerPort}; worker-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data: blob: https: http://127.0.0.1:* http://localhost:${devServerPort}; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource} http://localhost:${devServerPort}; connect-src ${webview.cspSource} https: data: blob: ws://127.0.0.1:* http://127.0.0.1:* ws://localhost:${devServerPort} http://localhost:${devServerPort};">
  <title>Neko Suite - Video Editor (Dev)</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Acquire VSCode API BEFORE loading any modules
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}">
    // React Fast Refresh preamble - must be before any React code
    import RefreshRuntime from '${devServerUrl}/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  </script>
  <script type="module" nonce="${nonce}" src="${devServerUrl}/@vite/client"></script>
  <script type="module" nonce="${nonce}" src="${devServerUrl}/src/main.tsx"></script>
</body>
</html>`;
		}

		// Production mode: load from dist/webview
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'style.css')
		);

		return `<!DOCTYPE html>
<html lang="${locale}" data-vscode-locale="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src ${webview.cspSource} blob:; img-src ${webview.cspSource} data: blob: https: http://127.0.0.1:*; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https: data: blob: ws://127.0.0.1:* http://127.0.0.1:*;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Neko Suite - Video Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // Acquire VSCode API BEFORE loading any modules
    window.vscodeApi = acquireVsCodeApi();
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
