/**
 * 视频编辑器 Provider
 * 使用新架构 (VideoEditorModel + EditorRegistry)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { IEditorRegistry } from '../common/editorRegistry';
import { VideoEditorModel } from './videoEditorModel';
import { MessageHandler } from './messageHandler';
import { MediaProcessorService } from '../../services/MediaProcessorService';
import { FrameServerService } from '../../services/FrameServerService';
import { handleExportMessage, isExportMessage, CompatibleExportHandler, isCompatibleModeMessage, handleMediaEngineModeMessage, isMediaEngineModeMessage } from '../../handlers';
import { getService } from '../../base';
import { IStatusBar } from '../../views/statusBar';
import { IVideoProjectOutlineProvider } from '../../views/outlineProvider';
import { getStreamingExportService } from '../../services/StreamingExportService';
import { IMediaEngineManager } from '../../bootstrap/serviceBootstrap';
import type { TimelineElement, ProjectDefaults } from '@uniedit/shared';
import { extractMediaPaths } from '@uniedit/shared';

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
	private static readonly viewType = 'uniedit.videoEditor';
	private activeWebviews: Map<string, vscode.Webview> = new Map();
	private activeWebviewPanels: Map<string, vscode.WebviewPanel> = new Map();
	private modelDisposables: Map<string, vscode.Disposable> = new Map();
	private mediaProcessorServices: Map<string, MediaProcessorService> = new Map();
	private compatibleExportHandlers: Map<string, CompatibleExportHandler> = new Map();
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
	 */
	private broadcastExportStatus() {
		const exportService = getStreamingExportService();
		const hasActiveExport = exportService.hasActiveExport();

		// Send to all active webviews
		for (const [uri, webview] of this.activeWebviews) {
			webview.postMessage({
				type: 'export:globalStatus',
				hasActiveExport,
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

		// Create MediaProcessorService for this webview with document URI for path resolution
		const mediaProcessorService = new MediaProcessorService(webviewPanel, document.uri);
		this.mediaProcessorServices.set(docUri, mediaProcessorService);

		// Initialize Frame Server for high-performance frame delivery (bypasses postMessage)
		let frameServerPort: number | null = null;
		const frameServerService = await FrameServerService.tryCreate({ port: 0 });
		if (frameServerService) {
			frameServerPort = frameServerService.getPort();
			this.frameServerServices.set(docUri, frameServerService);
			// Connect frame server to media processor for frame pushing
			mediaProcessorService.setFrameServerService(frameServerService);
			console.log(`[VideoEditorProvider] Frame server started on port ${frameServerPort}`);
		} else {
			console.warn('[VideoEditorProvider] Frame server not available, using postMessage fallback');
		}

		// Create CompatibleExportHandler for native mode export
		const projectDir = path.dirname(document.uri.fsPath);
		const projectFilePath = document.uri.fsPath;  // Pass actual .jvi file path
		const compatibleExportHandler = new CompatibleExportHandler(
			(msg) => webviewPanel.webview.postMessage(msg),
			projectDir,
			frameServerPort ?? 8765,  // Use FrameServerService's actual port
			projectFilePath
		);
		this.compatibleExportHandlers.set(docUri, compatibleExportHandler);

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
				// 1. Try to handle media processing requests (media:*)
				const mediaHandled = await mediaProcessorService.handleMessage(message);
				if (mediaHandled) {
					return;
				}

				// 2. Try to handle compatible mode export requests
				if (isCompatibleModeMessage(message)) {
					const compatibleHandled = await compatibleExportHandler.handleMessage(message);
					if (compatibleHandled) {
						return;
					}
				}

				// 2.5. Try to handle media engine mode requests (mediaEngine:*)
				if (isMediaEngineModeMessage(message)) {
					const postMessage = (response: unknown) => {
						webviewPanel.webview.postMessage(response);
					};
					const manager = getService(IMediaEngineManager);
					const modeHandled = await handleMediaEngineModeMessage(message, postMessage, manager ?? null);
					if (modeHandled) {
						return;
					}
				}

				// 3. Try to handle export requests (export:*)
				if (isExportMessage(message)) {
					const postMessage = (response: unknown) => {
						webviewPanel.webview.postMessage(response);
					};
					// Pass project directory for resolving relative media paths
					const projectDir = path.dirname(document.uri.fsPath);

					// Pin the editor tab when export starts to prevent accidental closure
					if (message.type === 'export:streaming:init') {
						this.pinEditorTab(document.uri);
					}

					const exportHandled = await handleExportMessage(message, postMessage, projectDir);

					// Unpin the editor tab when export completes or fails
					if (message.type === 'export:streaming:finalize') {
						// Delay unpin slightly to ensure export is fully completed
						setTimeout(() => this.unpinEditorTab(document.uri), 1000);
					}

					if (exportHandled) {
						return;
					}
				}

				// 3. Handle status updates separately
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
				if (message.type === 'export:queryGlobalStatus') {
					const exportService = getStreamingExportService();
					webviewPanel.webview.postMessage({
						type: 'export:globalStatus',
						hasActiveExport: exportService.hasActiveExport(),
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

				messageHandler.handleMessage(message);
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

		// Send frame server configuration to webview (if available)
		if (frameServerPort) {
			webviewPanel.webview.postMessage({
				type: 'frameServer:config',
				port: frameServerPort,
			});
		}

		// Listen for model changes (来自 VideoEditorModel 的事件)
		const modelChangeSubscription = model.onDidChange(() => {
			updateWebview();
		});

		// Listen for document changes (来自 VSCode TextDocument 的事件，用于外部修改)
		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
			(e) => {
				if (e.document.uri.toString() === document.uri.toString()) {
					// 重新加载模型内容
					model!.reload();
				}
			}
		);

		// Clean up when editor is closed
		webviewPanel.onDidDispose(async () => {
			// CRITICAL: Check if there's an active export job
			const exportService = getStreamingExportService();
			const activeJobId = exportService.getActiveExportJobId();

			if (activeJobId) {
				// Cancel the export job
				exportService.cancelExport(activeJobId);

				// Clear status bar export progress
				statusBar?.updateExportProgress({
					isExporting: false,
					percent: 0,
					message: '',
				});

				// Show notification to user
				vscode.window.showWarningMessage(
					'编辑器已关闭，视频导出已自动终止。'
				);

				// Broadcast status change to other webviews
				this.broadcastExportStatus();
			}

			changeDocumentSubscription.dispose();
			modelChangeSubscription.dispose();

			// Remove from active webviews and panels
			this.activeWebviews.delete(docUri);
			this.activeWebviewPanels.delete(docUri);

			// Dispose MediaProcessorService
			const mediaService = this.mediaProcessorServices.get(docUri);
			if (mediaService) {
				mediaService.dispose();
				this.mediaProcessorServices.delete(docUri);
			}

			// Dispose CompatibleExportHandler
			const compatibleHandler = this.compatibleExportHandlers.get(docUri);
			if (compatibleHandler) {
				compatibleHandler.dispose();
				this.compatibleExportHandlers.delete(docUri);
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

		// Resolve auto mode for editor based on timeline media
		// This runs asynchronously to avoid blocking editor initialization
		this.resolveAutoModeForProject(model, projectDir, webviewPanel.webview).catch((error) => {
			console.warn('[VideoEditorProvider] Failed to resolve auto mode:', error);
		});
	}

	/**
	 * Resolve auto mode for a project based on its timeline media
	 * Sends the resolved mode to the Webview for UI display
	 */
	private async resolveAutoModeForProject(
		model: VideoEditorModel,
		projectDir: string,
		webview: vscode.Webview
	): Promise<void> {
		const manager = getService(IMediaEngineManager);
		if (!manager) {
			console.warn('[VideoEditorProvider] MediaEngineManager not available');
			return;
		}

		// Extract media paths from project
		const projectData = model.getProjectData();
		const mediaPaths = extractMediaPaths(projectData);

		// Analyze timeline media first (only once)
		let analysis: Awaited<ReturnType<typeof manager.analyzeTimelineMedia>> | undefined;
		let resolvedMode: 'basic' | 'compatible';

		if (mediaPaths.length === 0) {
			resolvedMode = 'basic';
		} else {
			analysis = await manager.analyzeTimelineMedia(mediaPaths, projectDir);
			resolvedMode = analysis.allSupportBasic ? 'basic' : 'compatible';
		}

		const requiresDownload = resolvedMode === 'compatible' && !manager.isCompatibleModeInstalled;

		// Send the resolved mode to Webview
		webview.postMessage({
			type: 'mediaEngine:response:resolveAutoMode',
			payload: {
				resolvedMode,
				analysis,
				requiresDownload,
			},
		});
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
  <title>UniEdit - Video Editor (Dev)</title>
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
  <title>UniEdit - Video Editor</title>
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
