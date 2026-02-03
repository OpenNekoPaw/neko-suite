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
	public static readonly viewType = 'uniedit.mediaDiff';

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
    .view-mode-select {
      padding: 4px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
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
  </style>
</head>
<body>
  <div id="root">
    <div class="diff-header">
      <span class="diff-title">${displayTitle}</span>
      <span class="similarity-badge" id="similarity">${l10n.loading}</span>
      <select class="view-mode-select" id="viewMode">
        <option value="side-by-side">${l10n.viewMode.sideBySide}</option>
        <option value="slider">${l10n.viewMode.slider}</option>
        <option value="overlay">${l10n.viewMode.overlay}</option>
        ${mediaType === 'image' ? `<option value="onion-skin">${l10n.viewMode.onionSkin}</option>` : ''}
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
        case 'mediaDiff:error':
          showError(message.error);
          break;
      }
    });

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

      if (currentData.images) {
        renderImageDiff(content, currentData);
      } else if (currentData.waveforms) {
        renderAudioDiff(content, currentData);
      } else {
        content.innerHTML = '<div>' + state.l10n.waitingForData + '</div>';
      }
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

      container.innerHTML = \`
        <div style="width: 100%; height: 100%;">
          <canvas id="waveformCanvas" style="width: 100%; height: 200px;"></canvas>
          <div class="metadata" style="margin-top: 16px;">
            <div class="metadata-row">
              <span>\${state.l10n.metadata.duration}:</span>
              <span class="\${details?.duration?.current !== details?.duration?.previous ? 'metadata-changed' : ''}">\${details?.duration?.previous?.toFixed(2)}s → \${details?.duration?.current?.toFixed(2)}s</span>
            </div>
            <div class="metadata-row">
              <span>\${state.l10n.metadata.waveformSimilarity}:</span>
              <span>\${(details?.waveformSimilarity * 100)?.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      \`;

      // Draw waveforms
      setTimeout(() => {
        const canvas = document.getElementById('waveformCanvas');
        if (canvas) {
          drawWaveforms(canvas, waveforms.currentWaveform, waveforms.previousWaveform);
        }
      }, 0);
    }

    function drawWaveforms(canvas, current, previous) {
      const ctx = canvas.getContext('2d');
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;

      const centerY = height / 2;

      // Draw previous (red)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
      ctx.lineWidth = 1;
      previous.forEach((v, i) => {
        const x = (i / previous.length) * width;
        const y = centerY - v * centerY * 0.9;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw current (blue)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(100, 150, 255, 0.7)';
      current.forEach((v, i) => {
        const x = (i / current.length) * width;
        const y = centerY - v * centerY * 0.9;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
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
