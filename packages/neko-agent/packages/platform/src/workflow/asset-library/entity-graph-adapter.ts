/**
 * EntityGraphAdapter — read-only wrapper around CreativeEntityGraphSnapshot.
 *
 * Projects the snapshot into workflow-module Entity/Asset/Relation shapes.
 * See docs/architecture/asset-knowledge-graph.md §4.
 */

import type {
  CreativeEntityGraphSnapshot,
  CreativeGraphNode,
  CreativeRelationEdge,
} from '@neko/shared';
import type { Asset, AssetKind, Entity, EntityKind, Relation, RelationKind } from './types';

export interface EntityGraphIndex {
  /** Non-character entities discovered in the graph (scene/action/prop/style) */
  readonly extraEntities: ReadonlyArray<Entity>;
  /** Assets discovered via graph nodes (may overlap with ManifestAdapter output) */
  readonly graphAssets: ReadonlyArray<Asset>;
  /** Relations projected to workflow shape */
  readonly relations: ReadonlyArray<Relation>;
  /** Map from canvas-node id → entities referenced by that node */
  readonly entitiesByCanvasNode: ReadonlyMap<string, ReadonlyArray<string>>;
}

export function indexEntityGraph(
  snapshot: CreativeEntityGraphSnapshot | undefined,
): EntityGraphIndex {
  if (!snapshot) {
    return {
      extraEntities: [],
      graphAssets: [],
      relations: [],
      entitiesByCanvasNode: new Map(),
    };
  }

  const extraEntities: Entity[] = [];
  const graphAssets: Asset[] = [];
  const relations: Relation[] = [];
  const entitiesByCanvasNode = new Map<string, string[]>();

  // Project nodes
  for (const node of snapshot.nodes) {
    if (node.kind === 'entity') {
      const entity = projectEntityNode(node);
      if (entity) extraEntities.push(entity);
    } else if (node.kind === 'asset' || node.kind === 'generated-asset') {
      const asset = projectAssetNode(node);
      if (asset) graphAssets.push(asset);
    }
  }

  // Project edges
  for (const edge of snapshot.edges) {
    const relKind = projectRelationKind(edge.type);
    if (relKind) {
      relations.push({
        from: edge.from,
        to: edge.to,
        kind: relKind,
        ...(edge.confidence !== undefined && { confidence: edge.confidence }),
      });
    }

    // Index canvas-node → entity references (appears-in-shot / depicts-character)
    if (edge.type === 'appears-in-shot' || edge.type === 'depicts-character') {
      const canvasNodeId = findCanvasNodeId(snapshot, edge);
      if (canvasNodeId) {
        const list = entitiesByCanvasNode.get(canvasNodeId) ?? [];
        const otherEnd = canvasNodeId === edge.from ? edge.to : edge.from;
        if (!list.includes(otherEnd)) list.push(otherEnd);
        entitiesByCanvasNode.set(canvasNodeId, list);
      }
    }
  }

  return {
    extraEntities,
    graphAssets,
    relations,
    entitiesByCanvasNode,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function projectEntityNode(node: CreativeGraphNode): Entity | undefined {
  if (node.kind !== 'entity') return undefined;
  const id = node.refId ?? node.id;
  // Without a refId we can't reliably link; skip anonymous nodes.
  if (!id) return undefined;
  // The graph doesn't carry entity kind in the node; derive from label/id prefix
  // by convention: "scene:forest", "action:walk", etc. Falls back to "prop".
  const kind: EntityKind = inferEntityKind(node.label ?? node.id);
  return {
    id,
    kind,
    canonicalName: node.label ?? id,
    aliases: [],
  };
}

function projectAssetNode(node: CreativeGraphNode): Asset | undefined {
  if (node.kind !== 'asset' && node.kind !== 'generated-asset') return undefined;
  const id = node.refId ?? node.id;
  if (!id) return undefined;
  // Graph doesn't carry MIME/path; consumer ManifestAdapter provides richer info.
  // We still surface these so Matching has something to hook when manifest is empty.
  return {
    id,
    kind: 'other',
    path: node.label ?? id,
    source: node.kind === 'generated-asset' ? 'ai-generated' : 'local',
  };
}

function projectRelationKind(type: CreativeRelationEdge['type']): RelationKind | undefined {
  switch (type) {
    case 'alias-of':
      return 'alias-of';
    case 'depicts-character':
    case 'depicts-object':
      return 'default-visual-for';
    case 'set-in-scene':
    case 'appears-in-scene':
      return 'contains';
    case 'performs-action':
      return 'performs-action';
    case 'uses-object':
    case 'default-visual-for':
      return 'default-visual-for';
    case 'voices-character':
      return 'voices-character';
    case 'appears-in-shot':
    case 'references-entity':
    case 'generated-from':
    case 'derived-from':
      return undefined; // structural; not user-facing
  }
}

function inferEntityKind(label: string): EntityKind {
  const lower = label.toLowerCase();
  if (lower.startsWith('scene:') || lower.includes('forest') || lower.includes('room')) {
    return 'scene';
  }
  if (lower.startsWith('action:') || lower.startsWith('verb:')) return 'action';
  if (lower.startsWith('style:')) return 'style';
  if (lower.startsWith('character:')) return 'character';
  return 'prop';
}

function findCanvasNodeId(
  snapshot: CreativeEntityGraphSnapshot,
  edge: CreativeRelationEdge,
): string | undefined {
  // Look for a node matching either end whose kind is canvas-node
  for (const end of [edge.from, edge.to]) {
    const node = snapshot.nodes.find((n) => n.id === end);
    if (node?.kind === 'canvas-node') return node.id;
  }
  return undefined;
}
