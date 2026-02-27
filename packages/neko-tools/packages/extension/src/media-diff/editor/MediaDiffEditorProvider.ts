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
	type MediaType,
	type DiffViewMode,
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
		const previousFileName = previousUri ? path.basename(previousUri.fsPath) : null;
		const isLocalComparison = !!previousUri;

		// Get webview resource URIs
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
				'mediaDiff.css'
			)
		);

		const nonce = getNonce();
		const locale = vscode.env.language || 'en';

		// Localized strings for the webview
		const l10n = {
			loading: vscode.l10n.t('mediaDiff.loading'),
			analyzing: vscode.l10n.t('mediaDiff.analyzing'),
			similar: vscode.l10n.t('mediaDiff.similar'),
			requiresRecompare: vscode.l10n.t('mediaDiff.requiresRecompare'),
			viewMode: {
				sideBySide: vscode.l10n.t('mediaDiff.viewMode.sideBySide'),
				slider: vscode.l10n.t('mediaDiff.viewMode.slider'),
				overlay: vscode.l10n.t('mediaDiff.viewMode.overlay'),
				onionSkin: vscode.l10n.t('mediaDiff.viewMode.onionSkin'),
			},
			panel: {
				previous: vscode.l10n.t('mediaDiff.panel.previous'),
				current: vscode.l10n.t('mediaDiff.panel.current'),
				previousHead: vscode.l10n.t('mediaDiff.panel.previousHead'),
				currentWorking: vscode.l10n.t('mediaDiff.panel.currentWorking'),
			},
			metadata: {
				size: vscode.l10n.t('mediaDiff.metadata.size'),
				duration: vscode.l10n.t('mediaDiff.metadata.duration'),
				waveformSimilarity: vscode.l10n.t('mediaDiff.metadata.waveformSimilarity'),
			},
			waitingForData: vscode.l10n.t('mediaDiff.waitingForData'),
		};

		// Generate inline styles and initial state
		const initialState = JSON.stringify({
			mediaType,
			fileName,
			previousFileName,
			isLocalComparison,
			requiresRecompare: requiresRecompare ?? false,
			viewMode: 'side-by-side' as DiffViewMode,
			l10n,
		});

		// Display title based on comparison mode
		const displayTitle = isLocalComparison
			? `${previousFileName} ↔ ${fileName}`
			: `${fileName} (HEAD ↔ Working)`;

		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} data: blob: https:; media-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https: data: blob:;">
  <title>Diff: ${displayTitle}</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, monospace);
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      overflow: hidden;
    }
    #root {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .diff-header {
      padding: 8px 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border);
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .diff-title {
      font-weight: 500;
      flex: 1;
    }
    .similarity-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }
    .similarity-high { background: var(--vscode-testing-iconPassed); color: white; }
    .similarity-medium { background: var(--vscode-editorWarning-foreground); color: black; }
    .similarity-low { background: var(--vscode-testing-iconFailed); color: white; }
    .view-mode-select, .ref-select {
      padding: 4px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
    }
    .ref-select {
      max-width: 300px;
      font-size: 12px;
    }
    .diff-content {
      flex: 1;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 16px;
    }
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--vscode-progressBar-background);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error {
      color: var(--vscode-errorForeground);
      text-align: center;
    }
    .side-by-side {
      display: flex;
      gap: 16px;
      width: 100%;
      height: 100%;
    }
    .panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .panel-header {
      padding: 8px;
      background: var(--vscode-sideBar-background);
      text-align: center;
      font-size: 12px;
      font-weight: 500;
    }
    .panel-content {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: auto;
      padding: 8px;
    }
    .panel-content img, .panel-content video {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .metadata {
      padding: 8px;
      font-size: 11px;
      background: var(--vscode-editorWidget-background);
      border-top: 1px solid var(--vscode-panel-border);
    }
    .metadata-row {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }
    .metadata-changed {
      color: var(--vscode-editorWarning-foreground);
    }
    /* Slider mode styles */
    .slider-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .slider-wrapper {
      position: relative;
      display: inline-block;
      line-height: 0;
    }
    .slider-img {
      display: block;
      max-width: 80vw;
      max-height: 70vh;
      object-fit: contain;
    }
    .slider-clip {
      position: absolute;
      top: 0;
      left: 0;
      width: 50%;
      height: 100%;
      overflow: hidden;
    }
    .slider-clip img {
      display: block;
      max-width: none;
      height: 100%;
    }
    .slider-divider {
      position: absolute;
      top: 0;
      left: 50%;
      width: 4px;
      height: 100%;
      background: var(--vscode-button-background);
      cursor: ew-resize;
      z-index: 10;
      transform: translateX(-50%);
    }
    .slider-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      background: var(--vscode-button-background);
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .slider-label {
      position: absolute;
      bottom: 8px;
      padding: 4px 8px;
      background: rgba(0,0,0,0.7);
      color: white;
      font-size: 11px;
      border-radius: 4px;
      z-index: 5;
    }
    .slider-label-left { left: 8px; }
    .slider-label-right { right: 8px; }
    /* Overlay mode styles */
    .overlay-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .overlay-wrapper {
      position: relative;
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .overlay-wrapper img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .overlay-current {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    .overlay-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--vscode-sideBar-background);
      border-radius: 4px;
    }
    .overlay-slider {
      width: 200px;
      cursor: pointer;
    }
    /* Video diff styles */
    .video-diff-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .video-frames {
      flex: 1;
      display: flex;
      gap: 16px;
      overflow: hidden;
    }
    .video-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .video-panel-header {
      padding: 6px 8px;
      background: var(--vscode-sideBar-background);
      text-align: center;
      font-size: 12px;
      font-weight: 500;
    }
    .video-panel-content {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #000;
      overflow: hidden;
    }
    .video-panel-content canvas {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .video-panel-content .placeholder {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .timeline-bar {
      padding: 8px 16px;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-sideBar-border);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .timeline-bar .time-display {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      min-width: 100px;
      text-align: center;
    }
    .timeline-bar input[type="range"] {
      flex: 1;
      cursor: pointer;
    }
    .timeline-bar button {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .timeline-bar button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    /* Keyboard hints */
    .keyboard-hints {
      padding: 4px 16px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-sideBar-border);
    }
    .keyboard-hints kbd {
      padding: 1px 4px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      background: var(--vscode-editorWidget-background);
      font-family: inherit;
      font-size: 10px;
    }
    /* Audio seek cursor */
    #waveformCanvas { cursor: crosshair; }
    .audio-time-indicator {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      margin-top: 4px;
    }
    /* Heatmap overlay */
    .heatmap-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }
    .heatmap-toggle input { cursor: pointer; }
    /* Timeline diff styles */
    .timeline-diff {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
    }
    .timeline-summary {
      padding: 12px 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .summary-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .summary-count {
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .count-added { background: rgba(40,167,69,0.2); color: #28a745; }
    .count-removed { background: rgba(220,53,69,0.2); color: #dc3545; }
    .count-modified { background: rgba(255,193,7,0.2); color: #ffc107; }
    .timeline-meta-changes {
      padding: 8px 16px;
      font-size: 11px;
    }
    .meta-change {
      padding: 2px 0;
      color: var(--vscode-editorWarning-foreground);
    }
    .track-list {
      flex: 1;
      overflow: auto;
      padding: 8px;
    }
    .track-change {
      margin-bottom: 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .track-change-header {
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 12px;
      background: var(--vscode-sideBar-background);
    }
    .track-change-header:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .change-badge {
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-added { background: #28a745; color: white; }
    .badge-removed { background: #dc3545; color: white; }
    .badge-modified { background: #ffc107; color: black; }
    .track-type-badge {
      padding: 1px 4px;
      border-radius: 2px;
      font-size: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .track-elements {
      padding: 4px 12px 8px;
    }
    .element-change {
      padding: 4px 8px;
      margin: 2px 0;
      border-radius: 3px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: default;
    }
    .element-change.has-media { cursor: pointer; }
    .element-change.has-media:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .element-added { border-left: 3px solid #28a745; }
    .element-removed { border-left: 3px solid #dc3545; }
    .element-modified { border-left: 3px solid #ffc107; }
    .element-props {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-left: 16px;
      padding: 2px 0;
    }
    .prop-change {
      padding: 1px 0;
    }
    .prop-old { color: #dc3545; text-decoration: line-through; }
    .prop-new { color: #28a745; }
    .element-thumbnail {
      width: 48px;
      height: 36px;
      object-fit: cover;
      border-radius: 2px;
      border: 1px solid var(--vscode-panel-border);
    }
    .thumbnail-placeholder {
      width: 48px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-editorWidget-background);
      border-radius: 2px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="diff-header">
      <span class="diff-title" id="diffTitle">${displayTitle}</span>
      ${!isLocalComparison ? `<select class="ref-select" id="refSelect" title="Compare against version">
        <option value="HEAD" selected>HEAD</option>
      </select>` : ''}
      <span class="similarity-badge" id="similarity">${l10n.loading}</span>
      <select class="view-mode-select" id="viewMode">
        <option value="side-by-side">${l10n.viewMode.sideBySide}</option>
        <option value="slider">${l10n.viewMode.slider}</option>
        <option value="overlay">${l10n.viewMode.overlay}</option>
        ${mediaType === 'image' ? `<option value="onion-skin">${l10n.viewMode.onionSkin}</option>` : ''}
        ${mediaType === 'image' ? `<option value="heatmap">Heatmap</option>` : ''}
      </select>
    </div>
    <div class="diff-content" id="content">
      <div class="loading">
        <div class="loading-spinner"></div>
        <div>${l10n.analyzing}</div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}">
    window.vscodeApi = acquireVsCodeApi();
    window.initialState = ${initialState};
  </script>
  <script type="module" nonce="${nonce}">
    // Inline diff viewer script for simplicity
    // In production, this would be loaded from mediaDiff.js

    const vscode = window.vscodeApi;
    const state = window.initialState;

    let currentData = null;
    let viewMode = state.viewMode;

    // Video diff state
    let videoFrames = { current: null, previous: null };
    let videoDuration = 0;
    let videoCurrentTime = 0;
    let videoSeeking = false;

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;

      switch (message.type) {
        case 'mediaDiff:progress':
          updateProgress(message.payload);
          break;
        case 'mediaDiff:result':
          handleDiffResult(message.payload);
          break;
        case 'mediaDiff:imageData':
          handleImageData(message.payload);
          break;
        case 'mediaDiff:waveformData':
          handleWaveformData(message.payload);
          break;
        case 'mediaDiff:frameData':
          handleFrameData(message.payload);
          break;
        case 'mediaDiff:elementThumbnail':
          handleElementThumbnail(message.payload);
          break;
        case 'mediaDiff:fileHistory':
          handleFileHistory(message.payload);
          break;
        case 'mediaDiff:error':
          showError(message.error);
          break;
      }
    });

    // Current ref being compared against
    let currentRef = 'HEAD';

    // Ref select change handler (only for Git comparison mode)
    const refSelect = document.getElementById('refSelect');
    if (refSelect) {
      refSelect.addEventListener('change', (e) => {
        const ref = e.target.value;
        if (ref === currentRef) return;
        currentRef = ref;

        // Update title
        const titleEl = document.getElementById('diffTitle');
        if (titleEl) {
          const shortRef = ref === 'HEAD' ? 'HEAD' : ref.substring(0, 7);
          titleEl.textContent = state.fileName + ' (' + shortRef + ' \\u2194 Working)';
        }

        // Reset state and re-run diff
        currentData = null;
        videoFrames = { current: null, previous: null };

        vscode.postMessage({
          type: 'mediaDiff:changeRef',
          requestId: Date.now().toString(),
          timestamp: Date.now(),
          payload: { ref: ref }
        });
      });
    }

    function handleFileHistory(payload) {
      const select = document.getElementById('refSelect');
      if (!select || !payload.commits) return;

      // Keep HEAD as first option, add commits
      select.innerHTML = '<option value="HEAD">HEAD (latest)</option>';
      for (var i = 0; i < payload.commits.length; i++) {
        var c = payload.commits[i];
        var opt = document.createElement('option');
        opt.value = c.hash;
        // Format: "abc1234 - commit message (2024-01-15)"
        var dateStr = c.date ? c.date.substring(0, 10) : '';
        opt.textContent = c.shortHash + ' - ' + c.subject.substring(0, 50) + (c.subject.length > 50 ? '...' : '') + ' (' + dateStr + ')';
        select.appendChild(opt);
      }
    }

    // View mode change
    document.getElementById('viewMode').addEventListener('change', (e) => {
      viewMode = e.target.value;
      vscode.postMessage({
        type: 'mediaDiff:setViewMode',
        requestId: Date.now().toString(),
        timestamp: Date.now(),
        payload: { mode: viewMode }
      });
      if (currentData) {
        render();
      }
    });

    function updateProgress(payload) {
      const content = document.getElementById('content');
      content.innerHTML = \`
        <div class="loading">
          <div class="loading-spinner"></div>
          <div>\${payload.stage} (\${payload.progress}%)</div>
        </div>
      \`;
    }

    function handleDiffResult(payload) {
      currentData = payload;
      updateSimilarityBadge(payload.similarity);
      // Always render — for audio/video, show metadata immediately;
      // visualization data (waveform/frames) will trigger re-render when it arrives
      render();
    }

    function handleImageData(payload) {
      if (!currentData) currentData = { mediaType: 'image', similarity: 0, details: {} };
      currentData.images = payload;
      render();
    }

    function handleWaveformData(payload) {
      if (!currentData) currentData = { mediaType: 'audio', similarity: 0, details: {} };
      currentData.waveforms = payload;
      render();
    }

    function handleFrameData(payload) {
      const { time, version, imageBuffer } = payload;
      if (!currentData) currentData = { mediaType: 'video', similarity: 0, details: {} };

      // Store frame data
      const blob = new Blob([new Uint8Array(imageBuffer.data || imageBuffer)]);
      const url = URL.createObjectURL(blob);

      if (version === 'current') {
        if (videoFrames.current) URL.revokeObjectURL(videoFrames.current);
        videoFrames.current = url;
      } else {
        if (videoFrames.previous) URL.revokeObjectURL(videoFrames.previous);
        videoFrames.previous = url;
      }

      videoCurrentTime = time;
      videoSeeking = false;

      // Update canvas if already rendered, otherwise full render
      const currentCanvas = document.getElementById('videoCurrentCanvas');
      const previousCanvas = document.getElementById('videoPreviousCanvas');
      if (currentCanvas && previousCanvas) {
        updateVideoCanvases();
      } else {
        render();
      }
    }

    function handleElementThumbnail(payload) {
      if (!payload || !payload.src || !payload.imageBuffer) return;
      var src = payload.src;
      var buf = payload.imageBuffer;
      var blob = new Blob([new Uint8Array(buf.data || buf)]);
      var url = URL.createObjectURL(blob);

      // Find all thumbnail placeholders that match this element src
      var placeholders = document.querySelectorAll('.thumbnail-placeholder');
      for (var i = 0; i < placeholders.length; i++) {
        var el = placeholders[i];
        // Match by checking the closest element-change container's data-src
        var container = el.closest('.element-change');
        if (!container) continue;
        var srcAttr = container.getAttribute('data-src');
        if (srcAttr === src) {
          var img = document.createElement('img');
          img.src = url;
          img.className = 'element-thumbnail';
          img.style.maxWidth = '120px';
          img.style.maxHeight = '80px';
          img.style.borderRadius = '4px';
          el.replaceWith(img);
        }
      }
    }

    function updateSimilarityBadge(similarity) {
      const badge = document.getElementById('similarity');
      const percent = (similarity * 100).toFixed(1);
      badge.textContent = percent + '% ' + state.l10n.similar;
      badge.className = 'similarity-badge ' + (
        similarity >= 0.9 ? 'similarity-high' :
        similarity >= 0.5 ? 'similarity-medium' : 'similarity-low'
      );
    }

    function showError(message) {
      const content = document.getElementById('content');
      content.innerHTML = \`<div class="error">\${message}</div>\`;
    }

    function render() {
      if (!currentData) return;

      const content = document.getElementById('content');
      var mt = currentData.mediaType || state.mediaType;

      switch (mt) {
        case 'timeline':
          renderTimelineDiff(content, currentData);
          break;
        case 'image':
          if (currentData.images) {
            if (viewMode === 'heatmap') {
              renderHeatmapDiff(content, currentData);
            } else {
              renderImageDiff(content, currentData);
            }
          } else {
            renderMetadataOnly(content, currentData);
          }
          break;
        case 'audio':
          if (currentData.waveforms) {
            renderAudioDiff(content, currentData);
          } else {
            renderMetadataOnly(content, currentData);
          }
          break;
        case 'video':
          renderVideoDiff(content, currentData);
          break;
        default:
          renderMetadataOnly(content, currentData);
          break;
      }
    }

    /**
     * Render metadata-only view when visualization data is not (yet) available
     */
    function renderMetadataOnly(container, data) {
      var details = data.details || {};
      var html = '<div style="padding: 24px; max-width: 600px; margin: 0 auto;">';

      html += '<div style="text-align:center; margin-bottom:16px; color:var(--vscode-descriptionForeground);">'
        + 'Diff analysis complete — visualization data unavailable'
        + '</div>';

      html += '<div class="metadata">';

      // Similarity
      html += '<div class="metadata-row"><span>Similarity:</span><span>'
        + (data.similarity * 100).toFixed(1) + '%</span></div>';

      // Duration (audio/video)
      if (details.duration) {
        html += '<div class="metadata-row"><span>' + state.l10n.metadata.duration + ':</span>'
          + '<span class="' + (details.duration.current !== details.duration.previous ? 'metadata-changed' : '') + '">'
          + (details.duration.previous != null ? details.duration.previous.toFixed(2) + 's' : 'N/A')
          + ' → '
          + (details.duration.current != null ? details.duration.current.toFixed(2) + 's' : 'N/A')
          + '</span></div>';
      }

      // Sample rate (audio)
      if (details.sampleRate) {
        html += '<div class="metadata-row"><span>Sample Rate:</span>'
          + '<span class="' + (details.sampleRate.current !== details.sampleRate.previous ? 'metadata-changed' : '') + '">'
          + details.sampleRate.previous + ' Hz → ' + details.sampleRate.current + ' Hz</span></div>';
      }

      // Channels (audio)
      if (details.channels) {
        html += '<div class="metadata-row"><span>Channels:</span>'
          + '<span class="' + (details.channels.current !== details.channels.previous ? 'metadata-changed' : '') + '">'
          + details.channels.previous + ' → ' + details.channels.current + '</span></div>';
      }

      // Waveform similarity (audio)
      if (details.waveformSimilarity != null) {
        html += '<div class="metadata-row"><span>' + state.l10n.metadata.waveformSimilarity + ':</span>'
          + '<span>' + (details.waveformSimilarity * 100).toFixed(1) + '%</span></div>';
      }

      // Resolution (video)
      if (details.resolution) {
        html += '<div class="metadata-row"><span>Resolution:</span>'
          + '<span class="' + (details.resolution.current.width !== details.resolution.previous.width ? 'metadata-changed' : '') + '">'
          + details.resolution.previous.width + 'x' + details.resolution.previous.height
          + ' → ' + details.resolution.current.width + 'x' + details.resolution.current.height
          + '</span></div>';
      }

      // FPS (video)
      if (details.fps) {
        html += '<div class="metadata-row"><span>FPS:</span>'
          + '<span class="' + (details.fps.current !== details.fps.previous ? 'metadata-changed' : '') + '">'
          + details.fps.previous + ' → ' + details.fps.current + '</span></div>';
      }

      // Codec (video)
      if (details.codec) {
        html += '<div class="metadata-row"><span>Codec:</span>'
          + '<span class="' + (details.codec.current !== details.codec.previous ? 'metadata-changed' : '') + '">'
          + details.codec.previous + ' → ' + details.codec.current + '</span></div>';
      }

      // Dimensions (image)
      if (details.dimensions) {
        html += '<div class="metadata-row"><span>' + state.l10n.metadata.size + ':</span>'
          + '<span class="' + (details.dimensions.current.width !== details.dimensions.previous.width ? 'metadata-changed' : '') + '">'
          + details.dimensions.previous.width + 'x' + details.dimensions.previous.height
          + ' → ' + details.dimensions.current.width + 'x' + details.dimensions.current.height
          + '</span></div>';
      }

      html += '</div></div>';
      container.innerHTML = html;
    }

    function renderImageDiff(container, data) {
      const { images, details } = data;
      const currentUrl = URL.createObjectURL(new Blob([images.currentImage]));
      const previousUrl = URL.createObjectURL(new Blob([images.previousImage]));

      // Use appropriate labels based on comparison mode
      const previousLabel = state.isLocalComparison
        ? state.previousFileName || state.l10n.panel.previous
        : state.l10n.panel.previousHead;
      const currentLabel = state.isLocalComparison
        ? state.fileName || state.l10n.panel.current
        : state.l10n.panel.currentWorking;

      if (viewMode === 'side-by-side') {
        container.innerHTML = \`
          <div class="side-by-side">
            <div class="panel">
              <div class="panel-header">\${previousLabel}</div>
              <div class="panel-content">
                <img src="\${previousUrl}" alt="Previous version">
              </div>
              \${renderImageMetadata(details?.dimensions?.previous)}
            </div>
            <div class="panel">
              <div class="panel-header">\${currentLabel}</div>
              <div class="panel-content">
                <img src="\${currentUrl}" alt="Current version">
              </div>
              \${renderImageMetadata(details?.dimensions?.current)}
            </div>
          </div>
        \`;
      } else if (viewMode === 'slider') {
        container.innerHTML = \`
          <div class="slider-container">
            <div class="slider-wrapper" id="sliderWrapper">
              <img src="\${currentUrl}" alt="Current version" class="slider-img" id="sliderBase">
              <div class="slider-clip" id="sliderClip">
                <img src="\${previousUrl}" alt="Previous version" id="sliderPrevImg">
              </div>
              <div class="slider-divider" id="sliderDivider">
                <div class="slider-handle"></div>
              </div>
              <span class="slider-label slider-label-left">\${previousLabel}</span>
              <span class="slider-label slider-label-right">\${currentLabel}</span>
            </div>
          </div>
        \`;
        // Initialize slider after DOM update
        setTimeout(() => initSlider(), 50);
      } else if (viewMode === 'overlay') {
        container.innerHTML = \`
          <div class="overlay-container">
            <div class="overlay-wrapper">
              <img src="\${previousUrl}" alt="Previous version">
              <img src="\${currentUrl}" alt="Current version" class="overlay-current" id="overlayImg" style="opacity: 0.5;">
            </div>
            <div class="overlay-controls">
              <span>\${previousLabel}</span>
              <input type="range" min="0" max="100" value="50" class="overlay-slider" id="overlaySlider">
              <span>\${currentLabel}</span>
            </div>
          </div>
        \`;
        // Initialize overlay slider
        setTimeout(() => {
          const slider = document.getElementById('overlaySlider');
          const img = document.getElementById('overlayImg');
          if (slider && img) {
            slider.addEventListener('input', (e) => {
              img.style.opacity = e.target.value / 100;
            });
          }
        }, 0);
      } else if (viewMode === 'onion-skin') {
        container.innerHTML = \`
          <div class="overlay-container">
            <div class="overlay-wrapper">
              <img src="\${previousUrl}" alt="Previous version" style="opacity: 0.5;">
              <img src="\${currentUrl}" alt="Current version" class="overlay-current" id="onionImg" style="opacity: 0.5;">
            </div>
            <div class="overlay-controls">
              <span>\${previousLabel}</span>
              <input type="range" min="0" max="100" value="50" class="overlay-slider" id="onionSlider">
              <span>\${currentLabel}</span>
            </div>
          </div>
        \`;
        // Initialize onion skin slider
        setTimeout(() => {
          const slider = document.getElementById('onionSlider');
          const img = document.getElementById('onionImg');
          const prevImg = document.querySelector('.overlay-wrapper > img:first-child');
          if (slider && img && prevImg) {
            slider.addEventListener('input', (e) => {
              const val = e.target.value / 100;
              img.style.opacity = val;
              prevImg.style.opacity = 1 - val;
            });
          }
        }, 0);
      } else {
        // Fallback to side-by-side
        container.innerHTML = \`
          <div class="side-by-side">
            <div class="panel">
              <div class="panel-header">\${previousLabel}</div>
              <div class="panel-content"><img src="\${previousUrl}"></div>
            </div>
            <div class="panel">
              <div class="panel-header">\${currentLabel}</div>
              <div class="panel-content"><img src="\${currentUrl}"></div>
            </div>
          </div>
        \`;
      }
    }

    // Slider drag functionality
    function initSlider() {
      const wrapper = document.getElementById('sliderWrapper');
      const divider = document.getElementById('sliderDivider');
      const clip = document.getElementById('sliderClip');
      const baseImg = document.getElementById('sliderBase');
      const prevImg = document.getElementById('sliderPrevImg');

      if (!wrapper || !divider || !clip || !baseImg || !prevImg) return;

      function setupSlider() {
        // Make previous image exactly the same size as base image
        const width = baseImg.offsetWidth;
        const height = baseImg.offsetHeight;

        prevImg.style.width = width + 'px';
        prevImg.style.height = height + 'px';

        // Initial position at 50%
        updateSliderPosition(50);
      }

      function updateSliderPosition(percent) {
        clip.style.width = percent + '%';
        divider.style.left = percent + '%';
      }

      // Wait for base image to load
      if (baseImg.complete && baseImg.naturalWidth > 0) {
        setupSlider();
      } else {
        baseImg.onload = setupSlider;
      }

      // Also setup when previous image loads (to ensure sync)
      prevImg.onload = () => {
        if (baseImg.complete && baseImg.naturalWidth > 0) {
          prevImg.style.width = baseImg.offsetWidth + 'px';
          prevImg.style.height = baseImg.offsetHeight + 'px';
        }
      };

      let isDragging = false;

      const startDrag = (e) => {
        isDragging = true;
        e.preventDefault();
      };

      const doDrag = (e) => {
        if (!isDragging) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const rect = baseImg.getBoundingClientRect();
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));

        const percent = (x / rect.width) * 100;
        updateSliderPosition(percent);
      };

      const endDrag = () => {
        isDragging = false;
      };

      // Mouse events
      divider.addEventListener('mousedown', startDrag);
      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', endDrag);

      // Touch events
      divider.addEventListener('touchstart', startDrag);
      document.addEventListener('touchmove', doDrag);
      document.addEventListener('touchend', endDrag);
    }

    function renderImageMetadata(dim) {
      if (!dim) return '';
      return \`<div class="metadata">
        <div class="metadata-row"><span>\${state.l10n.metadata.size}:</span><span>\${dim.width}x\${dim.height}</span></div>
      </div>\`;
    }

    function renderAudioDiff(container, data) {
      const { waveforms, details } = data;
      const dur = details?.duration?.current || details?.duration?.previous || 0;
      videoDuration = dur;

      container.innerHTML = \`
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column;">
          <div style="flex:1; display:flex; align-items:center; justify-content:center;">
            <canvas id="waveformCanvas" style="width: 100%; height: 200px;"></canvas>
          </div>
          <div class="audio-time-indicator" id="audioTimeIndicator">Click waveform to seek</div>
          <div class="metadata" style="margin-top: 8px;">
            <div class="metadata-row">
              <span>\${state.l10n.metadata.duration}:</span>
              <span class="\${details?.duration?.current !== details?.duration?.previous ? 'metadata-changed' : ''}">\${details?.duration?.previous?.toFixed(2)}s → \${details?.duration?.current?.toFixed(2)}s</span>
            </div>
            <div class="metadata-row">
              <span>\${state.l10n.metadata.waveformSimilarity}:</span>
              <span>\${(details?.waveformSimilarity * 100)?.toFixed(1)}%</span>
            </div>
          </div>
          <div class="keyboard-hints">
            <kbd>←</kbd> / <kbd>→</kbd> seek ±0.1s &nbsp;
            <kbd>Shift+←</kbd> / <kbd>Shift+→</kbd> seek ±1s &nbsp;
            Click waveform to seek to position
          </div>
        </div>
      \`;

      // Draw waveforms and attach seek handler
      // Use requestAnimationFrame to ensure canvas has layout dimensions
      requestAnimationFrame(() => {
        const canvas = document.getElementById('waveformCanvas');
        if (canvas) {
          // If canvas has no dimensions yet, wait for next frame
          if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
            requestAnimationFrame(() => {
              drawWaveforms(canvas, waveforms.currentWaveform, waveforms.previousWaveform);
              initAudioSeek(canvas, dur);
            });
          } else {
            drawWaveforms(canvas, waveforms.currentWaveform, waveforms.previousWaveform);
            initAudioSeek(canvas, dur);
          }
        }
      });
    }

    function drawWaveforms(canvas, current, previous) {
      const ctx = canvas.getContext('2d');
      // Use devicePixelRatio for crisp rendering on HiDPI displays
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      // Skip if canvas has no layout dimensions
      if (width === 0 || height === 0) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const centerY = height / 2;

      // Draw center line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
      ctx.lineWidth = 1;
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Helper: draw mirrored waveform (positive above center, negative below)
      function drawMirroredWaveform(data, color, fillColor) {
        if (!data || data.length === 0) return;
        var len = data.length;

        // Fill area
        ctx.beginPath();
        ctx.fillStyle = fillColor;
        for (var i = 0; i < len; i++) {
          var x = (i / len) * width;
          var amp = Math.abs(data[i]) * centerY * 0.9;
          if (i === 0) {
            ctx.moveTo(x, centerY - amp);
          } else {
            ctx.lineTo(x, centerY - amp);
          }
        }
        // Return along bottom (mirrored)
        for (var j = len - 1; j >= 0; j--) {
          var x2 = (j / len) * width;
          var amp2 = Math.abs(data[j]) * centerY * 0.9;
          ctx.lineTo(x2, centerY + amp2);
        }
        ctx.closePath();
        ctx.fill();

        // Stroke top edge
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        for (var k = 0; k < len; k++) {
          var x3 = (k / len) * width;
          var y3 = centerY - Math.abs(data[k]) * centerY * 0.9;
          k === 0 ? ctx.moveTo(x3, y3) : ctx.lineTo(x3, y3);
        }
        ctx.stroke();
      }

      // Draw previous (red, behind)
      drawMirroredWaveform(previous, 'rgba(255, 100, 100, 0.8)', 'rgba(255, 100, 100, 0.15)');
      // Draw current (blue, in front)
      drawMirroredWaveform(current, 'rgba(100, 150, 255, 0.8)', 'rgba(100, 150, 255, 0.15)');

      // Draw seek cursor line if audio has time info
      if (typeof videoCurrentTime === 'number' && videoDuration > 0) {
        const xPos = (videoCurrentTime / videoDuration) * width;
        ctx.beginPath();
        ctx.strokeStyle = 'var(--vscode-button-background, #007acc)';
        ctx.lineWidth = 2;
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, height);
        ctx.stroke();
      }
    }

    // =========================================================================
    // Video Diff Rendering
    // =========================================================================

    function renderVideoDiff(container, data) {
      const previousLabel = state.isLocalComparison
        ? state.previousFileName || state.l10n.panel.previous
        : state.l10n.panel.previousHead;
      const currentLabel = state.isLocalComparison
        ? state.fileName || state.l10n.panel.current
        : state.l10n.panel.currentWorking;

      const dur = Math.max(data.details?.duration?.current || 0, data.details?.duration?.previous || 0);
      videoDuration = dur;

      container.innerHTML = '<div class="video-diff-container">'
        + '<div class="video-frames">'
        + '<div class="video-panel">'
        + '<div class="video-panel-header">' + previousLabel + '</div>'
        + '<div class="video-panel-content">'
        + '<canvas id="videoPreviousCanvas"></canvas>'
        + '<span class="placeholder" id="prevPlaceholder">Waiting for frame...</span>'
        + '</div></div>'
        + '<div class="video-panel">'
        + '<div class="video-panel-header">' + currentLabel + '</div>'
        + '<div class="video-panel-content">'
        + '<canvas id="videoCurrentCanvas"></canvas>'
        + '<span class="placeholder" id="currPlaceholder">Waiting for frame...</span>'
        + '</div></div></div>'
        + '<div class="timeline-bar">'
        + '<button id="btnPrevFrame" title="Previous frame">&#9664;</button>'
        + '<span class="time-display" id="timeDisplay">' + formatTime(videoCurrentTime) + ' / ' + formatTime(videoDuration) + '</span>'
        + '<input type="range" id="timelineScrubber" min="0" max="' + Math.floor(dur * 1000) + '" value="' + Math.floor(videoCurrentTime * 1000) + '" step="33">'
        + '<button id="btnNextFrame" title="Next frame">&#9654;</button>'
        + '</div>'
        + '<div class="keyboard-hints">'
        + '<kbd>&larr;</kbd> / <kbd>&rarr;</kbd> seek &plusmn;1 frame &nbsp;'
        + '<kbd>Shift+&larr;</kbd> / <kbd>Shift+&rarr;</kbd> seek &plusmn;1s &nbsp;'
        + '<kbd>Home</kbd> / <kbd>End</kbd> start / end'
        + '</div></div>';

      setTimeout(() => {
        updateVideoCanvases();
        initTimelineControls();
      }, 0);
    }

    function updateVideoCanvases() {
      drawFrameToCanvas('videoCurrentCanvas', videoFrames.current, 'currPlaceholder');
      drawFrameToCanvas('videoPreviousCanvas', videoFrames.previous, 'prevPlaceholder');

      // Update time display
      const display = document.getElementById('timeDisplay');
      if (display) {
        display.textContent = formatTime(videoCurrentTime) + ' / ' + formatTime(videoDuration);
      }
      const scrubber = document.getElementById('timelineScrubber');
      if (scrubber && !videoSeeking) {
        scrubber.value = Math.floor(videoCurrentTime * 1000);
      }
    }

    function drawFrameToCanvas(canvasId, frameUrl, placeholderId) {
      const canvas = document.getElementById(canvasId);
      const placeholder = document.getElementById(placeholderId);
      if (!canvas) return;

      if (!frameUrl) {
        canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
        return;
      }

      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.style.display = '';
        if (placeholder) placeholder.style.display = 'none';
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
      };
      img.src = frameUrl;
    }

    function initTimelineControls() {
      const scrubber = document.getElementById('timelineScrubber');
      const btnPrev = document.getElementById('btnPrevFrame');
      const btnNext = document.getElementById('btnNextFrame');

      if (scrubber) {
        scrubber.addEventListener('input', (e) => {
          videoSeeking = true;
          const time = parseInt(e.target.value, 10) / 1000;
          seekToTime(time);
        });
      }

      if (btnPrev) {
        btnPrev.addEventListener('click', () => seekRelative(-1 / 30));
      }
      if (btnNext) {
        btnNext.addEventListener('click', () => seekRelative(1 / 30));
      }
    }

    function seekToTime(time) {
      time = Math.max(0, Math.min(time, videoDuration));
      videoCurrentTime = time;

      // Update display immediately
      const display = document.getElementById('timeDisplay');
      if (display) {
        display.textContent = formatTime(time) + ' / ' + formatTime(videoDuration);
      }

      vscode.postMessage({
        type: 'mediaDiff:seek',
        requestId: Date.now().toString(),
        timestamp: Date.now(),
        payload: { time }
      });
    }

    function seekRelative(delta) {
      seekToTime(videoCurrentTime + delta);
    }

    function formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return '0:00.000';
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + ':' + s.toFixed(3).padStart(6, '0');
    }

    // =========================================================================
    // Heatmap Diff Rendering (image only)
    // =========================================================================

    function renderHeatmapDiff(container, data) {
      const { images } = data;
      const currentUrl = URL.createObjectURL(new Blob([images.currentImage]));
      const previousUrl = URL.createObjectURL(new Blob([images.previousImage]));

      container.innerHTML = '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;gap:8px;">'
        + '<canvas id="heatmapCanvas" style="max-width:90%;max-height:80%;object-fit:contain;"></canvas>'
        + '<div style="font-size:11px;color:var(--vscode-descriptionForeground);">'
        + 'Red = high difference, Blue = low difference'
        + '</div></div>';

      setTimeout(() => {
        generateHeatmap(previousUrl, currentUrl);
      }, 0);
    }

    function generateHeatmap(prevUrl, currUrl) {
      const canvas = document.getElementById('heatmapCanvas');
      if (!canvas) return;

      const prevImg = new Image();
      const currImg = new Image();
      let loaded = 0;

      function onBothLoaded() {
        loaded++;
        if (loaded < 2) return;

        const w = Math.max(prevImg.naturalWidth, currImg.naturalWidth);
        const h = Math.max(prevImg.naturalHeight, currImg.naturalHeight);
        canvas.width = w;
        canvas.height = h;

        // Draw both to offscreen canvases
        const offPrev = new OffscreenCanvas(w, h);
        const offCurr = new OffscreenCanvas(w, h);
        offPrev.getContext('2d').drawImage(prevImg, 0, 0, w, h);
        offCurr.getContext('2d').drawImage(currImg, 0, 0, w, h);

        const prevData = offPrev.getContext('2d').getImageData(0, 0, w, h).data;
        const currData = offCurr.getContext('2d').getImageData(0, 0, w, h).data;

        // Compute per-pixel difference heatmap
        const ctx = canvas.getContext('2d');
        const output = ctx.createImageData(w, h);
        for (let i = 0; i < prevData.length; i += 4) {
          const dr = Math.abs(prevData[i] - currData[i]);
          const dg = Math.abs(prevData[i + 1] - currData[i + 1]);
          const db = Math.abs(prevData[i + 2] - currData[i + 2]);
          const diff = (dr + dg + db) / (3 * 255); // 0..1

          // Blue (low diff) → Red (high diff)
          output.data[i] = Math.floor(diff * 255);
          output.data[i + 1] = 0;
          output.data[i + 2] = Math.floor((1 - diff) * 255);
          output.data[i + 3] = Math.max(40, Math.floor(diff * 255));
        }
        ctx.putImageData(output, 0, 0);
      }

      prevImg.onload = onBothLoaded;
      currImg.onload = onBothLoaded;
      prevImg.src = prevUrl;
      currImg.src = currUrl;
    }

    // =========================================================================
    // Audio Seek Interaction
    // =========================================================================

    function initAudioSeek(canvas, duration) {
      if (!canvas || !duration) return;

      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        const time = ratio * duration;

        videoDuration = duration;
        videoCurrentTime = time;

        // Redraw waveforms with seek line
        if (currentData && currentData.waveforms) {
          drawWaveforms(canvas, currentData.waveforms.currentWaveform, currentData.waveforms.previousWaveform);
        }

        // Update time indicator
        const indicator = document.getElementById('audioTimeIndicator');
        if (indicator) {
          indicator.textContent = formatTime(time) + ' / ' + formatTime(duration);
        }

        // Send seek to extension for potential audio playback
        vscode.postMessage({
          type: 'mediaDiff:seek',
          requestId: Date.now().toString(),
          timestamp: Date.now(),
          payload: { time }
        });
      });
    }

    // =========================================================================
    // Keyboard Shortcuts
    // =========================================================================

    document.addEventListener('keydown', (e) => {
      // Only handle when we have video/audio content
      if (state.mediaType !== 'video' && state.mediaType !== 'audio') return;

      const FRAME_STEP = 1 / 30; // ~33ms per frame
      const SECOND_STEP = 1;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          seekRelative(e.shiftKey ? -SECOND_STEP : -FRAME_STEP);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(e.shiftKey ? SECOND_STEP : FRAME_STEP);
          break;
        case 'Home':
          e.preventDefault();
          seekToTime(0);
          break;
        case 'End':
          e.preventDefault();
          seekToTime(videoDuration);
          break;
      }
    });

    // =========================================================================
    // Timeline Diff Rendering
    // =========================================================================

    function renderTimelineDiff(container, data) {
      const details = data.details;
      if (!details || !details.trackChanges) {
        container.innerHTML = '<div>' + state.l10n.waitingForData + '</div>';
        return;
      }

      const s = details.summary;
      const proj = details.project;

      // Build meta changes
      var metaHtml = '';
      if (proj.name.current !== proj.name.previous) {
        metaHtml += '<div class="meta-change">Name: ' + escHtml(proj.name.previous) + ' &rarr; ' + escHtml(proj.name.current) + '</div>';
      }
      if (proj.fps.current !== proj.fps.previous) {
        metaHtml += '<div class="meta-change">FPS: ' + proj.fps.previous + ' &rarr; ' + proj.fps.current + '</div>';
      }
      if (proj.resolution.current.width !== proj.resolution.previous.width
        || proj.resolution.current.height !== proj.resolution.previous.height) {
        metaHtml += '<div class="meta-change">Resolution: '
          + proj.resolution.previous.width + 'x' + proj.resolution.previous.height
          + ' &rarr; '
          + proj.resolution.current.width + 'x' + proj.resolution.current.height
          + '</div>';
      }
      if (details.duration.current !== details.duration.previous) {
        metaHtml += '<div class="meta-change">Duration: '
          + details.duration.previous.toFixed(2) + 's &rarr; '
          + details.duration.current.toFixed(2) + 's</div>';
      }

      // Build track changes
      var tracksHtml = '';
      for (var ti = 0; ti < details.trackChanges.length; ti++) {
        var tc = details.trackChanges[ti];
        var badgeClass = tc.changeType === 'added' ? 'badge-added'
          : tc.changeType === 'removed' ? 'badge-removed' : 'badge-modified';

        tracksHtml += '<div class="track-change">'
          + '<div class="track-change-header" onclick="this.parentElement.classList.toggle(&quot;collapsed&quot;)">'
          + '<span class="change-badge ' + badgeClass + '">' + tc.changeType + '</span>'
          + '<span class="track-type-badge">' + escHtml(tc.trackType) + '</span>'
          + '<span>' + escHtml(tc.trackName) + '</span>'
          + '</div>';

        // Track property changes
        if (tc.propertyChanges && tc.propertyChanges.length > 0) {
          tracksHtml += '<div class="element-props">';
          for (var pi = 0; pi < tc.propertyChanges.length; pi++) {
            var pc = tc.propertyChanges[pi];
            tracksHtml += '<div class="prop-change">'
              + escHtml(pc.property) + ': '
              + '<span class="prop-old">' + escHtml(String(pc.previous)) + '</span>'
              + ' &rarr; '
              + '<span class="prop-new">' + escHtml(String(pc.current)) + '</span>'
              + '</div>';
          }
          tracksHtml += '</div>';
        }

        // Element changes
        if (tc.elementChanges && tc.elementChanges.length > 0) {
          tracksHtml += '<div class="track-elements">';
          for (var ei = 0; ei < tc.elementChanges.length; ei++) {
            var ec = tc.elementChanges[ei];
            var elClass = ec.changeType === 'added' ? 'element-added'
              : ec.changeType === 'removed' ? 'element-removed' : 'element-modified';
            var hasMedia = ec.src || ec.previousSrc;
            var mediaClass = hasMedia ? ' has-media' : '';
            var dataAttr = hasMedia ? ' data-src="' + escHtml(ec.src || '') + '"' : '';

            tracksHtml += '<div class="element-change ' + elClass + mediaClass + '"' + dataAttr + '>';

            // Thumbnail placeholder for media elements
            if (hasMedia) {
              tracksHtml += '<div class="thumbnail-placeholder" data-element-id="' + escHtml(ec.elementId) + '">&#9654;</div>';
            }

            tracksHtml += '<span>' + escHtml(ec.elementName) + '</span>'
              + '<span style="color:var(--vscode-descriptionForeground);font-size:10px;">'
              + escHtml(ec.elementType)
              + (ec.startTime !== undefined ? ' @ ' + ec.startTime.toFixed(2) + 's' : '')
              + (ec.duration !== undefined ? ' (' + ec.duration.toFixed(2) + 's)' : '')
              + '</span>'
              + '</div>';

            // Property changes for modified elements
            if (ec.propertyChanges && ec.propertyChanges.length > 0) {
              tracksHtml += '<div class="element-props">';
              for (var epi = 0; epi < ec.propertyChanges.length; epi++) {
                var epc = ec.propertyChanges[epi];
                var prevStr = typeof epc.previous === 'object' ? JSON.stringify(epc.previous) : String(epc.previous);
                var currStr = typeof epc.current === 'object' ? JSON.stringify(epc.current) : String(epc.current);
                tracksHtml += '<div class="prop-change">'
                  + escHtml(epc.property) + ': '
                  + '<span class="prop-old">' + escHtml(prevStr) + '</span>'
                  + ' &rarr; '
                  + '<span class="prop-new">' + escHtml(currStr) + '</span>'
                  + '</div>';
              }
              tracksHtml += '</div>';
            }
          }
          tracksHtml += '</div>';
        }

        tracksHtml += '</div>';
      }

      // No changes case
      if (details.trackChanges.length === 0 && !metaHtml) {
        tracksHtml = '<div style="text-align:center;padding:32px;color:var(--vscode-descriptionForeground);">No structural changes detected</div>';
      }

      container.innerHTML = '<div class="timeline-diff">'
        + '<div class="timeline-summary">'
        + (s.tracksAdded > 0 ? '<div class="summary-item"><span class="summary-count count-added">+' + s.tracksAdded + '</span> tracks added</div>' : '')
        + (s.tracksRemoved > 0 ? '<div class="summary-item"><span class="summary-count count-removed">-' + s.tracksRemoved + '</span> tracks removed</div>' : '')
        + (s.tracksModified > 0 ? '<div class="summary-item"><span class="summary-count count-modified">~' + s.tracksModified + '</span> tracks modified</div>' : '')
        + (s.elementsAdded > 0 ? '<div class="summary-item"><span class="summary-count count-added">+' + s.elementsAdded + '</span> elements added</div>' : '')
        + (s.elementsRemoved > 0 ? '<div class="summary-item"><span class="summary-count count-removed">-' + s.elementsRemoved + '</span> elements removed</div>' : '')
        + (s.elementsModified > 0 ? '<div class="summary-item"><span class="summary-count count-modified">~' + s.elementsModified + '</span> elements modified</div>' : '')
        + (s.mediaSourceChanges > 0 ? '<div class="summary-item"><span class="summary-count count-modified">' + s.mediaSourceChanges + '</span> media sources changed</div>' : '')
        + '</div>'
        + (metaHtml ? '<div class="timeline-meta-changes">' + metaHtml + '</div>' : '')
        + '<div class="track-list">' + tracksHtml + '</div>'
        + '</div>';

      // Attach click handlers for media elements (lazy content diff)
      setTimeout(function() {
        var mediaElements = document.querySelectorAll('.element-change.has-media');
        mediaElements.forEach(function(el) {
          el.addEventListener('click', function() {
            var src = el.getAttribute('data-src');
            if (src) {
              vscode.postMessage({
                type: 'mediaDiff:inspectElement',
                requestId: Date.now().toString(),
                timestamp: Date.now(),
                payload: { src: src }
              });
            }
          });
        });
      }, 0);
    }

    function escHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Request initial diff based on comparison mode
    if (state.requiresRecompare) {
      // Show error message for untracked files that lost comparison state
      showError(state.l10n.requiresRecompare);
    } else if (state.isLocalComparison) {
      vscode.postMessage({
        type: 'mediaDiff:initLocal',
        requestId: Date.now().toString(),
        timestamp: Date.now(),
        payload: { currentUri: '', previousUri: '' }
      });
    } else {
      vscode.postMessage({
        type: 'mediaDiff:init',
        requestId: Date.now().toString(),
        timestamp: Date.now(),
        payload: { fileUri: '', ref: 'HEAD' }
      });
      // Request file history for version selector
      vscode.postMessage({
        type: 'mediaDiff:getFileHistory',
        requestId: Date.now().toString(),
        timestamp: Date.now(),
        payload: { maxCount: 30 }
      });
    }
  </script>
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
