import * as vscode from 'vscode';
import {
  createCanvasPlaybackPlan,
  createNarrativeRelativePathAssetRef,
  isNarrativeAssetRef,
  isResourceRef,
  NARRATIVE_RUNTIME_NODE_TYPES,
  normalizeNarrativePreviewFeatureToggles,
  type CanvasPlaybackPlan,
  type CanvasConnection,
  type CanvasData,
  type CanvasNode,
  type CanvasSerializableRecord,
  type CanvasSerializableValue,
  type CanvasToPreviewMessage,
  type NarrativeAssetRef,
  type NarrativeConnectionSnapshot,
  type NarrativeEndingMetadata,
  type NarrativeGraphSnapshot,
  type NarrativeMetadata,
  type NarrativeNodeSnapshot,
  type NarrativePreviewFeatureToggles,
  type NarrativeRuntimeNodeType,
  type NarrativeSceneMetadata,
  type PreviewToCanvasMessage,
  type StoryGenre,
  type VariableEffect,
} from '@neko/shared';
import { getLogger } from '../utils/logger';
import { handleError } from '../utils/errorHandler';

const logger = getLogger('NarrativePreviewBridge');

const NARRATIVE_RUNTIME_NODE_TYPE_SET: ReadonlySet<string> = new Set(NARRATIVE_RUNTIME_NODE_TYPES);

const NARRATIVE_RUNTIME_CONNECTION_TYPES = new Set<string | undefined>([
  undefined,
  'default',
  'choice',
]);

export interface NarrativeCanvasSnapshotHost {
  extractNarrativeGraphSnapshot(): NarrativeGraphSnapshot | undefined;
  extractCanvasPlaybackPlan?(): CanvasPlaybackPlan | undefined;
  postNarrativePreviewCanvasMessage(message: PreviewToCanvasMessage): boolean;
}

export interface NarrativePreviewBridgeOptions {
  readonly panelFactory?: NarrativePreviewPanelFactory;
  readonly getFeatureToggles?: () => NarrativePreviewFeatureToggles;
  readonly now?: () => number;
}

export interface NarrativePreviewPanelFactory {
  createWebviewPanel(
    viewType: string,
    title: string,
    showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
    options?: vscode.WebviewPanelOptions & vscode.WebviewOptions,
  ): vscode.WebviewPanel;
}

export class NarrativePreviewBridge implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private disposed = false;
  private lastAcceptedPreviewRevision = 0;
  private previewWebviewReady = false;
  private pendingPreviewMessages: CanvasToPreviewMessage[] = [];
  private requestSequence = 0;
  private readonly panelFactory: NarrativePreviewPanelFactory;
  private readonly getFeatureToggles: () => NarrativePreviewFeatureToggles;
  private readonly now: () => number;

  constructor(
    private readonly host: NarrativeCanvasSnapshotHost,
    private readonly options: NarrativePreviewBridgeOptions,
  ) {
    this.panelFactory = options.panelFactory ?? vscode.window;
    this.getFeatureToggles =
      options.getFeatureToggles ?? (() => normalizeNarrativePreviewFeatureToggles(undefined));
    this.now = options.now ?? Date.now;
  }

  open(): boolean {
    if (!this.getFeatureToggles().preview) {
      void handleError(new Error('Narrative Preview is disabled by configuration.'), {
        showToUser: true,
        severity: 'warning',
      });
      return false;
    }

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) {
      void handleError(new Error('No active Canvas narrative graph is available.'), {
        showToUser: true,
        severity: 'warning',
      });
      return false;
    }

    const panel = this.ensurePanel();
    this.postFeatureToggles(snapshot.revision);
    const plan = this.host.extractCanvasPlaybackPlan?.();
    this.postToPreview({
      type: 'preview:loadGraph',
      requestId: this.createRequestId('load'),
      snapshot,
      revision: snapshot.revision,
    });
    if (plan) {
      this.postToPreview({
        type: 'preview:loadPlaybackPlan',
        requestId: this.createRequestId('load-plan'),
        plan,
        revision: snapshot.revision,
      });
    }
    return true;
  }

  refresh(): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    if (!this.panel) return false;
    const plan = this.host.extractCanvasPlaybackPlan?.();

    this.postFeatureToggles(snapshot.revision);
    this.postToPreview({
      type: 'preview:refresh',
      requestId: this.createRequestId('refresh'),
      snapshot,
      revision: snapshot.revision,
    });
    if (plan) {
      this.postToPreview({
        type: 'preview:refreshPlaybackPlan',
        requestId: this.createRequestId('refresh-plan'),
        plan,
        revision: snapshot.revision,
      });
    }
    return true;
  }

  jumpTo(nodeId: string): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    this.ensurePanel();
    this.postFeatureToggles(snapshot.revision);
    this.postToPreview({
      type: 'preview:jumpTo',
      requestId: this.createRequestId('jump'),
      nodeId,
      revision: snapshot.revision,
    });
    return true;
  }

  setVariables(variables: Readonly<Record<string, unknown>>): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    if (!this.panel) return false;

    this.postFeatureToggles(snapshot.revision);
    this.postToPreview({
      type: 'preview:setVariables',
      requestId: this.createRequestId('variables'),
      variables,
      revision: snapshot.revision,
    });
    return true;
  }

  handlePreviewMessage(message: PreviewToCanvasMessage): boolean {
    if (this.isStalePreviewMessage(message)) {
      logger.debug('Dropped stale Preview-to-Canvas message', message);
      return false;
    }
    return this.host.postNarrativePreviewCanvasMessage(message);
  }

  dispose(): void {
    this.disposed = true;
    const panel = this.panel;
    this.panel = undefined;
    this.previewWebviewReady = false;
    this.pendingPreviewMessages = [];
    panel?.dispose();
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.disposed) {
      throw new Error('NarrativePreviewBridge has been disposed.');
    }
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
      return this.panel;
    }

    const panel = this.panelFactory.createWebviewPanel(
      'neko.canvasNarrativePreview',
      'Narrative Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    this.previewWebviewReady = false;
    this.pendingPreviewMessages = [];
    panel.webview.onDidReceiveMessage(
      (message) => {
        if (isPreviewWebviewReadyMessage(message)) {
          this.previewWebviewReady = true;
          this.flushPendingPreviewMessages();
          return;
        }
        const previewMessage = parsePreviewToCanvasMessage(message);
        if (previewMessage) {
          this.handlePreviewMessage(previewMessage);
        }
      },
      undefined,
      [],
    );
    panel.webview.html = this.getPreviewHtml(panel.webview);
    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.previewWebviewReady = false;
        this.pendingPreviewMessages = [];
      }
    });
    this.panel = panel;
    return panel;
  }

  private postToPreview(message: CanvasToPreviewMessage): void {
    const revision = readCanvasMessageRevision(message);
    if (revision !== undefined) {
      this.lastAcceptedPreviewRevision = Math.max(this.lastAcceptedPreviewRevision, revision);
    }
    const panel = this.panel;
    if (!panel) return;
    if (!this.previewWebviewReady) {
      this.pendingPreviewMessages.push(message);
    }
    panel.webview.postMessage(message);
  }

  private flushPendingPreviewMessages(): void {
    const panel = this.panel;
    if (!panel || this.pendingPreviewMessages.length === 0) return;
    const messages = this.pendingPreviewMessages;
    this.pendingPreviewMessages = [];
    for (const message of messages) {
      panel.webview.postMessage(message);
    }
  }

  private postFeatureToggles(revision: number): void {
    this.postToPreview({
      type: 'preview:setFeatureToggles',
      requestId: this.createRequestId('toggles'),
      toggles: this.getFeatureToggles(),
      revision,
    });
  }

  private isStalePreviewMessage(message: PreviewToCanvasMessage): boolean {
    const revision = readRevision(message);
    return revision !== undefined && revision < this.lastAcceptedPreviewRevision;
  }

  private createRequestId(reason: string): string {
    this.requestSequence += 1;
    return `canvas-narrative:${reason}:${this.now()}:${this.requestSequence}`;
  }

  private getPreviewHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Narrative Preview</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    main { min-height: 100vh; display: flex; flex-direction: column; padding: 18px; box-sizing: border-box; gap: 14px; }
    section { width: 100%; box-sizing: border-box; }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    h2 { margin: 10px 0 8px; font-size: 26px; font-weight: 650; }
    h3 { margin: 0 0 8px; font-size: 12px; font-weight: 650; text-transform: uppercase; color: var(--vscode-descriptionForeground); letter-spacing: 0; }
    p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    code { color: var(--vscode-textLink-foreground); }
    button { height: 30px; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 0 10px; cursor: pointer; }
    button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
    button:disabled { cursor: not-allowed; opacity: 0.45; }
    .placeholder { max-width: 720px; border: 1px solid var(--vscode-panel-border); padding: 16px; border-radius: 6px; background: var(--vscode-sideBar-background); }
    .playback-shell { display: none; min-height: calc(100vh - 36px); }
    .playback-shell[data-visible="true"] { display: flex; flex-direction: column; gap: 14px; }
    .playback-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 12px; }
    .playback-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .progress { min-width: 48px; text-align: center; color: var(--vscode-descriptionForeground); }
    .timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); gap: 4px; }
    .timeline:empty { display: none; }
    .timeline button { min-width: 0; width: 100%; height: 28px; padding: 0 6px; border-color: var(--vscode-panel-border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timeline button[data-active="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .timeline button[data-kind="shot"] { border-bottom-color: var(--vscode-charts-blue, #3794ff); }
    .timeline button[data-kind="media"] { border-bottom-color: var(--vscode-charts-green, #89d185); }
    .timeline button[data-kind="narrative"] { border-bottom-color: var(--vscode-charts-purple, #b180d7); }
    .unit-surface { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 14px; align-items: stretch; min-height: 0; }
    .unit-card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; background: var(--vscode-sideBar-background); padding: 22px; box-sizing: border-box; min-width: 0; }
    .unit-card[data-kind="shot"] { background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-charts-blue, #3794ff)); }
    .unit-card[data-kind="media"] { background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-charts-green, #89d185)); }
    .unit-card[data-kind="narrative"] { background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-charts-purple, #b180d7)); }
    .unit-kind { display: inline-flex; align-items: center; height: 22px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 0 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .unit-body { max-width: 780px; white-space: pre-wrap; color: var(--vscode-foreground); font-size: 15px; }
    .unit-panel { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .unit-meta { display: grid; gap: 6px; }
    .meta-item { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 8px; color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
    .choices { display: flex; flex-wrap: wrap; gap: 8px; }
    .choices:empty { display: none; }
    .diagnostics { display: grid; gap: 6px; }
    .diagnostics:empty { display: none; }
    .diagnostic { border-left: 3px solid var(--vscode-editorWarning-foreground); padding: 6px 8px; background: var(--vscode-inputValidation-warningBackground, transparent); color: var(--vscode-descriptionForeground); }
    @media (max-width: 760px) {
      main { padding: 12px; }
      .playback-toolbar { align-items: flex-start; flex-direction: column; }
      .unit-surface { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="placeholder" id="placeholder">
      <h1>Narrative Preview</h1>
      <p id="status">Waiting for Canvas graph...</p>
    </section>
    <section class="playback-shell" id="playback-preview" data-visible="false">
      <header class="playback-toolbar">
        <div>
          <h1 id="playback-title">Canvas Playback</h1>
          <p id="playback-summary"></p>
        </div>
        <div class="playback-controls">
          <button type="button" id="preview-previous" title="Previous">Previous</button>
          <button type="button" id="preview-play" title="Play">Play</button>
          <button type="button" id="preview-next" title="Next">Next</button>
          <span class="progress" id="preview-progress">0/0</span>
        </div>
      </header>
      <nav class="timeline" id="unit-timeline" aria-label="Playback timeline"></nav>
      <div class="unit-surface">
        <article class="unit-card" id="unit-card" data-kind="node">
          <span class="unit-kind" id="unit-kind">unit</span>
          <h2 id="unit-title">No unit selected</h2>
          <p class="unit-body" id="unit-body"></p>
        </article>
        <aside class="unit-panel" aria-label="Playback unit details">
          <section>
            <h3>Info</h3>
            <div class="unit-meta" id="unit-meta"></div>
          </section>
          <section>
            <h3>Branches</h3>
            <div class="choices" id="unit-choices"></div>
          </section>
          <section>
            <h3>Diagnostics</h3>
            <div class="diagnostics" id="unit-diagnostics"></div>
          </section>
        </aside>
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DEFAULT_TIMER_MS = 1200;
    const status = document.getElementById('status');
    const placeholder = document.getElementById('placeholder');
    const playbackPreview = document.getElementById('playback-preview');
    const playbackTitle = document.getElementById('playback-title');
    const playbackSummary = document.getElementById('playback-summary');
    const previewPrevious = document.getElementById('preview-previous');
    const previewPlay = document.getElementById('preview-play');
    const previewNext = document.getElementById('preview-next');
    const previewProgress = document.getElementById('preview-progress');
    const unitTimeline = document.getElementById('unit-timeline');
    const unitCard = document.getElementById('unit-card');
    const unitKind = document.getElementById('unit-kind');
    const unitTitle = document.getElementById('unit-title');
    const unitBody = document.getElementById('unit-body');
    const unitMeta = document.getElementById('unit-meta');
    const unitChoices = document.getElementById('unit-choices');
    const unitDiagnostics = document.getElementById('unit-diagnostics');

    let playbackPlan = null;
    let route = [];
    let activeUnitId = null;
    let timer = null;
    let isPlaying = false;

    previewPrevious.addEventListener('click', () => {
      stopPlayback();
      const index = getCurrentIndex();
      if (index > 0) {
        setActiveUnit(route[index - 1], false);
      }
    });
    previewPlay.addEventListener('click', () => {
      if (isPlaying) {
        stopPlayback();
        renderPlaybackPlan();
        return;
      }
      if (!canPreviewAutoAdvance()) {
        return;
      }
      const unit = getCurrentUnit();
      if (!unit) {
        return;
      }
      isPlaying = true;
      renderPlaybackPlan();
      scheduleNext(unit.id);
    });
    previewNext.addEventListener('click', () => {
      stopPlayback();
      const next = resolveNextStep();
      if (next) {
        route = next.route;
        setActiveUnit(next.unitId, false);
      }
    });

    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'preview:loadGraph' || message.type === 'preview:refresh') {
        const count = Array.isArray(message.snapshot?.nodes) ? message.snapshot.nodes.length : 0;
        if (count === 0 && playbackPlan) {
          return;
        }
        if (count === 0) {
          status.textContent = 'Loaded revision ' + message.revision + ' with 0 Narrative Runtime nodes. Storyboard scene/shot and generic Canvas nodes use Canvas Playback Plan preview instead of Narrative Runtime.';
        } else {
          status.textContent = 'Loaded revision ' + message.revision + ' with ' + count + ' runtime nodes.';
        }
      } else if (message.type === 'preview:loadPlaybackPlan' || message.type === 'preview:refreshPlaybackPlan') {
        const units = Array.isArray(message.plan?.units) ? message.plan.units : [];
        const diagnostics = Array.isArray(message.plan?.diagnostics) ? message.plan.diagnostics : [];
        const kinds = Array.from(new Set(units.map((unit) => unit && unit.kind).filter(Boolean))).join(', ');
        const suffix = diagnostics.length > 0 ? ' Diagnostics: ' + diagnostics.map((item) => item.message).join(' ') : '';
        status.textContent = 'Loaded Canvas playback plan (' + message.plan.adapterId + ', ' + message.plan.behaviorMode + ') with ' + units.length + ' units' + (kinds ? ' [' + kinds + ']' : '') + '.' + suffix;
        loadPlaybackPlan(message.plan);
      } else if (message.type === 'preview:jumpTo') {
        status.textContent = 'Jump request: ' + message.nodeId + ' at revision ' + message.revision + '.';
        if (playbackPlan) {
          const unit = playbackPlan.units.find((candidate) => candidate.sourceNodeId === message.nodeId || candidate.id === message.nodeId);
          if (unit) {
            stopPlayback();
            const index = route.indexOf(unit.id);
            route = index >= 0 ? route.slice(0, index + 1) : [unit.id];
            setActiveUnit(unit.id, false);
          }
        }
      }
    });

    function loadPlaybackPlan(plan) {
      stopPlayback();
      playbackPlan = plan;
      route = buildInitialRoute(plan);
      activeUnitId = route[0] || null;
      placeholder.style.display = 'none';
      playbackPreview.dataset.visible = 'true';
      renderPlaybackPlan();
      postPlaybackHighlight();
    }

    function renderPlaybackPlan() {
      const unit = getCurrentUnit();
      const index = getCurrentIndex();
      const diagnostics = Array.isArray(playbackPlan?.diagnostics) ? playbackPlan.diagnostics : [];
      playbackTitle.textContent = formatPlanTitle(playbackPlan);
      playbackSummary.textContent = playbackPlan
        ? playbackPlan.adapterId + ' / ' + playbackPlan.behaviorMode + ' / ' + playbackPlan.advancePolicy
        : 'Waiting for Canvas playback plan...';
      previewProgress.textContent = (index >= 0 ? index + 1 : 0) + '/' + route.length;
      previewPrevious.disabled = index <= 0;
      previewNext.disabled = !resolveNextStep();
      previewPlay.disabled = !unit || !canPreviewAutoAdvance() || !resolveNextStep();
      previewPlay.textContent = isPlaying ? 'Pause' : 'Play';
      unitKind.textContent = unit ? unit.kind : 'unit';
      unitCard.dataset.kind = unit ? unit.kind : 'node';
      unitTitle.textContent = unit ? formatUnitTitle(unit, index) : 'No playable unit';
      unitBody.textContent = unit ? formatUnitBody(unit) : 'This Canvas does not expose a playable unit for the selected preview surface.';
      renderTimeline();
      renderMeta(unit);
      renderChoices(unit);
      renderDiagnostics(diagnostics);
    }

    function renderTimeline() {
      unitTimeline.replaceChildren();
      if (!playbackPlan || route.length === 0) {
        return;
      }
      route.forEach((unitId, index) => {
        const unit = playbackPlan.units.find((candidate) => candidate.id === unitId);
        if (!unit) {
          return;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.kind = unit.kind;
        button.dataset.active = unit.id === activeUnitId ? 'true' : 'false';
        button.textContent = String(index + 1);
        button.title = formatUnitTitle(unit, index);
        button.addEventListener('click', () => {
          stopPlayback();
          setActiveUnit(unit.id, false);
        });
        unitTimeline.appendChild(button);
      });
    }

    function renderMeta(unit) {
      unitMeta.replaceChildren();
      if (!unit) {
        return;
      }
      appendMeta('Source node', unit.sourceNodeId);
      appendMeta('Render mode', unit.renderMode);
      appendMeta('Duration', formatDuration(unit.durationMs));
      if (unit.assetPath) {
        appendMeta('Asset', unit.assetPath);
      }
      if (unit.resourceRef) {
        appendMeta('Resource', JSON.stringify(unit.resourceRef));
      }
      const metadata = getMetadata(unit);
      if (unit.kind === 'shot') {
        appendMetaField(metadata, 'Shot', 'shotNumber');
        appendMetaField(metadata, 'Scale', 'shotScale');
        appendMetaField(metadata, 'Camera', 'cameraMovement');
        appendMetaField(metadata, 'Angle', 'cameraAngle');
        appendMetaField(metadata, 'Action', 'characterAction');
        appendMetaField(metadata, 'Dialogue', 'dialogue');
        appendMetaField(metadata, 'Voice', 'voiceOver');
        appendMetaField(metadata, 'Sound', 'soundCue');
        appendMetaField(metadata, 'Status', 'generationStatus');
        appendMetaValue('Characters', summarizeCharacters(metadata.characters));
        appendMetaValue('Media refs', summarizeCount(metadata.sourceMediaRefs, metadata.generatedMediaRefs, metadata.mediaRefs));
        appendMetaValue('Image asset', readNestedString(metadata.generatedAsset, ['path', 'assetPath', 'id']) || readString(metadata.generatedImage));
        appendMetaValue('Video asset', readNestedString(metadata.generatedVideoAsset, ['path', 'assetPath', 'id']) || readString(metadata.generatedVideo));
      } else if (unit.kind === 'scene') {
        appendMetaField(metadata, 'Scene', 'sceneNumber');
        appendMetaField(metadata, 'Location', 'location');
        appendMetaField(metadata, 'Time', 'timeOfDay');
        appendMetaField(metadata, 'Script', 'sourceScriptUri');
      } else if (unit.kind === 'media') {
        appendMetaField(metadata, 'Media type', 'mediaType');
        appendMetaField(metadata, 'Asset path', 'assetPath');
        appendMetaField(metadata, 'Duration', 'duration');
        appendMetaField(metadata, 'MIME', 'mimeType');
      } else {
        appendMetaField(metadata, 'Script', 'scriptPath');
        appendMetaField(metadata, 'Document', 'docPath');
        appendMetaField(metadata, 'Project', 'projectPath');
        appendMetaValue('Scenes', summarizeArray(metadata.scenes));
      }
    }

    function appendMeta(label, value) {
      if (value === undefined || value === null || value === '') {
        return;
      }
      const item = document.createElement('div');
      item.className = 'meta-item';
      item.textContent = label + ': ' + formatValue(value);
      unitMeta.appendChild(item);
    }

    function appendMetaField(metadata, label, field) {
      appendMeta(label, metadata[field]);
    }

    function appendMetaValue(label, value) {
      appendMeta(label, value);
    }

    function renderChoices(unit) {
      unitChoices.replaceChildren();
      if (!unit) {
        return;
      }
      const choices = getOutgoingTransitions(unit.id);
      if (choices.length <= 1) {
        return;
      }
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = formatChoiceLabel(choice);
        button.title = button.textContent;
        button.addEventListener('click', () => {
          stopPlayback();
          const sourceUnit = getCurrentUnit();
          route = appendTargetToRoute(route, getCurrentIndex(), activeUnitId, choice.targetUnitId);
          setActiveUnit(choice.targetUnitId, false);
          if (sourceUnit) {
            postMessage({
              type: 'canvas:choiceMade',
              requestId: createRequestId('choice'),
              fromNodeId: sourceUnit.sourceNodeId,
              toNodeId: getCurrentUnit()?.sourceNodeId || choice.targetUnitId,
            });
          }
        });
        unitChoices.appendChild(button);
      }
    }

    function renderDiagnostics(diagnostics) {
      unitDiagnostics.replaceChildren();
      for (const diagnostic of diagnostics) {
        const item = document.createElement('div');
        item.className = 'diagnostic';
        item.textContent = diagnostic.message || diagnostic.code;
        unitDiagnostics.appendChild(item);
      }
    }

    function setActiveUnit(unitId, keepPlaying) {
      activeUnitId = unitId;
      if (!keepPlaying) {
        isPlaying = false;
      }
      renderPlaybackPlan();
      postPlaybackHighlight();
    }

    function scheduleNext(currentUnitId) {
      clearTimer();
      timer = window.setTimeout(() => {
        timer = null;
        const next = resolveNextStep();
        if (!next) {
          isPlaying = false;
          renderPlaybackPlan();
          return;
        }
        route = next.route;
        activeUnitId = next.unitId;
        renderPlaybackPlan();
        postPlaybackHighlight();
        if (isPlaying) {
          scheduleNext(next.unitId);
        }
      }, resolveUnitDurationMs(currentUnitId));
    }

    function stopPlayback() {
      isPlaying = false;
      clearTimer();
    }

    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function getCurrentUnit() {
      if (!playbackPlan || !activeUnitId) {
        return null;
      }
      return playbackPlan.units.find((unit) => unit.id === activeUnitId) || null;
    }

    function getCurrentIndex() {
      return activeUnitId ? route.indexOf(activeUnitId) : -1;
    }

    function buildInitialRoute(plan) {
      if (!plan || !Array.isArray(plan.entryUnitIds) || plan.entryUnitIds.length === 0) {
        return [];
      }
      if (plan.behaviorMode === 'interactive') {
        return [plan.entryUnitIds[0]];
      }
      return buildDefaultRoute(plan);
    }

    function buildDefaultRoute(plan) {
      const output = [];
      const visited = new Set();
      let current = plan.entryUnitIds[0];
      while (current && !visited.has(current) && output.length <= plan.units.length) {
        output.push(current);
        visited.add(current);
        const next = getOutgoingTransitions(current)[0];
        current = next && next.targetUnitId;
      }
      return output;
    }

    function resolveNextStep() {
      if (!playbackPlan || !activeUnitId) {
        return null;
      }
      const index = getCurrentIndex();
      if (index < 0) {
        return null;
      }
      const existingNext = route[index + 1];
      if (existingNext) {
        return { unitId: existingNext, route };
      }
      const transitions = getOutgoingTransitions(activeUnitId).filter((transition) => route.indexOf(transition.targetUnitId) === -1);
      if (playbackPlan.behaviorMode === 'interactive' && transitions.length > 1) {
        return null;
      }
      const transition = transitions[0];
      if (!transition) {
        return null;
      }
      return {
        unitId: transition.targetUnitId,
        route: appendTargetToRoute(route, index, activeUnitId, transition.targetUnitId),
      };
    }

    function getOutgoingTransitions(unitId) {
      if (!playbackPlan || !Array.isArray(playbackPlan.transitions)) {
        return [];
      }
      return playbackPlan.transitions
        .filter((transition) => transition.sourceUnitId === unitId && transition.enabled !== false)
        .slice()
        .sort((left, right) => (left.priority || 0) - (right.priority || 0) || String(left.id).localeCompare(String(right.id)));
    }

    function appendTargetToRoute(inputRoute, currentIndex, currentUnitId, targetUnitId) {
      const prefix = currentIndex >= 0 ? inputRoute.slice(0, currentIndex + 1) : currentUnitId ? [currentUnitId] : [];
      const existingIndex = prefix.indexOf(targetUnitId);
      return existingIndex >= 0 ? prefix.slice(0, existingIndex + 1) : prefix.concat(targetUnitId);
    }

    function resolveUnitDurationMs(unitId) {
      const durationMs = playbackPlan?.units.find((unit) => unit.id === unitId)?.durationMs;
      return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0
        ? durationMs
        : DEFAULT_TIMER_MS;
    }

    function canPreviewAutoAdvance() {
      if (!playbackPlan) {
        return false;
      }
      if (playbackPlan.advancePolicy === 'timer') {
        return true;
      }
      if (playbackPlan.advancePolicy !== 'media-ended') {
        return false;
      }
      const unit = getCurrentUnit();
      return Boolean(unit && typeof unit.durationMs === 'number' && Number.isFinite(unit.durationMs));
    }

    function postPlaybackHighlight() {
      const unit = getCurrentUnit();
      if (!unit) {
        return;
      }
      postMessage({
        type: 'canvas:highlightNode',
        requestId: createRequestId('node'),
        nodeId: unit.sourceNodeId,
      });
      const nodeIds = route
        .map((unitId) => playbackPlan?.units.find((candidate) => candidate.id === unitId)?.sourceNodeId)
        .filter(Boolean);
      if (nodeIds.length > 0) {
        postMessage({
          type: 'canvas:highlightPath',
          requestId: createRequestId('path'),
          nodeIds,
        });
      }
    }

    function postMessage(message) {
      vscode.postMessage(message);
    }

    function createRequestId(reason) {
      return 'canvas-playback-preview:' + reason + ':' + Date.now();
    }

    function formatPlanTitle(plan) {
      if (!plan) {
        return 'Canvas Playback';
      }
      if (plan.adapterId === 'storyboard') {
        return 'Storyboard Preview';
      }
      if (plan.adapterId === 'media-sequence') {
        return 'Media Sequence Preview';
      }
      if (plan.adapterId === 'narrative') {
        return 'Narrative Playback Plan';
      }
      return 'Canvas Playback';
    }

    function formatUnitTitle(unit, index) {
      const metadata = getMetadata(unit);
      if (unit.kind === 'shot') {
        const shotNumber = metadata.shotNumber !== undefined ? String(metadata.shotNumber) : String(index + 1);
        return unit.label || 'Shot ' + shotNumber;
      }
      return (
        unit.label ||
        readFirstString(metadata, ['sceneTitle', 'scriptTitle', 'title', 'name', 'projectTitle', 'docPath', 'assetPath']) ||
        unit.kind + ' ' + (index + 1)
      );
    }

    function formatUnitBody(unit) {
      const metadata = getMetadata(unit);
      if (unit.kind === 'shot') {
        return (
          readString(metadata.visualDescription) ||
          readString(metadata.generationPrompt) ||
          readString(metadata.dialogue) ||
          'Storyboard shot playback unit. Use Canvas to edit shot content and route ordering.'
        );
      }
      if (unit.kind === 'scene') {
        const location = readString(metadata.location);
        const timeOfDay = readString(metadata.timeOfDay);
        return [readString(metadata.sceneTitle), location, timeOfDay].filter(Boolean).join(' / ') || 'Storyboard scene playback unit.';
      }
      if (unit.kind === 'media') {
        const source = unit.assetPath || readString(metadata.assetPath) || readNestedString(unit.resourceRef, ['key', 'id', 'path']);
        return source ? 'Media source: ' + source : 'Media playback unit. Runtime source will be resolved by the host.';
      }
      if (unit.kind === 'narrative') {
        return readString(metadata.content) || readString(metadata.sceneRef) || 'Narrative runtime unit. Interactive rendering remains handled by the Narrative Runtime.';
      }
      if (unit.kind === 'container') {
        return readFirstString(metadata, ['description', 'sceneTitle', 'label', 'name']) || 'Container playback unit.';
      }
      return readFirstString(metadata, ['content', 'description', 'scriptPath', 'docPath', 'modelPath', 'canvasPath', 'projectPath']) || 'Generic Canvas node playback unit.';
    }

    function formatChoiceLabel(choice) {
      if (choice.label) {
        return choice.label;
      }
      const target = playbackPlan?.units.find((unit) => unit.id === choice.targetUnitId);
      return target ? 'Continue to ' + formatUnitTitle(target, route.length) : 'Continue';
    }

    function getMetadata(unit) {
      return unit && unit.metadata && typeof unit.metadata === 'object' && !Array.isArray(unit.metadata)
        ? unit.metadata
        : {};
    }

    function readFirstString(source, fields) {
      for (const field of fields) {
        const value = readString(source[field]);
        if (value) {
          return value;
        }
      }
      return undefined;
    }

    function readString(value) {
      return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
    }

    function readNestedString(source, fields) {
      if (!source || typeof source !== 'object') {
        return undefined;
      }
      for (const field of fields) {
        const value = readString(source[field]);
        if (value) {
          return value;
        }
      }
      return undefined;
    }

    function summarizeCharacters(value) {
      if (!Array.isArray(value) || value.length === 0) {
        return undefined;
      }
      return value
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object') {
            return readString(item.characterName) || readString(item.displayName) || readString(item.characterId);
          }
          return undefined;
        })
        .filter(Boolean)
        .join(', ');
    }

    function summarizeCount() {
      let count = 0;
      for (const value of arguments) {
        if (Array.isArray(value)) {
          count += value.length;
        }
      }
      return count > 0 ? count + ' item' + (count === 1 ? '' : 's') : undefined;
    }

    function summarizeArray(value) {
      return Array.isArray(value) && value.length > 0 ? String(value.length) : undefined;
    }

    function formatDuration(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 's'
        : undefined;
    }

    function formatValue(value) {
      if (Array.isArray(value)) {
        return value.map(formatValue).join(', ');
      }
      if (value && typeof value === 'object') {
        const preferred = readNestedString(value, ['path', 'assetPath', 'scriptPath', 'docPath', 'id', 'key', 'name', 'title']);
        if (preferred) {
          return preferred;
        }
        const json = JSON.stringify(value);
        return json.length > 160 ? json.slice(0, 157) + '...' : json;
      }
      return String(value);
    }

    window.__nekoNarrativePreviewPostMessage = (message) => vscode.postMessage(message);
    postMessage({ type: 'preview:webviewReady', requestId: createRequestId('ready') });
  </script>
</body>
</html>`;
  }
}

export function createNarrativeGraphSnapshotFromCanvasData(
  canvas: CanvasData | Record<string, unknown>,
  options: {
    readonly revision: number;
    readonly sourceCanvasUri?: string;
  },
): NarrativeGraphSnapshot {
  const nodes = readCanvasNodes(canvas);
  const runtimeNodeIds = new Set(nodes.filter(isNarrativeRuntimeCanvasNode).map((node) => node.id));
  const connections = readCanvasConnections(canvas)
    .filter(
      (connection) =>
        runtimeNodeIds.has(connection.sourceId) &&
        runtimeNodeIds.has(connection.targetId) &&
        NARRATIVE_RUNTIME_CONNECTION_TYPES.has(connection.type),
    )
    .map(toNarrativeConnectionSnapshot);

  return {
    nodes: nodes.filter(isNarrativeRuntimeCanvasNode).map(toNarrativeNodeSnapshot),
    connections,
    metadata: readNarrativeMetadata(canvas),
    revision: options.revision,
    ...(options.sourceCanvasUri ? { sourceCanvasUri: options.sourceCanvasUri } : {}),
    ...readOptionalStringRecord(canvas, 'sceneContents', 'sceneContents'),
    ...readOptionalString(canvas, 'charactersYaml', 'charactersYaml'),
  };
}

export function createCanvasPlaybackPlanFromCanvasData(
  canvas: CanvasData | Record<string, unknown>,
  options: {
    readonly selectedNodeId?: string;
  } = {},
): CanvasPlaybackPlan | undefined {
  const normalized = normalizeCanvasDataForPlayback(canvas);
  if (!normalized) return undefined;
  return createCanvasPlaybackPlan({
    canvas: normalized,
    selectedNodeId: options.selectedNodeId,
    adapterId: 'auto',
  });
}

export function parsePreviewToCanvasMessage(value: unknown): PreviewToCanvasMessage | undefined {
  if (!isRecord(value) || typeof value['type'] !== 'string') return undefined;
  const requestId = typeof value['requestId'] === 'string' ? value['requestId'] : undefined;
  if (!requestId) return undefined;

  switch (value['type']) {
    case 'canvas:highlightNode': {
      const nodeId = typeof value['nodeId'] === 'string' ? value['nodeId'] : undefined;
      return nodeId ? { type: 'canvas:highlightNode', requestId, nodeId } : undefined;
    }
    case 'canvas:highlightPath': {
      const nodeIds = Array.isArray(value['nodeIds'])
        ? value['nodeIds'].filter((nodeId): nodeId is string => typeof nodeId === 'string')
        : undefined;
      return nodeIds ? { type: 'canvas:highlightPath', requestId, nodeIds } : undefined;
    }
    case 'canvas:choiceMade': {
      const fromNodeId = typeof value['fromNodeId'] === 'string' ? value['fromNodeId'] : undefined;
      const toNodeId = typeof value['toNodeId'] === 'string' ? value['toNodeId'] : undefined;
      return fromNodeId && toNodeId
        ? { type: 'canvas:choiceMade', requestId, fromNodeId, toNodeId }
        : undefined;
    }
    default:
      return undefined;
  }
}

function isPreviewWebviewReadyMessage(value: unknown): boolean {
  return isRecord(value) && value['type'] === 'preview:webviewReady';
}

function readCanvasNodes(canvas: CanvasData | Record<string, unknown>): readonly CanvasNode[] {
  const nodes = isRecord(canvas) ? canvas['nodes'] : undefined;
  return Array.isArray(nodes) ? (nodes.filter(isCanvasNodeLike) as CanvasNode[]) : [];
}

function readCanvasConnections(
  canvas: CanvasData | Record<string, unknown>,
): readonly CanvasConnection[] {
  const connections = isRecord(canvas) ? canvas['connections'] : undefined;
  return Array.isArray(connections)
    ? (connections.filter(isCanvasConnectionLike) as CanvasConnection[])
    : [];
}

function normalizeCanvasDataForPlayback(
  canvas: CanvasData | Record<string, unknown>,
): CanvasData | undefined {
  if (!isRecord(canvas)) return undefined;
  const nodes = readCanvasNodes(canvas);
  const connections = readCanvasConnections(canvas);
  if (!Array.isArray(canvas['nodes']) || !Array.isArray(canvas['connections'])) return undefined;

  return {
    version: typeof canvas['version'] === 'string' ? canvas['version'] : '2.1',
    name: typeof canvas['name'] === 'string' ? canvas['name'] : 'Untitled Canvas',
    ...(isCanvasViewportLike(canvas['viewport']) ? { viewport: canvas['viewport'] } : {}),
    nodes: [...nodes],
    connections: [...connections],
    ...(isRecord(canvas['narrative']) ? { narrative: readNarrativeMetadata(canvas) } : {}),
    ...(isPlaybackMetadataLike(canvas['playback']) ? { playback: canvas['playback'] } : {}),
  };
}

function isCanvasViewportLike(value: unknown): value is NonNullable<CanvasData['viewport']> {
  return (
    isRecord(value) &&
    isRecord(value['pan']) &&
    typeof value['pan']['x'] === 'number' &&
    typeof value['pan']['y'] === 'number' &&
    typeof value['zoom'] === 'number'
  );
}

function isPlaybackMetadataLike(value: unknown): value is NonNullable<CanvasData['playback']> {
  return isRecord(value) && value['version'] === 1;
}

function isNarrativeRuntimeCanvasNode(
  node: CanvasNode,
): node is CanvasNode & { readonly type: NarrativeRuntimeNodeType } {
  return NARRATIVE_RUNTIME_NODE_TYPE_SET.has(node.type);
}

function toNarrativeNodeSnapshot(
  node: CanvasNode & { readonly type: NarrativeRuntimeNodeType },
): NarrativeNodeSnapshot {
  const data = readSerializableRecord(node.data);
  return {
    nodeId: node.id,
    type: node.type,
    label: readNodeLabel(node),
    data,
    ...(node.type === 'narrative-scene' ? { scene: readNarrativeSceneMetadata(data) } : {}),
    ...(node.type === 'narrative-ending' ? { ending: readNarrativeEndingMetadata(data) } : {}),
  };
}

function toNarrativeConnectionSnapshot(connection: CanvasConnection): NarrativeConnectionSnapshot {
  return {
    connectionId: connection.id,
    sourceNodeId: connection.sourceId,
    targetNodeId: connection.targetId,
    type: connection.type,
    choiceText: connection.choiceText ?? connection.label,
    condition: connection.condition,
    priority: connection.priority ?? 0,
  };
}

function readNarrativeMetadata(canvas: CanvasData | Record<string, unknown>): NarrativeMetadata {
  const narrative = isRecord(canvas) && isRecord(canvas['narrative']) ? canvas['narrative'] : {};
  const variables = Array.isArray(narrative['variables'])
    ? narrative['variables'].filter(isNarrativeVariable)
    : [];
  return {
    variables,
    ...(typeof narrative['entryNodeId'] === 'string'
      ? { entryNodeId: narrative['entryNodeId'] }
      : {}),
    ...(isStoryGenreValue(narrative['genre']) ? { genre: narrative['genre'] } : {}),
    ...(typeof narrative['defaultLocale'] === 'string'
      ? { defaultLocale: narrative['defaultLocale'] }
      : {}),
  };
}

function readNarrativeSceneMetadata(data: CanvasSerializableRecord): NarrativeSceneMetadata {
  const variableEffects = readVariableEffects(data['variableEffects']);
  return {
    ...(typeof data['sceneRef'] === 'string' ? { sceneRef: data['sceneRef'] } : {}),
    ...readNarrativeAssetRefField(data, 'backgroundRef', 'backgroundRef'),
    ...readNarrativeAssetRefField(data, 'bgm', 'bgm'),
    ...(Array.isArray(data['characters'])
      ? { characters: data['characters'].filter(isStringValue) }
      : {}),
    ...(variableEffects.length > 0 ? { variableEffects } : {}),
  };
}

function readNarrativeEndingMetadata(data: CanvasSerializableRecord): NarrativeEndingMetadata {
  const endingType = data['endingType'];
  return {
    ...(isNarrativeEndingTypeValue(endingType) ? { endingType } : {}),
    ...(typeof data['endingLabel'] === 'string' ? { endingLabel: data['endingLabel'] } : {}),
    ...(typeof data['statisticsSummary'] === 'boolean'
      ? { statisticsSummary: data['statisticsSummary'] }
      : {}),
  };
}

function readNarrativeAssetRefField<TKey extends string>(
  data: CanvasSerializableRecord,
  field: string,
  outputField: TKey,
): Partial<Record<TKey, NarrativeAssetRef>> {
  const value = data[field];
  if (isNarrativeAssetRef(value)) {
    return { [outputField]: value } as unknown as Partial<Record<TKey, NarrativeAssetRef>>;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return {
      [outputField]: createNarrativeRelativePathAssetRef(value.trim()),
    } as unknown as Partial<Record<TKey, NarrativeAssetRef>>;
  }
  return {};
}

function readNodeLabel(node: CanvasNode): string | undefined {
  const data = isRecord(node.data) ? (node.data as Record<string, unknown>) : {};
  const value =
    data['label'] ??
    data['title'] ??
    data['name'] ??
    data['endingLabel'] ??
    data['scriptTitle'] ??
    data['sceneTitle'];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readSerializableRecord(value: unknown): CanvasSerializableRecord {
  return isRecord(value) ? copySerializableRecord(value) : {};
}

function copySerializableRecord(value: Record<string, unknown>): CanvasSerializableRecord {
  const result: Record<string, CanvasSerializableValue> = {};
  for (const [key, field] of Object.entries(value)) {
    const copied = copySerializableValue(field);
    if (copied !== undefined) {
      result[key] = copied;
    }
  }
  return result;
}

function copySerializableValue(value: unknown): CanvasSerializableValue | undefined {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value
      .map(copySerializableValue)
      .filter((item): item is CanvasSerializableValue => item !== undefined);
    return values;
  }
  if (isResourceRef(value)) {
    return value as unknown as CanvasSerializableRecord;
  }
  if (isRecord(value)) {
    return copySerializableRecord(value);
  }
  return undefined;
}

function readOptionalStringRecord<TField extends string>(
  canvas: CanvasData | Record<string, unknown>,
  inputField: string,
  outputField: TField,
): Partial<Record<TField, Readonly<Record<string, string>>>> {
  if (!isRecord(canvas) || !isRecord(canvas[inputField])) return {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(canvas[inputField])) {
    if (typeof value === 'string') {
      values[key] = value;
    }
  }
  return { [outputField]: values } as Partial<Record<TField, Readonly<Record<string, string>>>>;
}

function readOptionalString<TField extends string>(
  canvas: CanvasData | Record<string, unknown>,
  inputField: string,
  outputField: TField,
): Partial<Record<TField, string>> {
  const value = isRecord(canvas) ? canvas[inputField] : undefined;
  return typeof value === 'string'
    ? ({ [outputField]: value } as Partial<Record<TField, string>>)
    : {};
}

function isCanvasNodeLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['type'] === 'string' &&
    isRecord(value['data'])
  );
}

function isCanvasConnectionLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sourceId'] === 'string' &&
    typeof value['targetId'] === 'string'
  );
}

function isNarrativeVariable(value: unknown): value is NarrativeMetadata['variables'][number] {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    copySerializableValue(value['value']) !== undefined
  );
}

function readVariableEffects(value: unknown): readonly VariableEffect[] {
  if (!Array.isArray(value)) return [];
  const effects: VariableEffect[] = [];
  for (const item of value) {
    if (
      isRecord(item) &&
      typeof item['variableId'] === 'string' &&
      isVariableEffectOperation(item['operation'])
    ) {
      effects.push({
        variableId: item['variableId'],
        operation: item['operation'],
        value: item['value'],
      });
    }
  }
  return effects;
}

function isVariableEffectOperation(value: unknown): value is VariableEffect['operation'] {
  return value === 'set' || value === 'add' || value === 'subtract' || value === 'toggle';
}

function isStoryGenreValue(value: unknown): value is StoryGenre {
  return (
    value === 'interactive-film' ||
    value === 'visual-novel' ||
    value === 'illustrated-text' ||
    value === 'hybrid'
  );
}

function isNarrativeEndingTypeValue(
  value: unknown,
): value is NonNullable<NarrativeEndingMetadata['endingType']> {
  return (
    value === 'good' ||
    value === 'normal' ||
    value === 'bad' ||
    value === 'secret' ||
    value === 'custom'
  );
}

function isStringValue(value: unknown): value is string {
  return typeof value === 'string';
}

function readRevision(message: PreviewToCanvasMessage): number | undefined {
  const value = (message as unknown as { revision?: unknown }).revision;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readCanvasMessageRevision(message: CanvasToPreviewMessage): number | undefined {
  const value = (message as unknown as { revision?: unknown }).revision;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function createNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let index = 0; index < 32; index += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
