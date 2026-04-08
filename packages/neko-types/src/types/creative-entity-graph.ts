// =============================================================================
// Creative Entity Graph Types — structural relationship layer for unified identity
// =============================================================================

export type CreativeGraphNodeKind =
  | 'entity'
  | 'occurrence'
  | 'asset'
  | 'canvas-node'
  | 'script-range'
  | 'timeline-element'
  | 'media-segment'
  | 'generated-asset';

export type CreativeRelationType =
  | 'alias-of'
  | 'depicts-character'
  | 'depicts-object'
  | 'set-in-scene'
  | 'appears-in-scene'
  | 'appears-in-shot'
  | 'references-entity'
  | 'performs-action'
  | 'uses-object'
  | 'voices-character'
  | 'generated-from'
  | 'derived-from'
  | 'default-visual-for';

export type CreativeRelationStrength = 'confirmed' | 'inferred';

export type CreativeRelationProvenance = 'user' | 'lineage' | 'rule' | 'ai' | 'import';

export interface CreativeGraphNode {
  readonly id: string;
  readonly kind: CreativeGraphNodeKind;
  readonly refId?: string;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeRelationEdge {
  readonly from: string;
  readonly to: string;
  readonly type: CreativeRelationType;
  readonly strength: CreativeRelationStrength;
  readonly confidence?: number;
  readonly provenance?: CreativeRelationProvenance;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeEntityGraph {
  readonly version: 1;
  readonly nodes: readonly CreativeGraphNode[];
  readonly edges: readonly CreativeRelationEdge[];
}

export const CREATIVE_ENTITY_GRAPH_VERSION = 1 as const;

export function createEmptyCreativeEntityGraph(): CreativeEntityGraph {
  return {
    version: CREATIVE_ENTITY_GRAPH_VERSION,
    nodes: [],
    edges: [],
  };
}
