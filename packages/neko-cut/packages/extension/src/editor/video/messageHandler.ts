/**
 * 消息处理器
 * 处理 Extension Host 和 WebView 之间的消息通信
 *
 * 职责：编辑器核心消息（保存、文件请求、导出）
 * 配置消息委托给 ConfigBridge 处理
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VideoEditorModel } from './videoEditorModel';
import { MessageFromWebview, ProjectData, ContextMenuItem, AI_ACTIONS } from '@neko/shared';
import { getService } from '../../base';
import { IPlatform, IConnectionStateManager } from '../../bootstrap';
import { ConfigBridge } from '../../services/configBridge';
import { IAgentManager } from '../../ai/agentManager';
import { IAgentManager as IAgentManagerId } from '../../bootstrap';
import { createDefaultAgentContext } from '../../ai/agentContext';
import type { Platform } from '@neko/platform';
import { getAudioDecoderService } from '../../services/audioDecoderService';

/**
 * Handles messages between Extension Host and WebView
 */
export class MessageHandler {
	// 配置消息桥接器
	private readonly configBridge: ConfigBridge | null;

	// 当前导出文件的写入流
	private _exportWriteStream: fs.WriteStream | null = null;
	private _exportFilePath: string | null = null;

	constructor(
		private readonly webview: vscode.Webview,
		private readonly model: VideoEditorModel,
		private readonly context: vscode.ExtensionContext
	) {
		// 初始化 ConfigBridge
		const platform = this.getPlatform();
		const connectionStateManager = getService(IConnectionStateManager);
		this.configBridge = platform ? new ConfigBridge(platform, connectionStateManager, this.context) : null;
	}

	/**
	 * Handle incoming messages from the webview
	 */
	public async handleMessage(message: MessageFromWebview): Promise<void> {
		// 1. 委托配置消息给 ConfigBridge
		if (this.configBridge) {
			const handled = await this.configBridge.handleMessage(
				message as { type: string; [key: string]: unknown },
				msg => this.webview.postMessage(msg)
			);
			if (handled) return;
		}

		// 2. 处理编辑器核心消息
		switch (message.type) {
			case 'ready':
				this.sendUpdate();
				break;

			case 'save':
				await this.handleSave(message.content);
				break;

			case 'requestFile':
				await this.handleRequestFile(message.path);
				break;

			case 'addMediaToTimeline':
				await this.handleAddMedia(message.path);
				break;

			case 'saveBlob':
				await this.handleSaveBlob(message.data, message.filename, message.mimeType);
				break;

			case 'selectExportPath':
				await this.handleSelectExportPath(message.filename, message.format);
				break;

			case 'saveBlobToPath':
				await this.handleSaveBlobToPath(message.data, message.path, message.mimeType);
				break;

			case 'showExportDialog':
				await this.handleShowExportDialog(message.filename, message.format);
				break;

			case 'writeExportChunk':
				await this.handleWriteExportChunk(message.data);
				break;

			case 'finalizeExport':
				await this.handleFinalizeExport(message.success, message.error);
				break;

			case 'cancelExport':
				await this.handleCancelExport();
				break;

			case 'showContextMenu':
				await this.handleShowContextMenu(message.menuId, message.items);
				break;

			case 'executeAIAction':
				await this.handleExecuteAIAction(message.actionId, message.elementIds, message.params);
				break;

			case 'decodeAudio':
				await this.handleDecodeAudio(
					message.requestId,
					message.videoPath,
					message.startTime,
					message.duration,
					message.format,
					message.sampleRate,
					message.channels
				);
				break;

			case 'readFileRange':
				await this.handleReadFileRange(
					message.requestId,
					message.path,
					message.start,
					message.end
				);
				break;

			default:
				console.warn('Unknown message type:', (message as { type: string }).type);
		}
	}

	/**
	 * Send updated content to WebView
	 */
	public sendUpdate(): void {
		this.webview.postMessage({
			type: 'update',
			content: this.model.getProjectData(),
		});
	}

	/**
	 * Send error message to WebView
	 */
	public sendError(message: string): void {
		this.webview.postMessage({
			type: 'error',
			message,
		});
	}

	/**
	 * Get platform instance from service collection
	 */
	private getPlatform(): Platform | null {
		try {
			return getService<Platform>(IPlatform) ?? null;
		} catch {
			console.warn('[MessageHandler] Platform service not available');
			return null;
		}
	}

	// ==========================================================================
	// 编辑器核心处理方法
	// ==========================================================================

	/**
	 * Handle save request from WebView
	 */
	private async handleSave(content: ProjectData): Promise<void> {
		try {
			const normalizedContent = this.normalizePathsForSave(content);
			const success = await this.model.updateProjectData(normalizedContent);
			if (success) {
				this.webview.postMessage({ type: 'saved' });
			} else {
				this.sendError('Failed to save project');
			}
		} catch (error) {
			console.error('Save error:', error);
			this.sendError(`Save error: ${error}`);
		}
	}

	/**
	 * Convert absolute paths to relative paths for portable .jvi files
	 * Paths are relative to the .jvi file location, not workspace root
	 */
	private normalizePathsForSave(content: ProjectData): ProjectData {
		// Get the directory containing the .jvi file
		const jviDir = path.dirname(this.model.uri.fsPath);
		const normalized = JSON.parse(JSON.stringify(content)) as ProjectData;

		for (const track of normalized.tracks) {
			for (const element of track.elements) {
				if ('src' in element && typeof element.src === 'string') {
					element.src = this.toRelativePath(element.src, jviDir);
				}
			}
		}

		return normalized;
	}

	/**
	 * Convert an absolute path to a relative path from the given base directory
	 */
	private toRelativePath(filePath: string, baseDir: string): string {
		if (!path.isAbsolute(filePath)) {
			return filePath;
		}

		const normalizedPath = path.normalize(filePath);
		const normalizedBase = path.normalize(baseDir);

		// Check if file is within or accessible from base directory
		let relativePath = path.relative(baseDir, filePath);
		relativePath = relativePath.split(path.sep).join('/');

		return relativePath;
	}

	/**
	 * Resolve a media path to absolute path
	 * Paths in .jvi files are relative to the .jvi file location
	 */
	private resolveMediaPath(filePath: string): string {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}

		// Resolve relative to .jvi file directory
		const jviDir = path.dirname(this.model.uri.fsPath);
		const resolved = path.resolve(jviDir, filePath);
		return resolved;
	}

	/**
	 * Handle file request from WebView
	 * Uses webview URI for all media types (video, audio, image)
	 * Avoids base64 encoding for better performance
	 */
	private async handleRequestFile(filePath: string): Promise<void> {
		try {
			// Resolve path relative to .jvi file
			const absolutePath = this.resolveMediaPath(filePath);
			const fileUri = vscode.Uri.file(absolutePath);

			try {
				await vscode.workspace.fs.stat(fileUri);
			} catch {
				console.error('[MessageHandler] File not found:', absolutePath);
				this.sendError(`File not found: ${filePath}`);
				return;
			}

			// Use webview URI for all media types (no base64 encoding)
			const webviewUri = this.webview.asWebviewUri(fileUri);
			this.webview.postMessage({
				type: 'fileUri',
				path: filePath,
				uri: webviewUri.toString(),
			});
		} catch (error) {
			console.error('File request error:', error);
			this.sendError(`Failed to load file: ${filePath}`);
		}
	}

	/**
	 * Handle adding media to timeline
	 */
	private async handleAddMedia(relativePath: string): Promise<void> {
		try {
			const ext = path.extname(relativePath).toLowerCase();
			let mediaType: 'video' | 'audio' | 'image';

			if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
				mediaType = 'video';
			} else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
				mediaType = 'audio';
			} else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
				mediaType = 'image';
			} else {
				this.sendError(`Unsupported file type: ${ext}`);
				return;
			}

			this.webview.postMessage({
				type: 'fileAdded',
				path: relativePath,
				mediaType,
			});
		} catch (error) {
			console.error('Add media error:', error);
			this.sendError(`Failed to add media: ${relativePath}`);
		}
	}

	/**
	 * Handle showing VSCode native context menu
	 */
	private async handleShowContextMenu(menuId: string, items: ContextMenuItem[]): Promise<void> {
		try {
			const quickPickItems: vscode.QuickPickItem[] = items
				.filter(item => !item.separator)
				.map(item => ({
					label: item.label,
					description: item.shortcut,
					detail: item.disabled ? '(disabled)' : undefined,
				}));

			const selected = await vscode.window.showQuickPick(quickPickItems, {
				placeHolder: 'Select an action',
				canPickMany: false,
			});

			const selectedItem = items.find(item => item.label === selected?.label);

			this.webview.postMessage({
				type: 'contextMenuResult',
				menuId,
				selectedId: selectedItem?.id,
			});
		} catch (error) {
			console.error('[MessageHandler] Context menu error:', error);
			this.webview.postMessage({
				type: 'contextMenuResult',
				menuId,
				selectedId: undefined,
			});
		}
	}

	// ==========================================================================
	// 导出处理方法
	// ==========================================================================

	/**
	 * Handle showing export dialog and preparing write stream
	 */
	private async handleShowExportDialog(filename: string, format: string): Promise<void> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
				filters: { 'Video': [format] },
				title: 'Export Video',
			});

			if (!saveUri) {
				this.webview.postMessage({
					type: 'exportDialogResult',
					success: false,
					cancelled: true,
				});
				return;
			}

			this._exportFilePath = saveUri.fsPath;
			this._exportWriteStream = fs.createWriteStream(this._exportFilePath);

			this._exportWriteStream.on('error', error => {
				console.error('[MessageHandler] Write stream error:', error);
				this.webview.postMessage({
					type: 'exportStreamError',
					error: error.message,
				});
			});

			this.webview.postMessage({
				type: 'exportDialogResult',
				success: true,
				path: saveUri.fsPath,
			});
		} catch (error) {
			console.error('[MessageHandler] Show export dialog error:', error);
			this.webview.postMessage({
				type: 'exportDialogResult',
				success: false,
				error: error instanceof Error ? error.message : 'Failed to show export dialog',
			});
		}
	}

	/**
	 * Handle writing export chunk to file
	 */
	private async handleWriteExportChunk(data: ArrayBuffer): Promise<void> {
		if (!this._exportWriteStream || !this._exportFilePath) {
			console.error('[MessageHandler] No export stream available');
			this.webview.postMessage({
				type: 'exportChunkResult',
				success: false,
				error: 'No export stream available',
			});
			return;
		}

		try {
			const buffer = Buffer.from(data);
			const canContinue = this._exportWriteStream.write(buffer);

			if (!canContinue) {
				await new Promise<void>(resolve => {
					this._exportWriteStream!.once('drain', resolve);
				});
			}

			this.webview.postMessage({
				type: 'exportChunkResult',
				success: true,
			});
		} catch (error) {
			console.error('[MessageHandler] Write chunk error:', error);
			this.webview.postMessage({
				type: 'exportChunkResult',
				success: false,
				error: error instanceof Error ? error.message : 'Failed to write chunk',
			});
		}
	}

	/**
	 * Handle finalizing export
	 */
	private async handleFinalizeExport(success: boolean, error?: string): Promise<void> {
		const filePath = this._exportFilePath;

		try {
			if (this._exportWriteStream) {
				await new Promise<void>((resolve, reject) => {
					this._exportWriteStream!.end((err: Error | null | undefined) => {
						if (err) reject(err);
						else resolve();
					});
				});
				this._exportWriteStream = null;
			}

			if (success && filePath) {
				this.webview.postMessage({
					type: 'exportComplete',
					success: true,
					path: filePath,
				});

				const selection = await vscode.window.showInformationMessage(
					`Video exported successfully: ${path.basename(filePath)}`,
					'Open File',
					'Open Folder'
				);

				if (selection === 'Open File') {
					vscode.env.openExternal(vscode.Uri.file(filePath));
				} else if (selection === 'Open Folder') {
					vscode.env.openExternal(vscode.Uri.file(path.dirname(filePath)));
				}
			} else {
				this.webview.postMessage({
					type: 'exportComplete',
					success: false,
					error: error || 'Export failed',
				});

				if (filePath && fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
			}
		} catch (err) {
			console.error('[MessageHandler] Finalize export error:', err);
			this.webview.postMessage({
				type: 'exportComplete',
				success: false,
				error: err instanceof Error ? err.message : 'Failed to finalize export',
			});
		} finally {
			this._exportFilePath = null;
		}
	}

	/**
	 * Handle canceling export
	 */
	private async handleCancelExport(): Promise<void> {
		try {
			const filePath = this._exportFilePath;

			if (this._exportWriteStream) {
				this._exportWriteStream.destroy();
				this._exportWriteStream = null;
			}

			if (filePath && fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}

			this._exportFilePath = null;

			this.webview.postMessage({
				type: 'exportCancelled',
			});
		} catch (error) {
			console.error('[MessageHandler] Cancel export error:', error);
		}
	}

	/**
	 * Handle saving blob data from WebView (WebCodecs export)
	 * Supports both binary ArrayBuffer (preferred) and base64 string (legacy)
	 */
	private async handleSaveBlob(
		data: ArrayBuffer | string,
		filename: string,
		mimeType: string
	): Promise<void> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

			const extMap: Record<string, string> = {
				'video/mp4': 'mp4',
				'video/webm': 'webm',
				'image/gif': 'gif',
				'image/png': 'png',
				'image/jpeg': 'jpg',
				'image/webp': 'webp',
			};
			const ext = extMap[mimeType] || 'mp4';

			// Determine if this is an image or video
			const isImage = mimeType.startsWith('image/');
			const filterLabel = isImage ? 'Image' : 'Video';
			const title = isImage ? 'Save Screenshot' : 'Save Exported Video';

			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
				filters: { [filterLabel]: [ext] },
				title,
			});

			if (!saveUri) {
				this.webview.postMessage({
					type: 'blobSaveResult',
					success: false,
					cancelled: true,
				});
				return;
			}

			// Handle both binary (preferred) and base64 (legacy) formats
			let buffer: Buffer;
			if (typeof data === 'string') {
				// Legacy: base64 encoded string
				buffer = Buffer.from(data, 'base64');
			} else if (data instanceof ArrayBuffer) {
				// Preferred: direct ArrayBuffer
				buffer = Buffer.from(data);
			} else if (ArrayBuffer.isView(data)) {
				// TypedArray or DataView
				buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
			} else if (typeof data === 'object' && data !== null) {
				// Structured clone result (object with numeric keys)
				const values = Object.values(data as Record<string, number>);
				buffer = Buffer.from(values);
			} else {
				throw new Error('Invalid data format for blob save');
			}

			await vscode.workspace.fs.writeFile(saveUri, buffer);

			this.webview.postMessage({
				type: 'blobSaveResult',
				success: true,
				path: saveUri.fsPath,
			});

			const successMessage = isImage
				? `Screenshot saved successfully: ${path.basename(saveUri.fsPath)}`
				: `Video exported successfully: ${path.basename(saveUri.fsPath)}`;

			const selection = await vscode.window.showInformationMessage(
				successMessage,
				'Open File',
				'Open Folder'
			);

			if (selection === 'Open File') {
				vscode.env.openExternal(saveUri);
			} else if (selection === 'Open Folder') {
				vscode.env.openExternal(vscode.Uri.file(path.dirname(saveUri.fsPath)));
			}
		} catch (error) {
			console.error('[MessageHandler] Save blob error:', error);
			this.webview.postMessage({
				type: 'blobSaveResult',
				success: false,
				error: error instanceof Error ? error.message : 'Failed to save file',
			});
		}
	}

	/**
	 * Handle selecting export path before export starts
	 * Shows save dialog and returns the selected path
	 */
	private async handleSelectExportPath(filename: string, format: string): Promise<void> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			const defaultDir = workspaceFolders?.[0]?.uri.fsPath || '';

			const extMap: Record<string, string> = {
				'mp4': 'mp4',
				'webm': 'webm',
				'gif': 'gif',
			};
			const ext = extMap[format] || 'mp4';

			const saveUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(path.join(defaultDir, filename)),
				filters: { 'Video': [ext] },
				title: '选择导出位置',
			});

			if (!saveUri) {
				this.webview.postMessage({
					type: 'exportPathSelected',
					success: false,
					cancelled: true,
				});
				return;
			}

			this.webview.postMessage({
				type: 'exportPathSelected',
				success: true,
				path: saveUri.fsPath,
			});
		} catch (error) {
			console.error('[MessageHandler] Select export path error:', error);
			this.webview.postMessage({
				type: 'exportPathSelected',
				success: false,
				error: error instanceof Error ? error.message : 'Failed to select export path',
			});
		}
	}

	/**
	 * Handle saving blob data to a pre-selected path (no dialog)
	 */
	private async handleSaveBlobToPath(
		data: ArrayBuffer | string,
		filePath: string,
		mimeType: string
	): Promise<void> {
		try {
			// Handle both binary (preferred) and base64 (legacy) formats
			let buffer: Buffer;
			if (typeof data === 'string') {
				// Legacy: base64 encoded string
				buffer = Buffer.from(data, 'base64');
			} else if (data instanceof ArrayBuffer) {
				// Preferred: direct ArrayBuffer
				buffer = Buffer.from(data);
			} else if (ArrayBuffer.isView(data)) {
				// TypedArray or DataView
				buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
			} else if (typeof data === 'object' && data !== null) {
				// Structured clone result (object with numeric keys)
				const values = Object.values(data as Record<string, number>);
				buffer = Buffer.from(values);
			} else {
				throw new Error('Invalid data format for blob save');
			}

			const saveUri = vscode.Uri.file(filePath);
			await vscode.workspace.fs.writeFile(saveUri, buffer);

			this.webview.postMessage({
				type: 'blobSaveResult',
				success: true,
				path: filePath,
			});

			// Determine if this is an image or video
			const isImage = mimeType.startsWith('image/');
			const successMessage = isImage
				? `Screenshot saved successfully: ${path.basename(filePath)}`
				: `Video exported successfully: ${path.basename(filePath)}`;

			const selection = await vscode.window.showInformationMessage(
				successMessage,
				'Open File',
				'Open Folder'
			);

			if (selection === 'Open File') {
				vscode.env.openExternal(saveUri);
			} else if (selection === 'Open Folder') {
				vscode.env.openExternal(vscode.Uri.file(path.dirname(filePath)));
			}
		} catch (error) {
			console.error('[MessageHandler] Save blob to path error:', error);
			this.webview.postMessage({
				type: 'blobSaveResult',
				success: false,
				error: error instanceof Error ? error.message : 'Failed to save file',
			});
		}
	}

	// ==========================================================================
	// AI Action 处理方法
	// ==========================================================================

	/**
	 * Handle AI action execution request from WebView
	 * Routes the action to the Agent system for processing
	 */
	private async handleExecuteAIAction(
		actionId: string,
		elementIds: string[],
		params?: Record<string, unknown>
	): Promise<void> {
		try {
			// Get AgentManager service
			const agentManager = this.getAgentManager();
			if (!agentManager) {
				console.warn('[MessageHandler] AgentManager not available, cannot execute AI action');
				this.webview.postMessage({
					type: 'aiActionResult',
					actionId,
					success: false,
					error: 'AI service not available. Please configure an AI provider.',
				});
				return;
			}

			// Get or create agent for video editor (stateless, single-request mode)
			const agentRunner = agentManager.getOrCreate('video-editor-ai');
			agentManager.clearHistory('video-editor-ai'); // Clear for fresh context each time

			// Find the action definition
			const action = AI_ACTIONS.find(a => a.id === actionId);
			if (!action) {
				console.warn('[MessageHandler] Unknown AI action:', actionId);
				this.webview.postMessage({
					type: 'aiActionResult',
					actionId,
					success: false,
					error: `Unknown action: ${actionId}`,
				});
				return;
			}

			// Get element information from the project
			const projectData = this.model.getProjectData();
			const elements = this.findElementsById(projectData, elementIds);

			if (elements.length === 0) {
				this.webview.postMessage({
					type: 'aiActionResult',
					actionId,
					success: false,
					error: 'No elements found for the selected IDs',
				});
				return;
			}

			// Build the AI prompt based on action type
			const prompt = this.buildAIActionPrompt(action.id, action.label, elements, params);

			// Send start notification to WebView
			this.webview.postMessage({
				type: 'aiActionStarted',
				actionId,
				elementIds,
			});

			// Create agent context
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
			const context = createDefaultAgentContext(workspaceRoot);

			// Execute via agent
			let responseContent = '';
			for await (const event of agentRunner.execute(prompt, context)) {
				switch (event.type) {
					case 'text':
						if (event.content) {
							responseContent += event.content;
							// Stream partial response to WebView
							this.webview.postMessage({
								type: 'aiActionProgress',
								actionId,
								content: event.content,
							});
						}
						break;

					case 'tool_call':
						// Notify about tool execution
						this.webview.postMessage({
							type: 'aiActionProgress',
							actionId,
							toolCall: event.toolCall,
						});
						break;

					case 'tool_result':
						// Notify about tool result
						this.webview.postMessage({
							type: 'aiActionProgress',
							actionId,
							toolResult: event.toolResult,
						});
						break;

					case 'error':
						console.error('[MessageHandler] AI Action error:', event.error);
						this.webview.postMessage({
							type: 'aiActionResult',
							actionId,
							success: false,
							error: event.error?.message || 'AI execution failed',
						});
						return;
				}
			}

			// Send final result
			this.webview.postMessage({
				type: 'aiActionResult',
				actionId,
				success: true,
				data: {
					response: responseContent,
					elementIds,
				},
			});
		} catch (error) {
			console.error('[MessageHandler] AI Action error:', error);
			this.webview.postMessage({
				type: 'aiActionResult',
				actionId,
				success: false,
				error: error instanceof Error ? error.message : 'Failed to execute AI action',
			});
		}
	}

	/**
	 * Get AgentManager service
	 */
	private getAgentManager(): IAgentManager | null {
		try {
			return getService<IAgentManager>(IAgentManagerId) ?? null;
		} catch {
			console.warn('[MessageHandler] AgentManager service not available');
			return null;
		}
	}

	/**
	 * Find elements by their IDs from project data
	 */
	private findElementsById(
		projectData: ProjectData,
		elementIds: string[]
	): Array<{ trackId: string; element: unknown }> {
		const results: Array<{ trackId: string; element: unknown }> = [];

		for (const track of projectData.tracks) {
			for (const element of track.elements) {
				if (elementIds.includes(element.id)) {
					results.push({ trackId: track.id, element });
				}
			}
		}

		return results;
	}

	/**
	 * Build AI prompt based on action type and elements
	 */
	private buildAIActionPrompt(
		actionId: string,
		actionLabel: string,
		elements: Array<{ trackId: string; element: unknown }>,
		params?: Record<string, unknown>
	): string {
		// Build element description
		const elementDescriptions = elements.map(({ element }) => {
			const el = element as Record<string, unknown>;
			const type = el.type as string;
			const name = el.name as string || 'Unnamed';

			let desc = `- ${type} element: "${name}"`;
			if (el.src) {
				desc += ` (source: ${el.src})`;
			}
			if (el.duration) {
				desc += ` (duration: ${el.duration}s)`;
			}
			if (el.text && typeof el.text === 'object') {
				const textObj = el.text as { content?: string };
				if (textObj.content) {
					desc += ` (content: "${textObj.content.slice(0, 50)}${textObj.content.length > 50 ? '...' : ''}")`;
				}
			}
			return desc;
		}).join('\n');

		// Build prompt based on action type
		const prompts: Record<string, string> = {
			'video-generate-variant': `Generate a creative variant of the following video element(s). Suggest modifications to visual style, timing, or effects that would create an interesting alternative version.`,
			'video-extend': `Extend the following video element(s) by suggesting additional content or transitions that would naturally continue the visual narrative.`,
			'video-describe': `Analyze and describe the content of the following element(s). Provide a detailed description of what appears in the media, including any visible objects, actions, or text.`,
			'video-extract-keyframes': `Identify the optimal keyframe positions for the following video element(s). Suggest timestamps where significant visual changes occur.`,
			'image-to-video': `Convert the following image element(s) to video by suggesting motion effects, transitions, or animations that would bring the static image(s) to life.`,
			'image-edit': `Suggest edits for the following image element(s). Consider color corrections, cropping, or visual enhancements that would improve the image(s).`,
			'image-upscale': `Suggest the best upscaling approach for the following element(s). Consider the source quality and target resolution.`,
			'text-translate': `Translate the text content of the following element(s)${params?.targetLanguage ? ` to ${params.targetLanguage}` : ''}.`,
			'text-rewrite': `Rewrite the text content of the following element(s) to improve clarity, style, or engagement while maintaining the original meaning.`,
			'text-generate-voiceover': `Generate a voiceover script for the following text element(s). Suggest pacing, emphasis, and tone appropriate for video narration.`,
			'audio-transcribe': `Transcribe the audio content of the following element(s). Provide accurate text transcription with timestamps if applicable.`,
			'batch-style-unify': `Analyze the following elements and suggest adjustments to create a unified visual style across all of them. Consider color grading, filters, and visual consistency.`,
		};

		const basePrompt = prompts[actionId] || `Execute the "${actionLabel}" action on the following element(s).`;

		return `${basePrompt}

Selected elements:
${elementDescriptions}

${params ? `Additional parameters: ${JSON.stringify(params, null, 2)}` : ''}

Please provide specific, actionable suggestions or perform the requested operation.`;
	}

	// ==========================================================================
	// 音频解码处理方法
	// ==========================================================================

	/**
	 * Handle audio decode request from WebView
	 */
	private async handleDecodeAudio(
		requestId: string,
		videoPath: string,
		startTime: number,
		duration: number,
		format?: 'wav' | 'mp3',
		sampleRate?: number,
		channels?: number
	): Promise<void> {
		try {
			// Resolve path relative to .jvi file directory (same as other media paths)
			const absolutePath = this.resolveMediaPath(videoPath);

			// 检查文件是否存在
			const fileUri = vscode.Uri.file(absolutePath);
			try {
				await vscode.workspace.fs.stat(fileUri);
			} catch {
				console.error('[MessageHandler] File not found:', absolutePath);
				this.webview.postMessage({
					type: 'audioDecodeResult',
					requestId,
					success: false,
					error: `File not found: ${videoPath}`,
				});
				return;
			}

			// 使用 AudioDecoderService 解码
			const audioDecoderService = getAudioDecoderService();
			const result = await audioDecoderService.decodeAudioSegment({
				videoPath: absolutePath,
				startTime,
				duration,
				format,
				sampleRate,
				channels,
			});

			// 发送结果到 WebView
			this.webview.postMessage({
				type: 'audioDecodeResult',
				requestId,
				success: true,
				data: result.data,
				mimeType: result.mimeType,
				duration: result.duration,
				cached: result.cached,
			});
		} catch (error) {
			console.error('[MessageHandler] Audio decode error:', error);
			this.webview.postMessage({
				type: 'audioDecodeResult',
				requestId,
				success: false,
				error: error instanceof Error ? error.message : 'Failed to decode audio',
			});
		}
	}

	/**
	 * Handle file range read request (for testing on-demand loading)
	 * Uses Node.js fs API to read specific byte range from file
	 */
	private async handleReadFileRange(
		requestId: string,
		filePath: string,
		start: number,
		end: number
	): Promise<void> {
		try {
			// Resolve path relative to .jvi file
			const absolutePath = this.resolveMediaPath(filePath);

			// Get file stats
			const stats = fs.statSync(absolutePath);
			const fileSize = stats.size;

			// Validate range
			const actualStart = Math.max(0, start);
			const actualEnd = Math.min(end, fileSize - 1);

			if (actualStart > actualEnd || actualStart >= fileSize) {
				this.webview.postMessage({
					type: 'fileRangeResult',
					requestId,
					success: false,
					error: `Invalid range: ${start}-${end} for file size ${fileSize}`,
				});
				return;
			}

			// Read specific range using Node.js fs
			const length = actualEnd - actualStart + 1;
			const buffer = Buffer.alloc(length);
			const fd = fs.openSync(absolutePath, 'r');

			try {
				fs.readSync(fd, buffer, 0, length, actualStart);
			} finally {
				fs.closeSync(fd);
			}

			// Convert to base64 for transfer
			const base64Data = buffer.toString('base64');

			console.log(`[MessageHandler] readFileRange: path=${filePath}, requested=${start}-${end}, actual=${actualStart}-${actualEnd}, size=${length}, fileSize=${fileSize}`);

			this.webview.postMessage({
				type: 'fileRangeResult',
				requestId,
				success: true,
				data: base64Data,
				actualStart,
				actualEnd,
				fileSize,
			});
		} catch (error) {
			console.error('[MessageHandler] File range read error:', error);
			this.webview.postMessage({
				type: 'fileRangeResult',
				requestId,
				success: false,
				error: error instanceof Error ? error.message : 'Failed to read file range',
			});
		}
	}
}
