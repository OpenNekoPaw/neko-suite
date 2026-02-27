/**
 * MediaDiffEditorProvider - Media Diff Custom Editor
 *
 * Provides a custom editor for viewing media file diffs against Git versions.
 *
 * Features:
 * - Opens media files with diff view
 * - Integrates with Git for version comparison
 * - Supports image, video, and audio diff
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
	getMediaType,
} from '@neko/shared';
import { MediaDiffService } from '../services/MediaDiffService';
import { MediaDiffMessageHandler } from './MediaDiffMessageHandler';

// Storage key for persisting local compare files
const LOCAL_COMPARE_FILES_KEY = 'mediaDiff.localCompareFiles';

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Custom editor provider for media diff visualization
 */
export class MediaDiffEditorProvider implements vscode.CustomReadonlyEditorProvider {
	public static readonly viewType = 'neko.mediaDiff';

	private readonly diffService: MediaDiffService;
	private activeWebviews: Map<string, vscode.WebviewPanel> = new Map();
	/** Map from document URI to the previous file URI for local comparison */
	private localCompareFiles: Map<string, vscode.Uri> = new Map();

	constructor(
		private readonly context: vscode.ExtensionContext,
		diffService?: MediaDiffService
	) {
		this.diffService = diffService ?? new MediaDiffService();
		// Restore persisted local compare files
		this.restoreLocalCompareFiles();
	}

	/**
	 * Restore local compare files from workspace state
	 */
	private restoreLocalCompareFiles(): void {
		const stored = this.context.workspaceState.get<Record<string, string>>(LOCAL_COMPARE_FILES_KEY);
		if (stored) {
			for (const [docUri, prevUri] of Object.entries(stored)) {
				this.localCompareFiles.set(docUri, vscode.Uri.parse(prevUri));
			}
		}
	}

	/**
	 * Persist local compare files to workspace state
	 */
	private persistLocalCompareFiles(): void {
		const toStore: Record<string, string> = {};
		for (const [docUri, prevUri] of this.localCompareFiles.entries()) {
			toStore[docUri] = prevUri.toString();
		}
		this.context.workspaceState.update(LOCAL_COMPARE_FILES_KEY, toStore);
	}

	/**
	 * Set up local file comparison mode for a document
	 */
	setLocalCompareFile(documentUri: vscode.Uri, previousUri: vscode.Uri): void {
		this.localCompareFiles.set(documentUri.toString(), previousUri);
		this.persistLocalCompareFiles();
	}

	/**
	 * Clear local file comparison mode for a document
	 */
	clearLocalCompareFile(documentUri: vscode.Uri): void {
		this.localCompareFiles.delete(documentUri.toString());
		this.persistLocalCompareFiles();
	}

	/**
	 * Open a file for diff viewing
	 */
	async openCustomDocument(
		uri: vscode.Uri,
		_openContext: vscode.CustomDocumentOpenContext,
		_token: vscode.CancellationToken
	): Promise<vscode.CustomDocument> {
		return { uri, dispose: () => {} };
	}

	/**
	 * Resolve the custom editor
	 */
	async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		const docUri = document.uri.toString();
		this.activeWebviews.set(docUri, webviewPanel);

		// Check if this is a local file comparison
		const previousUri = this.localCompareFiles.get(docUri);
		const isLocalComparison = !!previousUri;

		// Set panel title based on comparison mode
		const fileName = path.basename(document.uri.fsPath);
		if (isLocalComparison && previousUri) {
			const previousFileName = path.basename(previousUri.fsPath);
			webviewPanel.title = `${previousFileName} ↔ ${fileName}`;
		} else {
			webviewPanel.title = `${fileName} ↔ HEAD`;
		}

		// If not local comparison, check if file is tracked in Git
		// If not tracked, show error instead of trying to compare with HEAD
		let requiresRecompare = false;
		if (!isLocalComparison) {
			const isTracked = await this.isFileTrackedInGit(document.uri);
			if (!isTracked) {
				requiresRecompare = true;
			}
		}

		// Configure webview
		const localResourceRoots = [
			vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
		];

		if (vscode.workspace.workspaceFolders) {
			localResourceRoots.push(
				...vscode.workspace.workspaceFolders.map((f) => f.uri)
			);
		}

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots,
		};

		// Set webview HTML
		webviewPanel.webview.html = this.getHtmlForWebview(
			webviewPanel.webview,
			document.uri,
			previousUri,
			requiresRecompare
		);

		// Create message handler with optional previousUri for local comparison
		const messageHandler = new MediaDiffMessageHandler(
			webviewPanel.webview,
			document.uri,
			this.diffService,
			previousUri
		);

		// Handle messages from webview
		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				await messageHandler.handleMessage(message);
			},
			undefined,
			this.context.subscriptions
		);

		// Cleanup on dispose (don't delete localCompareFiles - keep for session restore)
		webviewPanel.onDidDispose(() => {
			this.activeWebviews.delete(docUri);
			messageHandler.dispose();
		});

		// Initialize diff analysis (skip if requires recompare)
		if (!requiresRecompare) {
			messageHandler.initializeDiff();
		}
	}

	/**
	 * Check if file is tracked in Git
	 */
	private async isFileTrackedInGit(uri: vscode.Uri): Promise<boolean> {
		try {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
			if (!workspaceFolder) {
				return false;
			}

			const { exec } = await import('child_process');
			const { promisify } = await import('util');
			const execAsync = promisify(exec);
			const path = await import('path');

			const relativePath = path.relative(
				workspaceFolder.uri.fsPath,
				uri.fsPath
			);

			await execAsync(
				`git ls-files --error-unmatch "${relativePath}"`,
				{ cwd: workspaceFolder.uri.fsPath }
			);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get HTML content for webview
	 */
	private getHtmlForWebview(
		webview: vscode.Webview,
		fileUri: vscode.Uri,
		previousUri?: vscode.Uri,
		requiresRecompare?: boolean
	): string {
		const mediaType = getMediaType(fileUri.fsPath) ?? 'image';
		const fileName = path.basename(fileUri.fsPath);
		const isLocalComparison = !!previousUri;

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'dist',
				'webview',
				'assets',
				'mediaDiff.js'
			)
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(
				this.context.extensionUri,
				'dist',
				'webview',
				'assets',
				'style.css'
			)
		);

		const nonce = getNonce();
		const locale = vscode.env.language || 'en';

		const initialState = JSON.stringify({
			mediaType,
			fileName,
			isLocalComparison,
			fileUri: fileUri.toString(),
			previousUri: previousUri?.toString(),
			requiresRecompare: requiresRecompare ?? false,
		});

		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} data: blob: https:; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https: data: blob:;">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.initialState = ${initialState};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	dispose(): void {
		this.diffService.dispose();
		this.activeWebviews.clear();
		this.localCompareFiles.clear();
	}
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
	let text = '';
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
