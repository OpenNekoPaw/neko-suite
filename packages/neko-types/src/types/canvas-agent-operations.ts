import type { CanvasNode, CanvasNodeType } from './canvas';
import type { FieldBinding, JsonPointerPath } from './canvas-layered';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasNodeCreateSpec {
  type?: CanvasNodeType;
  preset?: string;
  position?: CanvasPoint;
  data?: Record<string, unknown>;
}

export interface CanvasDeriveNodeRequest {
  sourceNodeId: string;
  targetPreset?: string;
  targetType?: CanvasNodeType;
  data?: Record<string, unknown>;
  connect?: boolean;
}

export interface CanvasDeriveNodeResult {
  nodeId: string;
  connectionId?: string;
  node?: CanvasNode;
}

export interface CanvasCompositeChildSpec extends CanvasNodeCreateSpec {
  id?: string;
}

export interface CanvasCreateCompositeRequest {
  containerPreset?: string;
  containerType?: CanvasNodeType;
  position?: CanvasPoint;
  data?: Record<string, unknown>;
  children: readonly CanvasCompositeChildSpec[];
  autoLayout?: boolean;
}

export interface CanvasCreateCompositeResult {
  containerId: string;
  childIds: string[];
  nodes?: CanvasNode[];
}

export interface CanvasUpdateBlockRequest {
  nodeId: string;
  blockId?: string;
  path?: JsonPointerPath;
  binding?: FieldBinding;
  value: unknown;
}

export interface CanvasUpdateBlockResult {
  nodeId: string;
  changed: boolean;
  data?: Record<string, unknown>;
}

export type CanvasStructuredContentFormat = 'json' | 'markdown' | 'prompt';

export interface CanvasExtractStructuredContentRequest {
  nodeIds?: readonly string[];
  format: CanvasStructuredContentFormat;
  includeChildren?: boolean;
}

export interface CanvasStructuredNodeSummary {
  id: string;
  type: CanvasNodeType;
  preset?: string;
  title?: string;
  summary?: string;
  parentId?: string;
  childIds?: string[];
  data: Record<string, unknown>;
  bindings?: Array<{
    blockId: string;
    label?: string;
    path: JsonPointerPath;
    value: unknown;
  }>;
  preview?: {
    title?: string;
    subtitle?: string;
    role?: string;
    thumbnailVariantId?: string;
  };
}

export interface CanvasExtractStructuredContentResult {
  format: CanvasStructuredContentFormat;
  nodeIds: string[];
  nodes: CanvasStructuredNodeSummary[];
  content: string | CanvasStructuredNodeSummary[];
}
