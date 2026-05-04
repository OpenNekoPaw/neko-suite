import type { AgentWorkflowIdentity } from './workflow';

export type AgentMediaModality = 'text' | 'image' | 'video' | 'audio' | 'data' | 'mixed';

export interface AgentMediaMetadata {
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly frameRate?: number;
  readonly channels?: number;
  readonly sampleRate?: number;
  readonly uriPolicy?: 'workspace-uri' | 'webview-uri' | 'data-uri' | 'remote-url' | 'opaque-ref';
}

export interface AgentMultimodalEvidenceRef {
  readonly id: string;
  readonly source: 'agent' | 'tool' | 'user' | 'memory' | 'engine' | 'subagent';
  readonly modality: AgentMediaModality;
  readonly summary?: string;
  readonly artifactId?: string;
  readonly perceptionInputId?: string;
  readonly withheld?: boolean;
}

export interface AgentMultimodalPacketLinkage {
  readonly conversationId?: string;
  readonly workflow?: AgentWorkflowIdentity;
}

export interface AgentToolModalityDeclaration {
  readonly toolName: string;
  readonly acceptedModalities: readonly AgentMediaModality[];
  readonly producedModalities?: readonly AgentMediaModality[];
  readonly requiredEvidence?: readonly AgentMediaModality[];
  readonly outputArtifactTypes?: readonly string[];
  readonly providerConstraints?: readonly string[];
}

export interface AgentGeneratedArtifactProjection {
  readonly id: string;
  readonly type: 'image' | 'video' | 'audio' | 'document' | 'data' | 'unknown';
  readonly uri: string;
  readonly mimeType?: string;
  readonly metadata?: AgentMediaMetadata & Record<string, unknown>;
  readonly conversationId?: string;
  readonly workflow?: AgentWorkflowIdentity;
  readonly taskId?: string;
  readonly toolCallId?: string;
}

export interface AgentMediaPayloadRequest {
  readonly artifactId?: string;
  readonly uri: string;
  readonly modality: AgentMediaModality;
  readonly preferredEncoding?: 'base64' | 'bytes' | 'url';
}

export type AgentMediaPayload =
  | {
      readonly encoding: 'base64';
      readonly data: string;
      readonly mimeType?: string;
    }
  | {
      readonly encoding: 'bytes';
      readonly data: Uint8Array;
      readonly mimeType?: string;
    }
  | {
      readonly encoding: 'url';
      readonly url: string;
      readonly mimeType?: string;
    };

export interface AgentMultimodalHostAdapter {
  loadMediaPayload(request: AgentMediaPayloadRequest): Promise<AgentMediaPayload>;
}
