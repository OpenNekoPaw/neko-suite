import type { SupportedLocale } from '@neko/shared';

export const DESKTOP_BRIDGE_GLOBAL = 'nekoDesktop';

export const DESKTOP_BRIDGE_CHANNELS = {
  getSnapshot: 'neko-desktop:getSnapshot',
  readWorkspaceFile: 'neko-desktop:readWorkspaceFile',
  sendViewportIntent: 'neko-desktop:sendViewportIntent',
} as const;

export type DesktopBridgeChannel =
  (typeof DESKTOP_BRIDGE_CHANNELS)[keyof typeof DESKTOP_BRIDGE_CHANNELS];

export type DesktopHostKind = 'electron';

export type WorkbenchSurfaceId =
  | 'explorer'
  | 'assets'
  | 'generations'
  | 'market'
  | 'skills'
  | 'search';

export type ResourceNodeKind =
  | 'file'
  | 'asset'
  | 'entity'
  | 'generation'
  | 'market-item'
  | 'package'
  | 'skill'
  | 'search-result';

export type ResourceThumbnailKind = 'color' | 'icon' | 'resource-ref';

export type ViewportAvailability = 'unavailable' | 'ready';

export type WorkspaceFileKind =
  | 'directory'
  | 'image'
  | 'video'
  | 'audio'
  | 'model'
  | 'puppet'
  | 'canvas'
  | 'timeline'
  | 'audio-project'
  | 'sketch'
  | 'story'
  | 'document'
  | 'archive'
  | 'config'
  | 'unknown';

export type WorkspaceFileScmStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflicted'
  | 'untracked'
  | 'ignored';

export type DesktopEditorKind =
  | 'canvas'
  | 'timeline'
  | 'audio'
  | 'sketch'
  | 'model'
  | 'story'
  | 'code'
  | 'media-preview'
  | 'asset-preview';

export type DesktopCreativePanelKind =
  | 'canvas-workbench'
  | 'cut-timeline'
  | 'audio-timeline'
  | 'sketch-editor'
  | 'model-viewport'
  | 'code-editor'
  | 'media-preview';

export type WorkspaceFileThumbnailKind = 'image' | 'video' | 'audio' | 'model' | 'icon';

export interface DesktopHostSnapshot {
  readonly id: string;
  readonly kind: DesktopHostKind;
  readonly displayName: string;
  readonly version: string;
  readonly locale: SupportedLocale;
}

export interface DesktopWorkspaceSnapshot {
  readonly name: string;
  readonly root: string;
  readonly trust: 'trusted' | 'untrusted' | 'unknown';
}

export interface WorkbenchSurface {
  readonly id: WorkbenchSurfaceId;
  readonly label: string;
  readonly role: 'project-resources' | 'domain-manager' | 'catalog-manager' | 'search';
  readonly resourceSourceIds: readonly string[];
}

export interface ResourceStableRef {
  readonly kind: ResourceNodeKind;
  readonly id: string;
  readonly source: string;
}

export interface ResourceThumbnailDescriptor {
  readonly kind: ResourceThumbnailKind;
  readonly label?: string;
  readonly accent?: string;
  readonly resourceRef?: ResourceStableRef;
}

export interface ResourcePreviewDescriptor {
  readonly kind: 'document' | 'image' | 'audio' | 'video' | 'scene' | 'package' | 'skill';
  readonly summary: string;
}

export interface ResourceBadge {
  readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  readonly label: string;
}

export interface ResourceActionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly risk: 'read' | 'confirm' | 'manage';
}

export interface ResourceNodeMetadata {
  readonly mediaType?: string;
  readonly dimensions?: string;
  readonly durationLabel?: string;
  readonly colorSpace?: string;
  readonly status?: string;
  readonly tags?: readonly string[];
}

export interface ResourceNode {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: ResourceNodeKind;
  readonly label: string;
  readonly ref: ResourceStableRef;
  readonly thumbnail?: ResourceThumbnailDescriptor;
  readonly preview?: ResourcePreviewDescriptor;
  readonly metadata?: ResourceNodeMetadata;
  readonly badges?: readonly ResourceBadge[];
  readonly actions?: readonly ResourceActionDescriptor[];
}

export interface WorkspaceFileThumbnailDescriptor {
  readonly kind: WorkspaceFileThumbnailKind;
  readonly url?: string;
  readonly label: string;
}

export interface DesktopEditorAdapterDescriptor {
  readonly kind: DesktopEditorKind;
  readonly panelKind: DesktopCreativePanelKind;
  readonly label: string;
  readonly packageName: string;
  readonly implementedInVsCodeWebview: boolean;
  readonly desktopRuntime: 'full-webview-runtime' | 'host-adapter-projection' | 'desktop-native';
}

export interface WorkspaceFileNode {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly kind: WorkspaceFileKind;
  readonly sizeBytes?: number;
  readonly modifiedAt?: string;
  readonly childCount?: number;
  readonly scmStatus?: WorkspaceFileScmStatus;
  readonly thumbnail?: WorkspaceFileThumbnailDescriptor;
  readonly editor?: DesktopEditorAdapterDescriptor;
  readonly children?: readonly WorkspaceFileNode[];
}

export interface WorkspaceFileTreeSnapshot {
  readonly rootName: string;
  readonly rootRef: ResourceStableRef;
  readonly nodes: readonly WorkspaceFileNode[];
  readonly selectedFileId?: string;
  readonly totalFileCount: number;
  readonly directoryCount: number;
  readonly mediaFileCount: number;
  readonly truncated: boolean;
}

export interface ResourceSurfaceSnapshot {
  readonly surfaceId: WorkbenchSurfaceId;
  readonly title: string;
  readonly description: string;
  readonly nodes: readonly ResourceNode[];
}

export interface EngineViewportSummary {
  readonly id: string;
  readonly owner: 'neko-engine';
  readonly availability: ViewportAvailability;
  readonly label: string;
  readonly diagnostic: string;
  readonly capabilities: readonly string[];
  readonly nonAuthoritativeWebSurfaces: readonly string[];
}

export interface ViewportIntent {
  readonly viewportId: string;
  readonly action: 'activate' | 'focus' | 'play' | 'pause' | 'seek' | 'inspect';
  readonly source: 'renderer';
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ReadWorkspaceFileRequest {
  readonly relativePath: string;
}

export interface ReadWorkspaceFileResult {
  readonly relativePath: string;
  readonly content: string;
  readonly encoding: 'utf8';
  readonly truncated: boolean;
}

export type ViewportIntentRejectionReason =
  | 'engine-unavailable'
  | 'viewport-intent-unimplemented';

export type ViewportIntentAck = ViewportIntentAcceptedAck | ViewportIntentRejectedAck;

export interface ViewportIntentAcceptedAck {
  readonly accepted: true;
  readonly viewportId: string;
  readonly action: ViewportIntent['action'];
  readonly diagnostic: string;
}

export interface ViewportIntentRejectedAck {
  readonly accepted: false;
  readonly viewportId: string;
  readonly action: ViewportIntent['action'];
  readonly reason: ViewportIntentRejectionReason;
  readonly diagnostic: string;
}

export interface DesktopSnapshot {
  readonly host: DesktopHostSnapshot;
  readonly workspace: DesktopWorkspaceSnapshot;
  readonly surfaces: readonly WorkbenchSurface[];
  readonly resourceSurfaces: readonly ResourceSurfaceSnapshot[];
  readonly workspaceTree: WorkspaceFileTreeSnapshot;
  readonly viewport: EngineViewportSummary;
}

export interface NekoDesktopBridge {
  getSnapshot(): Promise<DesktopSnapshot>;
  readWorkspaceFile(request: ReadWorkspaceFileRequest): Promise<ReadWorkspaceFileResult>;
  sendViewportIntent(intent: ViewportIntent): Promise<ViewportIntentAck>;
}

export function isDesktopBridgeChannel(value: string): value is DesktopBridgeChannel {
  return Object.values(DESKTOP_BRIDGE_CHANNELS).includes(value as DesktopBridgeChannel);
}

export function assertDesktopBridgeChannel(value: string): asserts value is DesktopBridgeChannel {
  if (!isDesktopBridgeChannel(value)) {
    throw new Error(`Unknown desktop bridge channel: ${value}`);
  }
}

export function normalizeViewportIntent(input: unknown): ViewportIntent {
  if (!isRecord(input)) {
    throw new Error('Viewport intent must be an object.');
  }
  const viewportId = readNonEmptyString(input['viewportId'], 'viewportId');
  const action = readViewportAction(input['action']);
  const source = input['source'];
  if (source !== 'renderer') {
    throw new Error('Viewport intent source must be renderer.');
  }
  const payload = input['payload'];
  return {
    viewportId,
    action,
    source,
    ...(isRecord(payload) ? { payload } : {}),
  };
}

export function normalizeReadWorkspaceFileRequest(input: unknown): ReadWorkspaceFileRequest {
  if (!isRecord(input)) {
    throw new Error('Read workspace file request must be an object.');
  }
  const relativePath = readNonEmptyString(input['relativePath'], 'relativePath');
  if (relativePath.startsWith('/') || relativePath.includes('..')) {
    throw new Error('Read workspace file relativePath must stay inside the workspace.');
  }
  return { relativePath };
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Viewport intent ${field} is required.`);
  }
  return value;
}

function readViewportAction(value: unknown): ViewportIntent['action'] {
  const actions: readonly ViewportIntent['action'][] = [
    'activate',
    'focus',
    'play',
    'pause',
    'seek',
    'inspect',
  ];
  if (typeof value === 'string' && actions.includes(value as ViewportIntent['action'])) {
    return value as ViewportIntent['action'];
  }
  throw new Error(`Unknown viewport intent action: ${String(value)}`);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
