import * as vscode from 'vscode';
import {
  createNarrativeRelativePathAssetRef,
  isNarrativeAssetRef,
  isResourceRef,
  NARRATIVE_RUNTIME_NODE_TYPES,
  normalizeNarrativePreviewFeatureToggles,
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
    this.postToPreview({
      type: 'preview:loadGraph',
      requestId: this.createRequestId('load'),
      snapshot,
      revision: snapshot.revision,
    });
    return true;
  }

  refresh(): boolean {
    if (!this.getFeatureToggles().preview) return false;

    const snapshot = this.host.extractNarrativeGraphSnapshot();
    if (!snapshot) return false;
    if (!this.panel) return false;

    this.postFeatureToggles(snapshot.revision);
    this.postToPreview({
      type: 'preview:refresh',
      requestId: this.createRequestId('refresh'),
      snapshot,
      revision: snapshot.revision,
    });
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
    panel.webview.html = this.getPreviewHtml(panel.webview);
    panel.webview.onDidReceiveMessage(
      (message) => {
        const previewMessage = parsePreviewToCanvasMessage(message);
        if (previewMessage) {
          this.handlePreviewMessage(previewMessage);
        }
      },
      undefined,
      [],
    );
    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
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
    this.panel?.webview.postMessage(message);
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
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    section { max-width: 720px; width: 100%; border: 1px solid var(--vscode-panel-border); padding: 16px; border-radius: 6px; background: var(--vscode-sideBar-background); }
    h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
    p { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.5; }
    code { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Narrative Preview</h1>
      <p id="status">Waiting for Canvas graph...</p>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const status = document.getElementById('status');
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'preview:loadGraph' || message.type === 'preview:refresh') {
        const count = Array.isArray(message.snapshot?.nodes) ? message.snapshot.nodes.length : 0;
        status.textContent = 'Loaded revision ' + message.revision + ' with ' + count + ' runtime nodes.';
      } else if (message.type === 'preview:jumpTo') {
        status.textContent = 'Jump request: ' + message.nodeId + ' at revision ' + message.revision + '.';
      }
    });
    window.__nekoNarrativePreviewPostMessage = (message) => vscode.postMessage(message);
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
