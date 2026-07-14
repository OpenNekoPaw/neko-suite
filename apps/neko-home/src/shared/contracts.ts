import type { ExtensionToWebviewMessage } from '@neko-agent/types';
import type {
  NekoApplicationHandoffRequest,
  NekoApplicationHandoffResult,
  NekoApplicationIdentity,
} from '@neko/host/application';
import type { WorkbenchResourceProviderSnapshot } from '@neko/workbench-core';

export const HOME_BRIDGE_GLOBAL = 'nekoHome';

export const HOME_BRIDGE_CHANNELS = {
  getSnapshot: 'neko-home:getSnapshot',
  sendAgentRuntimeMessage: 'neko-home:sendAgentRuntimeMessage',
  handoff: 'neko-home:handoff',
} as const;

export type HomeBridgeChannel = (typeof HOME_BRIDGE_CHANNELS)[keyof typeof HOME_BRIDGE_CHANNELS];

export const HOME_AGENT_RUNTIME_IDS = {
  agentWebview: 'neko.agent.webview.home',
} as const;

export type HomeAgentRuntimeId =
  (typeof HOME_AGENT_RUNTIME_IDS)[keyof typeof HOME_AGENT_RUNTIME_IDS];

export type HomeSurfaceId = 'assets' | 'generations' | 'market' | 'skills';
export type ResourceNodeKind =
  | 'asset'
  | 'entity'
  | 'generation'
  | 'market-item'
  | 'package'
  | 'skill';

export interface ResourceStableRef {
  readonly kind: ResourceNodeKind;
  readonly id: string;
  readonly source: string;
}

export interface ResourceNode {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: ResourceNodeKind;
  readonly label: string;
  readonly ref: ResourceStableRef;
  readonly thumbnail?: {
    readonly kind: 'color' | 'icon' | 'resource-ref';
    readonly label?: string;
    readonly accent?: string;
    readonly resourceRef?: ResourceStableRef;
  };
  readonly preview?: {
    readonly kind: 'document' | 'image' | 'audio' | 'video' | 'scene' | 'package' | 'skill';
    readonly summary: string;
  };
  readonly metadata?: {
    readonly mediaType?: string;
    readonly dimensions?: string;
    readonly durationLabel?: string;
    readonly status?: string;
    readonly tags?: readonly string[];
  };
  readonly badges?: readonly {
    readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
    readonly label: string;
  }[];
  readonly actions?: readonly {
    readonly id: string;
    readonly label: string;
    readonly risk: 'read' | 'confirm' | 'manage';
  }[];
}

export type ResourcePreviewDescriptor = NonNullable<ResourceNode['preview']>;

export interface ResourceSurfaceSnapshot {
  readonly surfaceId: HomeSurfaceId;
  readonly title: string;
  readonly description: string;
  readonly nodes: readonly ResourceNode[];
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

export type HomeAgentRuntimeDiagnosticCode =
  | 'unknown-agent-runtime'
  | 'invalid-agent-runtime-request'
  | 'invalid-agent-webview-message'
  | 'unsupported-agent-route'
  | 'agent-config-load-failed';

export interface HomeAgentRuntimeDiagnostic {
  readonly code: HomeAgentRuntimeDiagnosticCode;
  readonly runtimeId?: string;
  readonly message: string;
  readonly route?: string;
}

export interface HomeAgentRuntimeMessageRequest {
  readonly runtimeId: string;
  readonly message: unknown;
}

export interface HomeAgentHostMessageResult {
  readonly runtimeId?: string;
  readonly messages: readonly ExtensionToWebviewMessage[];
  readonly diagnostics?: readonly HomeAgentRuntimeDiagnostic[];
}

export interface HomeEngineCoreSnapshot {
  readonly port: number;
  readonly availability: 'ready' | 'unavailable';
  readonly diagnostic: string;
}

export interface HomeSnapshot {
  readonly application: NekoApplicationIdentity;
  readonly workspace: {
    readonly workspaceId: string;
    readonly kind: 'personal';
    readonly label: string;
  };
  readonly engine: HomeEngineCoreSnapshot;
  readonly resourceSurfaces: readonly ResourceSurfaceSnapshot[];
  readonly resourceProviders: readonly WorkbenchResourceProviderSnapshot[];
}

export interface NekoHomeBridge {
  getSnapshot(): Promise<HomeSnapshot>;
  sendAgentRuntimeMessage(request: HomeAgentRuntimeMessageRequest): Promise<HomeAgentHostMessageResult>;
  handoff(request: NekoApplicationHandoffRequest): Promise<NekoApplicationHandoffResult>;
}

export function isHomeBridgeChannel(value: string): value is HomeBridgeChannel {
  return Object.values(HOME_BRIDGE_CHANNELS).some((channel) => channel === value);
}

export function assertHomeBridgeChannel(value: string): asserts value is HomeBridgeChannel {
  if (!isHomeBridgeChannel(value)) throw new Error(`Unknown Home bridge channel: ${value}`);
}

export function isKnownHomeAgentRuntimeId(value: string): value is HomeAgentRuntimeId {
  return value === HOME_AGENT_RUNTIME_IDS.agentWebview;
}

export function normalizeHomeAgentRuntimeMessageRequest(
  input: unknown,
): HomeAgentRuntimeMessageRequest {
  if (!isUnknownRecord(input)) {
    throw new Error('Home Agent runtime message request must be an object.');
  }
  const runtimeId = input['runtimeId'];
  if (typeof runtimeId !== 'string' || runtimeId.trim().length === 0) {
    throw new Error('runtimeId is required.');
  }
  return { runtimeId, message: input['message'] };
}

export function normalizeReadWorkspaceFileRequest(input: unknown): ReadWorkspaceFileRequest {
  if (!isUnknownRecord(input)) throw new Error('Read workspace file request must be an object.');
  return { relativePath: normalizeRelativePath(input['relativePath']) };
}

export function normalizeWriteWorkspaceFileRequest(input: unknown): WriteWorkspaceFileRequest {
  if (!isUnknownRecord(input)) throw new Error('Write workspace file request must be an object.');
  const content = input['content'];
  if (typeof content !== 'string') throw new Error('content is required.');
  if (input['encoding'] !== undefined && input['encoding'] !== 'utf8') {
    throw new Error(`Unknown workspace file encoding: ${String(input['encoding'])}`);
  }
  return { relativePath: normalizeRelativePath(input['relativePath']), content, encoding: 'utf8' };
}

function normalizeRelativePath(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('relativePath is required.');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Workspace path must remain relative: ${value}`);
  }
  return normalized;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
