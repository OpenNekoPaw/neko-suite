/**
 * AssetVariantDiffEditorProvider - Asset Variant Diff Custom Editor
 *
 * Provides a custom editor for viewing asset variant differences.
 * Similar to MediaDiffEditorProvider but specialized for comparing
 * two variants of the same asset entity.
 *
 * Features:
 * - Side-by-side variant comparison
 * - Attribute difference highlighting
 * - Media file diff integration
 * - AI analysis support
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { AssetEntity, AssetVariant, VariantComparisonResult } from '@uniedit/shared';
import { AssetVariantDiffMessageHandler } from './AssetVariantDiffMessageHandler';

// Storage key for persisting comparison state
const COMPARISON_STATE_KEY = 'assetVariantDiff.comparisonState';

// Comparison state structure
interface ComparisonState {
	entityId: string;
	variantIdA: string;
	variantIdB: string;
}

// =============================================================================
// Virtual Document Provider
// =============================================================================

/**
 * Virtual file system for asset variant diff documents
 */
export class AssetVariantDiffFileSystemProvider implements vscode.FileSystemProvider {
	private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile = this._emitter.event;

	watch(): vscode.Disposable {
		return { dispose: () => {} };
	}

	stat(): vscode.FileStat {
		return {
			type: vscode.FileType.File,
			ctime: Date.now(),
			mtime: Date.now(),
			size: 0,
		};
	}

	readDirectory(): [string, vscode.FileType][] {
		return [];
	}

	createDirectory(): void {}

	readFile(): Uint8Array {
		// Return empty content - the actual data is fetched via messages
		return new Uint8Array();
	}

	writeFile(): void {}

	delete(): void {}

	rename(): void {}
}

// =============================================================================
// Provider Implementation
// =============================================================================

/**
 * Custom editor provider for asset variant diff visualization
 */
export class AssetVariantDiffEditorProvider implements vscode.CustomReadonlyEditorProvider {
	public static readonly viewType = 'uniedit.assetVariantDiff';
	public static readonly scheme = 'asset-variant-diff';

	private activeWebviews: Map<string, vscode.WebviewPanel> = new Map();
	/** Map from document URI to comparison state */
	private comparisonStates: Map<string, ComparisonState> = new Map();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly getEntity: (id: string) => Promise<AssetEntity | null>,
		private readonly compareVariants?: (
			entityId: string,
			variantIdA: string,
			variantIdB: string
		) => Promise<VariantComparisonResult>
	) {
		// Restore persisted comparison states
		this.restoreComparisonStates();
	}

	/**
	 * Restore comparison states from workspace state
	 */
	private restoreComparisonStates(): void {
		const stored = this.context.workspaceState.get<Record<string, ComparisonState>>(COMPARISON_STATE_KEY);
		if (stored) {
			for (const [uri, state] of Object.entries(stored)) {
				this.comparisonStates.set(uri, state);
			}
		}
	}

	/**
	 * Persist comparison states to workspace state
	 */
	private persistComparisonStates(): void {
		const toStore: Record<string, ComparisonState> = {};
		for (const [uri, state] of this.comparisonStates.entries()) {
			toStore[uri] = state;
		}
		this.context.workspaceState.update(COMPARISON_STATE_KEY, toStore);
	}

	/**
	 * Set up comparison state for a document
	 */
	setComparisonState(documentUri: vscode.Uri, state: ComparisonState): void {
		this.comparisonStates.set(documentUri.toString(), state);
		this.persistComparisonStates();
	}

	/**
	 * Clear comparison state for a document
	 */
	clearComparisonState(documentUri: vscode.Uri): void {
		this.comparisonStates.delete(documentUri.toString());
		this.persistComparisonStates();
	}

	/**
	 * Create a URI for comparing two variants
	 */
	static createCompareUri(entityId: string, variantIdA: string, variantIdB: string): vscode.Uri {
		return vscode.Uri.parse(
			`${AssetVariantDiffEditorProvider.scheme}:/${entityId}/${variantIdA}-vs-${variantIdB}.asset-diff`
		);
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

		// Get comparison state
		const state = this.comparisonStates.get(docUri);
		if (!state) {
			webviewPanel.webview.html = this.getErrorHtml('Comparison state not found');
			return;
		}

		// Load entity and variants
		const entity = await this.getEntity(state.entityId);
		if (!entity) {
			webviewPanel.webview.html = this.getErrorHtml(`Entity not found: ${state.entityId}`);
			return;
		}

		const variantA = entity.variants.find((v) => v.id === state.variantIdA);
		const variantB = entity.variants.find((v) => v.id === state.variantIdB);

		if (!variantA || !variantB) {
			webviewPanel.webview.html = this.getErrorHtml('One or both variants not found');
			return;
		}

		// Set panel title
		webviewPanel.title = `${variantA.name} ↔ ${variantB.name}`;

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
			entity,
			variantA,
			variantB
		);

		// Create message handler
		const messageHandler = new AssetVariantDiffMessageHandler(
			webviewPanel.webview,
			entity,
			variantA,
			variantB,
			this.compareVariants
		);

		// Handle messages from webview
		webviewPanel.webview.onDidReceiveMessage(
			async (message) => {
				await messageHandler.handleMessage(message);
			},
			undefined,
			this.context.subscriptions
		);

		// Cleanup on dispose
		webviewPanel.onDidDispose(() => {
			this.activeWebviews.delete(docUri);
			messageHandler.dispose();
		});

		// Initialize diff analysis
		messageHandler.initializeDiff();
	}

	/**
	 * Get error HTML
	 */
	private getErrorHtml(message: string): string {
		return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: var(--vscode-editor-background);
      color: var(--vscode-errorForeground);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>
  <div>${message}</div>
</body>
</html>`;
	}

	/**
	 * Get HTML content for webview
	 */
	private getHtmlForWebview(
		webview: vscode.Webview,
		entity: AssetEntity,
		variantA: AssetVariant,
		variantB: AssetVariant
	): string {
		const nonce = getNonce();
		const locale = vscode.env.language || 'en';

		// Get thumbnail URIs
		const fileA = variantA.files[0];
		const fileB = variantB.files[0];

		const imageUriA = fileA
			? webview.asWebviewUri(vscode.Uri.file(fileA.path))
			: null;
		const imageUriB = fileB
			? webview.asWebviewUri(vscode.Uri.file(fileB.path))
			: null;

		// Localized strings for the webview
		const l10n = {
			loading: vscode.l10n.t('assetDiff.loading'),
			analyzing: vscode.l10n.t('assetDiff.analyzing'),
			similar: vscode.l10n.t('assetDiff.similar'),
			attributes: vscode.l10n.t('assetDiff.attributes'),
			noChanges: vscode.l10n.t('assetDiff.noChanges'),
			viewMode: {
				sideBySide: vscode.l10n.t('assetDiff.viewMode.sideBySide'),
				slider: vscode.l10n.t('assetDiff.viewMode.slider'),
				overlay: vscode.l10n.t('assetDiff.viewMode.overlay'),
			},
			tabs: {
				media: vscode.l10n.t('assetDiff.tabs.media'),
				attributes: vscode.l10n.t('assetDiff.tabs.attributes'),
				ai: vscode.l10n.t('assetDiff.tabs.ai'),
			},
			aiAnalysis: vscode.l10n.t('assetDiff.aiAnalysis'),
			requestAI: vscode.l10n.t('assetDiff.requestAI'),
			noFile: vscode.l10n.t('assetDiff.noFile'),
		};

		// Generate initial state
		const initialState = JSON.stringify({
			entity: {
				id: entity.id,
				name: entity.name,
				category: entity.category,
			},
			variantA: {
				id: variantA.id,
				name: variantA.name,
				attributes: variantA.attributes,
				fileCount: variantA.files.length,
				hasImage: !!imageUriA,
				fileName: fileA?.name ?? null,
				filePath: fileA?.path ?? null,
			},
			variantB: {
				id: variantB.id,
				name: variantB.name,
				attributes: variantB.attributes,
				fileCount: variantB.files.length,
				hasImage: !!imageUriB,
				fileName: fileB?.name ?? null,
				filePath: fileB?.path ?? null,
			},
			imageUriA: imageUriA?.toString() ?? null,
			imageUriB: imageUriB?.toString() ?? null,
			l10n,
		});

		return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} data: blob: https: file:; font-src ${webview.cspSource}; connect-src ${webview.cspSource} https: data: blob:;">
  <title>Asset Variant Diff</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, monospace);
    }
    * {
      box-sizing: border-box;
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
      padding: 12px 16px;
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
    .entity-name {
      font-size: 14px;
      color: var(--vscode-foreground);
    }
    .variant-names {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .similarity-badge {
      padding: 4px 12px;
      border-radius: 12px;
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
      font-size: 12px;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-sideBar-background);
    }
    .tab {
      padding: 8px 16px;
      font-size: 12px;
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .tab:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .tab.active {
      color: var(--vscode-textLink-foreground);
      border-bottom-color: var(--vscode-textLink-foreground);
    }
    .tab-badge {
      margin-left: 6px;
      padding: 2px 6px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 8px;
      font-size: 10px;
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
      min-width: 0;
    }
    .panel-header {
      padding: 8px 12px;
      background: var(--vscode-sideBar-background);
      text-align: center;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .panel-header-name {
      font-size: 12px;
      font-weight: 500;
    }
    .panel-header-file {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .panel-content {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: auto;
      padding: 8px;
      background: var(--vscode-editor-background);
    }
    .panel-content img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .no-image {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    /* Attributes tab */
    .attributes-container {
      width: 100%;
      max-width: 800px;
      padding: 16px;
    }
    .attribute-table {
      width: 100%;
      border-collapse: collapse;
    }
    .attribute-table th,
    .attribute-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
    }
    .attribute-table th {
      background: var(--vscode-sideBar-background);
      font-weight: 500;
    }
    .attribute-changed {
      color: var(--vscode-editorWarning-foreground);
    }
    .attribute-added {
      color: var(--vscode-testing-iconPassed);
    }
    .attribute-removed {
      color: var(--vscode-testing-iconFailed);
      text-decoration: line-through;
    }
    .no-changes {
      text-align: center;
      color: var(--vscode-descriptionForeground);
      padding: 32px;
    }
    /* AI tab */
    .ai-container {
      width: 100%;
      max-width: 600px;
      padding: 16px;
      text-align: center;
    }
    .ai-summary {
      text-align: left;
      padding: 16px;
      background: var(--vscode-editorWidget-background);
      border-radius: 4px;
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.5;
    }
    .ai-button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    .ai-button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .ai-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    /* Slider mode */
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
    /* Overlay mode */
    .overlay-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      width: 100%;
      height: 100%;
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
      font-size: 12px;
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
      <div class="diff-title">
        <div class="entity-name" id="entityName"></div>
        <div class="variant-names" id="variantNames"></div>
      </div>
      <span class="similarity-badge" id="similarity">${l10n.loading}</span>
      <select class="view-mode-select" id="viewMode">
        <option value="side-by-side">${l10n.viewMode.sideBySide}</option>
        <option value="slider">${l10n.viewMode.slider}</option>
        <option value="overlay">${l10n.viewMode.overlay}</option>
      </select>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="media">${l10n.tabs.media}</button>
      <button class="tab" data-tab="attributes">${l10n.tabs.attributes}<span class="tab-badge" id="attrBadge">0</span></button>
      <button class="tab" data-tab="ai">🤖 ${l10n.tabs.ai}</button>
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
  <script nonce="${nonce}">
    const vscode = window.vscodeApi;
    const state = window.initialState;

    let currentData = null;
    let viewMode = 'side-by-side';
    let activeTab = 'media';
    let attributeDiffs = [];
    let aiSummary = null;
    let aiLoading = false;

    // Initialize UI
    document.getElementById('entityName').textContent = state.entity.name;
    document.getElementById('variantNames').textContent =
      state.variantA.name + ' ↔ ' + state.variantB.name;

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        activeTab = e.target.dataset.tab;
        render();
      });
    });

    // View mode change
    document.getElementById('viewMode').addEventListener('change', (e) => {
      viewMode = e.target.value;
      render();
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;

      switch (message.type) {
        case 'assetDiff:result':
          handleDiffResult(message.payload);
          break;
        case 'assetDiff:attributeDiffs':
          handleAttributeDiffs(message.payload);
          break;
        case 'assetDiff:aiSummary':
          handleAISummary(message.payload);
          break;
        case 'assetDiff:aiLoading':
          aiLoading = message.payload;
          if (activeTab === 'ai') render();
          break;
        case 'assetDiff:error':
          showError(message.error);
          break;
      }
    });

    function handleDiffResult(payload) {
      currentData = payload;
      updateSimilarityBadge(payload.similarity);
      render();
    }

    function handleAttributeDiffs(payload) {
      attributeDiffs = payload;
      document.getElementById('attrBadge').textContent = payload.length;
      if (activeTab === 'attributes') render();
    }

    function handleAISummary(payload) {
      aiSummary = payload;
      aiLoading = false;
      if (activeTab === 'ai') render();
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
      content.innerHTML = '<div style="color: var(--vscode-errorForeground);">' + message + '</div>';
    }

    function render() {
      const content = document.getElementById('content');

      if (activeTab === 'media') {
        renderMediaTab(content);
      } else if (activeTab === 'attributes') {
        renderAttributesTab(content);
      } else if (activeTab === 'ai') {
        renderAITab(content);
      }
    }

    function renderMediaTab(container) {
      const hasImageA = state.imageUriA;
      const hasImageB = state.imageUriB;

      if (!hasImageA && !hasImageB) {
        container.innerHTML = '<div class="no-image">' + state.l10n.noFile + '</div>';
        return;
      }

      if (viewMode === 'side-by-side') {
        container.innerHTML = \`
          <div class="side-by-side">
            <div class="panel">
              <div class="panel-header">
                <div class="panel-header-name">\${state.variantA.name}</div>
                \${state.variantA.fileName ? '<div class="panel-header-file">' + state.variantA.fileName + '</div>' : ''}
              </div>
              <div class="panel-content">
                \${hasImageA
                  ? '<img src="' + state.imageUriA + '" alt="Variant A">'
                  : '<span class="no-image">' + state.l10n.noFile + '</span>'
                }
              </div>
            </div>
            <div class="panel">
              <div class="panel-header">
                <div class="panel-header-name">\${state.variantB.name}</div>
                \${state.variantB.fileName ? '<div class="panel-header-file">' + state.variantB.fileName + '</div>' : ''}
              </div>
              <div class="panel-content">
                \${hasImageB
                  ? '<img src="' + state.imageUriB + '" alt="Variant B">'
                  : '<span class="no-image">' + state.l10n.noFile + '</span>'
                }
              </div>
            </div>
          </div>
        \`;
      } else if (viewMode === 'slider' && hasImageA && hasImageB) {
        const labelA = state.variantA.fileName || state.variantA.name;
        const labelB = state.variantB.fileName || state.variantB.name;
        container.innerHTML = \`
          <div class="slider-container">
            <div class="slider-wrapper" id="sliderWrapper">
              <img src="\${state.imageUriB}" alt="Variant B" class="slider-img" id="sliderBase">
              <div class="slider-clip" id="sliderClip">
                <img src="\${state.imageUriA}" alt="Variant A" id="sliderPrevImg">
              </div>
              <div class="slider-divider" id="sliderDivider">
                <div class="slider-handle"></div>
              </div>
              <span class="slider-label slider-label-left">\${labelA}</span>
              <span class="slider-label slider-label-right">\${labelB}</span>
            </div>
          </div>
        \`;
        setTimeout(() => initSlider(), 50);
      } else if (viewMode === 'overlay' && hasImageA && hasImageB) {
        const labelA = state.variantA.fileName || state.variantA.name;
        const labelB = state.variantB.fileName || state.variantB.name;
        container.innerHTML = \`
          <div class="overlay-container">
            <div class="overlay-wrapper">
              <img src="\${state.imageUriA}" alt="Variant A">
              <img src="\${state.imageUriB}" alt="Variant B" class="overlay-current" id="overlayImg" style="opacity: 0.5;">
            </div>
            <div class="overlay-controls">
              <span title="\${state.variantA.name}">\${labelA}</span>
              <input type="range" min="0" max="100" value="50" class="overlay-slider" id="overlaySlider">
              <span title="\${state.variantB.name}">\${labelB}</span>
            </div>
          </div>
        \`;
        setTimeout(() => {
          const slider = document.getElementById('overlaySlider');
          const img = document.getElementById('overlayImg');
          if (slider && img) {
            slider.addEventListener('input', (e) => {
              img.style.opacity = e.target.value / 100;
            });
          }
        }, 0);
      } else {
        // Fallback to side-by-side
        viewMode = 'side-by-side';
        document.getElementById('viewMode').value = 'side-by-side';
        renderMediaTab(container);
      }
    }

    function initSlider() {
      const wrapper = document.getElementById('sliderWrapper');
      const divider = document.getElementById('sliderDivider');
      const clip = document.getElementById('sliderClip');
      const baseImg = document.getElementById('sliderBase');
      const prevImg = document.getElementById('sliderPrevImg');

      if (!wrapper || !divider || !clip || !baseImg || !prevImg) return;

      function setupSlider() {
        const width = baseImg.offsetWidth;
        const height = baseImg.offsetHeight;
        prevImg.style.width = width + 'px';
        prevImg.style.height = height + 'px';
        updateSliderPosition(50);
      }

      function updateSliderPosition(percent) {
        clip.style.width = percent + '%';
        divider.style.left = percent + '%';
      }

      if (baseImg.complete && baseImg.naturalWidth > 0) {
        setupSlider();
      } else {
        baseImg.onload = setupSlider;
      }

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

      const endDrag = () => { isDragging = false; };

      divider.addEventListener('mousedown', startDrag);
      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', endDrag);
      divider.addEventListener('touchstart', startDrag);
      document.addEventListener('touchmove', doDrag);
      document.addEventListener('touchend', endDrag);
    }

    function renderAttributesTab(container) {
      if (attributeDiffs.length === 0) {
        container.innerHTML = '<div class="no-changes">' + state.l10n.noChanges + '</div>';
        return;
      }

      const rows = attributeDiffs.map(diff => {
        const valueA = diff.valueA ?? '-';
        const valueB = diff.valueB ?? '-';
        const classA = !diff.valueA ? 'attribute-removed' : '';
        const classB = !diff.valueB ? 'attribute-added' : diff.valueA !== diff.valueB ? 'attribute-changed' : '';
        return \`
          <tr>
            <td>\${diff.attribute}</td>
            <td class="\${classA}">\${valueA}</td>
            <td class="\${classB}">\${valueB}</td>
          </tr>
        \`;
      }).join('');

      container.innerHTML = \`
        <div class="attributes-container">
          <table class="attribute-table">
            <thead>
              <tr>
                <th>\${state.l10n.attributes}</th>
                <th>\${state.variantA.name}</th>
                <th>\${state.variantB.name}</th>
              </tr>
            </thead>
            <tbody>
              \${rows}
            </tbody>
          </table>
        </div>
      \`;
    }

    function renderAITab(container) {
      if (aiLoading) {
        container.innerHTML = \`
          <div class="ai-container">
            <div class="loading">
              <div class="loading-spinner"></div>
              <div>\${state.l10n.analyzing}</div>
            </div>
          </div>
        \`;
      } else if (aiSummary) {
        container.innerHTML = \`
          <div class="ai-container">
            <div class="ai-summary">\${aiSummary}</div>
          </div>
        \`;
      } else {
        container.innerHTML = \`
          <div class="ai-container">
            <p style="color: var(--vscode-descriptionForeground); margin-bottom: 16px;">\${state.l10n.aiAnalysis}</p>
            <button class="ai-button" id="requestAI">\${state.l10n.requestAI}</button>
          </div>
        \`;
        document.getElementById('requestAI').addEventListener('click', () => {
          vscode.postMessage({
            type: 'assetDiff:requestAI',
            requestId: Date.now().toString(),
            timestamp: Date.now()
          });
        });
      }
    }

    // Request initial diff
    vscode.postMessage({
      type: 'assetDiff:init',
      requestId: Date.now().toString(),
      timestamp: Date.now()
    });
  </script>
</body>
</html>`;
	}

	dispose(): void {
		this.activeWebviews.clear();
		this.comparisonStates.clear();
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
