// =============================================================================
// Occurrence Index Types — minimal cross-layer reference projection
// =============================================================================

export interface CreativeEntityRef {
  kind: 'character' | 'scene' | 'object' | 'location' | 'action';
  id: string;
  label?: string;
}

export interface OccurrenceLocator {
  uri?: string;
  lineStart?: number;
  lineEnd?: number;
  nodeId?: string;
  elementId?: string;
  timeStart?: number;
  timeEnd?: number;
}

export interface OccurrenceIndexEntry {
  entity: CreativeEntityRef;
  source:
    | 'script'
    | 'canvas-node'
    | 'asset-entity'
    | 'generated-asset'
    | 'timeline-element'
    | 'media-segment';
  sourceId: string;
  locator: OccurrenceLocator;
}
