/**
 * Canvas Ambient Context
 *
 * Stores the currently selected canvas nodes so that neko-agent can inject
 * them into the system prompt automatically (without the user having to @mention).
 *
 * Updated by subscribing to NekoCanvasAPI.nodes.onSelectionChange in index.ts.
 * Read by messageHandler when building the agent context per conversation.
 *
 * Also tracks asset and canvas change events (P1) so the agent is aware of
 * canvas mutations that occurred since the last interaction.
 */

import type { CanvasNode } from '@neko/shared';
import type { GenerationModelConfig } from '@neko/shared';
import * as vscode from 'vscode';

// =============================================================================
// In-memory state
// =============================================================================

export interface SelectedNodeSummary {
  nodeId: string;
  type: string;
  summary: string;
  assetUri?: string;
  assetKind?: 'image' | 'video' | 'audio' | 'metadata' | 'unknown';
  bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Lightweight summary of a canvas/asset change event for ambient injection. */
export interface CanvasChangeSummary {
  /** 'canvas' for node/shape changes, 'assets' for library changes */
  readonly domain: 'canvas' | 'assets';
  readonly changeType: 'add' | 'update' | 'delete';
  /** nodeId or assetId, when available */
  readonly id?: string;
  readonly timestamp: number;
}

let _selectedNodes: SelectedNodeSummary[] = [];
let _generationConfig: GenerationModelConfig | undefined;

/** Ring buffer of recent canvas/asset changes (max 20). */
let _pendingChanges: CanvasChangeSummary[] = [];
const MAX_PENDING_CHANGES = 20;

const MAX_AMBIENT_NODES = 5;

// =============================================================================
// Generation config event (for status bar subscription)
// =============================================================================

const _onDidChangeGenerationConfig = new vscode.EventEmitter<GenerationModelConfig | undefined>();
/** Fired when the active project generation model config changes. */
export const onDidChangeGenerationConfig = _onDidChangeGenerationConfig.event;

const _onDidChangeCanvasSelection = new vscode.EventEmitter<SelectedNodeSummary[]>();
/** Fired when the canvas selection changes — used to push ambient chips to the webview. */
export const onDidChangeCanvasSelection = _onDidChangeCanvasSelection.event;

const _onDidReceiveCanvasChange = new vscode.EventEmitter<CanvasChangeSummary>();
/**
 * Fired when a canvas or asset change event is received from neko-canvas.
 * Subscribers (e.g. the chat view) can use this to surface a "canvas changed"
 * indicator without polling.
 */
export const onDidReceiveCanvasChange = _onDidReceiveCanvasChange.event;

// =============================================================================
// Public API
// =============================================================================

/** Update the stored selection (called from onSelectionChange handler) */
export function setCanvasSelection(nodes: CanvasNode[]): void {
  _selectedNodes = nodes.slice(0, MAX_AMBIENT_NODES).map(summarizeNode);
  _onDidChangeCanvasSelection.fire(_selectedNodes);
}

/** Read the current selection for injection into agent context */
export function getCanvasSelection(): SelectedNodeSummary[] {
  return _selectedNodes;
}

/** Clear the selection (called when canvas editor closes) */
export function clearCanvasSelection(): void {
  _selectedNodes = [];
  _onDidChangeCanvasSelection.fire(_selectedNodes);
}

/** Update the active generation model config (called after set_project_generation_config) */
export function setActiveGenerationConfig(config: GenerationModelConfig): void {
  _generationConfig = config;
  _onDidChangeGenerationConfig.fire(config);
}

/** Read the active generation model config */
export function getActiveGenerationConfig(): GenerationModelConfig | undefined {
  return _generationConfig;
}

/**
 * Record an incoming canvas or asset change event.
 * Appends to the ring buffer and fires the event emitter.
 * Called from the canvas event subscriptions in index.ts.
 */
export function recordCanvasChange(summary: CanvasChangeSummary): void {
  _pendingChanges.push(summary);
  if (_pendingChanges.length > MAX_PENDING_CHANGES) {
    _pendingChanges = _pendingChanges.slice(_pendingChanges.length - MAX_PENDING_CHANGES);
  }
  _onDidReceiveCanvasChange.fire(summary);
}

/**
 * Return all pending canvas/asset changes and clear the buffer.
 * Called by messageHandler to inject change context before an agent response.
 */
export function drainPendingCanvasChanges(): CanvasChangeSummary[] {
  const changes = _pendingChanges;
  _pendingChanges = [];
  return changes;
}

/** Peek at the pending changes without clearing them. */
export function getPendingCanvasChanges(): readonly CanvasChangeSummary[] {
  return _pendingChanges;
}

// =============================================================================
// Node summary helper
// =============================================================================

function summarizeNode(node: CanvasNode): SelectedNodeSummary {
  const type = node.type;
  let summary = `${type} #${node.id.slice(0, 6)}`;

  // Produce richer summaries for storyboard node types
  const data = node.data as Record<string, unknown>;

  switch (node.type) {
    case 'shot': {
      const shotNum = data['shotNumber'] ?? '?';
      const scale = data['shotScale'] ?? '';
      const desc =
        typeof data['visualDescription'] === 'string' ? data['visualDescription'].slice(0, 60) : '';
      summary = `#${shotNum} ${scale}${desc ? ` — ${desc}` : ''}`.trim();
      break;
    }
    case 'scene': {
      const title = typeof data['sceneTitle'] === 'string' ? data['sceneTitle'] : 'Scene';
      const num = data['sceneNumber'] ?? '';
      summary = `Scene ${num}: ${title}`.trim();
      break;
    }
    case 'gallery': {
      const name = typeof data['characterName'] === 'string' ? data['characterName'] : '';
      const preset = typeof data['preset'] === 'string' ? data['preset'] : '';
      summary = name ? `Gallery: ${name} (${preset})` : `Gallery (${preset})`;
      break;
    }
    case 'annotation': {
      const content = typeof data['content'] === 'string' ? data['content'].slice(0, 60) : '';
      summary = content ? `Note: ${content}` : 'Annotation';
      break;
    }
    case 'media': {
      const mediaType = data['mediaType'] ?? 'media';
      const assetPath =
        typeof data['assetPath'] === 'string' ? (data['assetPath'].split('/').pop() ?? '') : '';
      summary = assetPath ? `${mediaType}: ${assetPath}` : String(mediaType);
      break;
    }
    default:
      break;
  }

  return {
    nodeId: node.id,
    type,
    summary,
    ...(readCanvasNodeAssetUri(node) ? { assetUri: readCanvasNodeAssetUri(node) } : {}),
    ...(readCanvasNodeAssetKind(node) ? { assetKind: readCanvasNodeAssetKind(node) } : {}),
    bounds: {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
    },
  };
}

function readCanvasNodeAssetUri(node: CanvasNode): string | undefined {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'media' && typeof data['assetPath'] === 'string') {
    return data['assetPath'];
  }
  if (node.type === 'shot') {
    const generatedAsset = data['generatedAsset'];
    if (isRecord(generatedAsset) && typeof generatedAsset['path'] === 'string') {
      return generatedAsset['path'];
    }
    if (typeof data['generatedImage'] === 'string') {
      return data['generatedImage'];
    }
  }
  return undefined;
}

function readCanvasNodeAssetKind(node: CanvasNode): SelectedNodeSummary['assetKind'] | undefined {
  const data = node.data as Record<string, unknown>;
  if (node.type === 'media') {
    const mediaType = data['mediaType'];
    if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') {
      return mediaType;
    }
    return 'unknown';
  }
  if (node.type === 'shot' && readCanvasNodeAssetUri(node)) {
    return 'image';
  }
  return undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
