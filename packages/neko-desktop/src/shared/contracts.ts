import type { SupportedLocale } from '@neko/shared';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import type {
  WorkbenchEngineViewportSessionContract,
  WorkbenchContributionSnapshot,
  WorkbenchDiagnostic,
  WorkbenchResourceProviderSnapshot,
} from '@neko/workbench-core';

export const DESKTOP_BRIDGE_GLOBAL = 'nekoDesktop';
export const DESKTOP_LEGACY_VSCODE_API_GLOBAL = 'vscodeApi';

export const DESKTOP_BRIDGE_CHANNELS = {
  getSnapshot: 'neko-desktop:getSnapshot',
  readWorkspaceFile: 'neko-desktop:readWorkspaceFile',
  writeWorkspaceFile: 'neko-desktop:writeWorkspaceFile',
  sendViewportIntent: 'neko-desktop:sendViewportIntent',
  sendFeatureWebviewMessage: 'neko-desktop:sendFeatureWebviewMessage',
  sendAgentRuntimeMessage: 'neko-desktop:sendAgentRuntimeMessage',
} as const;

export type DesktopBridgeChannel =
  (typeof DESKTOP_BRIDGE_CHANNELS)[keyof typeof DESKTOP_BRIDGE_CHANNELS];

export type DesktopHostKind = 'electron';

export const DESKTOP_AGENT_RUNTIME_IDS = {
  agentWebview: 'neko.agent.webview.electron',
} as const;

export type DesktopAgentRuntimeId =
  (typeof DESKTOP_AGENT_RUNTIME_IDS)[keyof typeof DESKTOP_AGENT_RUNTIME_IDS];

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
  readonly session: WorkbenchEngineViewportSessionContract;
  readonly capabilities: readonly string[];
  readonly nonAuthoritativeWebSurfaces: readonly string[];
}

export interface DesktopWorkbenchCoreSnapshot {
  readonly contributionSnapshot: WorkbenchContributionSnapshot;
  readonly resourceProviders: readonly WorkbenchResourceProviderSnapshot[];
  readonly diagnostics: readonly WorkbenchDiagnostic[];
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

export interface WriteWorkspaceFileRequest {
  readonly relativePath: string;
  readonly content: string;
  readonly encoding?: 'utf8';
}

export interface WriteWorkspaceFileResult {
  readonly relativePath: string;
  readonly encoding: 'utf8';
  readonly bytesWritten: number;
  readonly written: true;
}

export type DesktopFeatureWebviewRuntimeId =
  | '@neko-canvas/webview/root'
  | '@neko/webview/root'
  | '@neko-audio/webview/root'
  | '@neko-sketch/webview/root'
  | '@neko-model/webview/root'
  | '@neko/preview-webview/host-adapter';

export interface DesktopFeatureWebviewContext {
  readonly runtimeId: DesktopFeatureWebviewRuntimeId;
  readonly panelKind: DesktopCreativePanelKind;
  readonly relativePath: string;
}

export interface DesktopFeatureWebviewMessageRequest extends DesktopFeatureWebviewContext {
  readonly message: unknown;
}

export type DesktopFeatureWebviewHostMessage = unknown;

export type DesktopFeatureWebviewDiagnosticCode =
  | 'invalid-feature-webview-message'
  | 'unsupported-feature-webview-runtime'
  | 'unsupported-feature-webview-route'
  | 'feature-webview-document-load-failed'
  | 'feature-webview-document-save-failed';

export interface DesktopFeatureWebviewDiagnostic {
  readonly code: DesktopFeatureWebviewDiagnosticCode;
  readonly runtimeId?: string;
  readonly panelKind?: string;
  readonly route?: string;
  readonly message: string;
}

export interface DesktopFeatureWebviewHostMessageResult {
  readonly runtimeId?: DesktopFeatureWebviewRuntimeId;
  readonly messages: readonly DesktopFeatureWebviewHostMessage[];
  readonly diagnostics?: readonly DesktopFeatureWebviewDiagnostic[];
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
  readonly workbench: DesktopWorkbenchCoreSnapshot;
  readonly viewport: EngineViewportSummary;
}

export type DesktopAgentHostMessage = ExtensionToWebviewMessage;

export type DesktopAgentRuntimeDiagnosticCode =
  | 'unknown-agent-runtime'
  | 'invalid-agent-runtime-request'
  | 'invalid-agent-webview-message'
  | 'unsupported-agent-route'
  | 'agent-config-load-failed';

export interface DesktopAgentRuntimeDiagnostic {
  readonly code: DesktopAgentRuntimeDiagnosticCode;
  readonly runtimeId?: string;
  readonly message: string;
  readonly route?: string;
}

export interface DesktopAgentRuntimeMessageRequest {
  readonly runtimeId: string;
  readonly message: unknown;
}

export interface DesktopAgentHostMessageResult {
  readonly runtimeId?: string;
  readonly messages: readonly DesktopAgentHostMessage[];
  readonly diagnostics?: readonly DesktopAgentRuntimeDiagnostic[];
}

export interface NekoDesktopBridge {
  getSnapshot(): Promise<DesktopSnapshot>;
  readWorkspaceFile(request: ReadWorkspaceFileRequest): Promise<ReadWorkspaceFileResult>;
  writeWorkspaceFile(request: WriteWorkspaceFileRequest): Promise<WriteWorkspaceFileResult>;
  sendViewportIntent(intent: ViewportIntent): Promise<ViewportIntentAck>;
  setFeatureWebviewContext(context: DesktopFeatureWebviewContext | undefined): void;
  sendFeatureWebviewMessage(
    request: DesktopFeatureWebviewMessageRequest,
  ): Promise<DesktopFeatureWebviewHostMessageResult>;
  sendAgentRuntimeMessage(
    request: DesktopAgentRuntimeMessageRequest,
  ): Promise<DesktopAgentHostMessageResult>;
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
  return { relativePath: normalizeWorkspaceRelativeRequestPath(input['relativePath']) };
}

export function normalizeWriteWorkspaceFileRequest(input: unknown): WriteWorkspaceFileRequest {
  if (!isRecord(input)) {
    throw new Error('Write workspace file request must be an object.');
  }
  const relativePath = normalizeWorkspaceRelativeRequestPath(input['relativePath']);
  const content = input['content'];
  if (typeof content !== 'string') {
    throw new Error('content is required.');
  }
  const encoding = input['encoding'];
  if (encoding !== undefined && encoding !== 'utf8') {
    throw new Error(`Unknown workspace file encoding: ${String(encoding)}`);
  }
  return {
    relativePath,
    content,
    encoding: 'utf8',
  };
}

export function isKnownDesktopAgentRuntimeId(value: string): value is DesktopAgentRuntimeId {
  return Object.values(DESKTOP_AGENT_RUNTIME_IDS).includes(value as DesktopAgentRuntimeId);
}

export function normalizeDesktopAgentRuntimeMessageRequest(
  input: unknown,
): DesktopAgentRuntimeMessageRequest {
  if (!isRecord(input)) {
    throw new Error('Desktop Agent runtime message request must be an object.');
  }
  return {
    runtimeId: readNonEmptyString(input['runtimeId'], 'runtimeId'),
    message: input['message'],
  };
}

export function normalizeDesktopFeatureWebviewMessageRequest(
  input: unknown,
): DesktopFeatureWebviewMessageRequest {
  if (!isRecord(input)) {
    throw new Error('Desktop feature Webview message request must be an object.');
  }
  const runtimeId = readDesktopFeatureWebviewRuntimeId(input['runtimeId']);
  const panelKind = readDesktopCreativePanelKind(input['panelKind']);
  return {
    runtimeId,
    panelKind,
    relativePath: normalizeWorkspaceRelativeRequestPath(input['relativePath']),
    message: input['message'],
  };
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
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

function readDesktopFeatureWebviewRuntimeId(value: unknown): DesktopFeatureWebviewRuntimeId {
  const runtimeIds: readonly DesktopFeatureWebviewRuntimeId[] = [
    '@neko-canvas/webview/root',
    '@neko/webview/root',
    '@neko-audio/webview/root',
    '@neko-sketch/webview/root',
    '@neko-model/webview/root',
    '@neko/preview-webview/host-adapter',
  ];
  if (typeof value === 'string' && runtimeIds.includes(value as DesktopFeatureWebviewRuntimeId)) {
    return value as DesktopFeatureWebviewRuntimeId;
  }
  throw new Error(`Unsupported desktop feature Webview runtime: ${String(value)}`);
}

function readDesktopCreativePanelKind(value: unknown): DesktopCreativePanelKind {
  const panelKinds: readonly DesktopCreativePanelKind[] = [
    'canvas-workbench',
    'cut-timeline',
    'audio-timeline',
    'sketch-editor',
    'model-viewport',
    'code-editor',
    'media-preview',
  ];
  if (typeof value === 'string' && panelKinds.includes(value as DesktopCreativePanelKind)) {
    return value as DesktopCreativePanelKind;
  }
  throw new Error(`Unsupported desktop feature Webview panel: ${String(value)}`);
}

function normalizeWorkspaceRelativeRequestPath(value: unknown): string {
  const relativePath = readNonEmptyString(value, 'relativePath').replace(/\\/g, '/');
  const parts = relativePath.split('/').filter((part) => part.length > 0 && part !== '.');
  if (
    relativePath.startsWith('/') ||
    parts.length === 0 ||
    parts.some((part) => part === '..')
  ) {
    throw new Error('Workspace file relativePath must stay inside the workspace.');
  }
  return parts.join('/');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
