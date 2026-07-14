// =============================================================================
// CreativeEntityGraphService — Builds and maintains a cross-modal relationship
// graph tracking connections between creative entities and their canvas, asset,
// and generated-asset representations.
//
// The graph is rebuilt from owning project facts and cross-modal runtime data.
//
// See ADR §4.5 for the CreativeEntityGraph model.
// =============================================================================

import * as vscode from 'vscode';
import type {
  AssetEntity,
  CanvasNode,
  CreativeGraphNode,
  CreativeGraphNodeKind,
  CreativeRelationEdge,
  CreativeRelationEdgeType,
  CreativeRelationProvenance,
  EntityAssetBinding,
  EntityAssetBindingSource,
  GeneratedAsset,
  GalleryCanvasNode,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from '@neko/shared';
import type { ICharacterWorkspaceIndex, ICreativeEntityGraph } from './types';
import type { CrossModalDataProvider, CrossModalDataSnapshot } from './CrossModalDataProvider';

export class CreativeEntityGraphService implements ICreativeEntityGraph {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
  readonly onDidUpdate = this.onDidUpdateEmitter.event;

  private nodes = new Map<string, CreativeGraphNode>();
  private edges: CreativeRelationEdge[] = [];

  private initPromise: Promise<void> | undefined;

  constructor(
    private readonly dataProvider: CrossModalDataProvider,
    private readonly characterIndex: ICharacterWorkspaceIndex,
  ) {}

  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  getEdgesForEntity(entityId: string): readonly CreativeRelationEdge[] {
    return this.edges.filter((e) => e.from === entityId || e.to === entityId);
  }

  getNodesByKind(kind: CreativeGraphNodeKind): readonly CreativeGraphNode[] {
    const result: CreativeGraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.kind === kind) {
        result.push(node);
      }
    }
    return result;
  }

  dispose(): void {
    this.onDidUpdateEmitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private async initialize(): Promise<void> {
    await Promise.all([
      this.characterIndex.ensureInitialized(),
      this.dataProvider.ensureInitialized(),
    ]);
    this.rebuild(this.dataProvider.getSnapshot());

    this.disposables.push(
      this.dataProvider.onDidUpdate(() => {
        this.rebuild(this.dataProvider.getSnapshot());
      }),
    );

    // Re-rebuild when character registry changes (file watcher triggers reload
    // which eventually fires an event; we use a FileSystemWatcher as proxy).
    const registryWatcher = vscode.workspace.createFileSystemWatcher('**/characters.json');
    this.disposables.push(
      registryWatcher,
      registryWatcher.onDidChange(() => {
        this.rebuild(this.dataProvider.getSnapshot());
      }),
      registryWatcher.onDidCreate(() => {
        this.rebuild(this.dataProvider.getSnapshot());
      }),
      registryWatcher.onDidDelete(() => {
        this.rebuild(this.dataProvider.getSnapshot());
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Graph construction
  // ---------------------------------------------------------------------------

  private rebuild(snapshot: CrossModalDataSnapshot): void {
    this.nodes.clear();
    this.edges = [];

    this.buildRegistryNodes();
    this.buildCanvasNodesAndEdges(snapshot.canvasNodes);
    this.buildAssetNodesAndEdges(snapshot.assetEntities);
    this.buildGeneratedAssetNodesAndEdges(snapshot.generatedAssets);
    this.buildEntityAssetBindingEdges(snapshot.entityAssetBindings ?? []);

    this.onDidUpdateEmitter.fire();
  }

  private buildRegistryNodes(): void {
    const registry = this.characterIndex.getRegistry();
    if (!registry) {
      return;
    }

    for (const record of registry.characters) {
      this.addNode({
        id: record.id,
        kind: 'entity',
        refId: record.id,
        label: record.canonicalName,
      });

      if (record.defaults?.galleryNodeId) {
        this.addEdge(
          record.id,
          `canvas:${record.defaults.galleryNodeId}`,
          'default-visual-for',
          'user',
        );
      }

      if (record.bindings?.assetEntityIds) {
        for (const assetEntityId of record.bindings.assetEntityIds) {
          this.addEdge(record.id, `asset:${assetEntityId}`, 'depicts-character', 'user');
        }
      }
    }
  }

  private buildCanvasNodesAndEdges(canvasNodes: readonly CanvasNode[]): void {
    for (const node of canvasNodes) {
      if (node.type === 'gallery') {
        const gallery = node as GalleryCanvasNode;
        this.addNode({
          id: `canvas:${gallery.id}`,
          kind: 'canvas-node',
          refId: gallery.id,
          label: gallery.data.characterName ?? gallery.data.preset,
        });

        if (gallery.data.characterId) {
          this.addEdge(
            `canvas:${gallery.id}`,
            gallery.data.characterId,
            'depicts-character',
            'lineage',
          );
        }
      } else if (node.type === 'shot') {
        const shot = node as ShotCanvasNode;
        this.addNode({
          id: `canvas:${shot.id}`,
          kind: 'canvas-node',
          refId: shot.id,
          label: `Shot #${shot.data.shotNumber}`,
        });

        if (shot.data.sceneGroupId) {
          this.addEdge(
            `canvas:${shot.id}`,
            `canvas:${shot.data.sceneGroupId}`,
            'appears-in-scene',
            'lineage',
          );
        }

        if (shot.data.characters) {
          for (const character of shot.data.characters) {
            if (character.characterId) {
              this.addEdge(
                character.characterId,
                `canvas:${shot.id}`,
                'appears-in-shot',
                'lineage',
              );
            }
          }
        }
      } else if (node.type === 'scene') {
        const scene = node as SceneGroupCanvasNode;
        this.addNode({
          id: `canvas:${scene.id}`,
          kind: 'canvas-node',
          refId: scene.id,
          label: scene.data.sceneTitle,
        });

        if (scene.data.sceneId) {
          this.addEdge(
            `canvas:${scene.id}`,
            `scene:${scene.data.sceneId}`,
            'set-in-scene',
            'lineage',
          );
        }
      }
    }
  }

  private buildAssetNodesAndEdges(entities: readonly AssetEntity[]): void {
    for (const entity of entities) {
      const registryId = entity.metadata.character?.registryId;

      if (registryId) {
        this.addNode({
          id: `asset:${entity.id}`,
          kind: 'asset',
          refId: entity.id,
          label: entity.name,
        });

        this.addEdge(`asset:${entity.id}`, registryId, 'depicts-character', 'user');
      }
    }
  }

  private buildGeneratedAssetNodesAndEdges(assets: readonly GeneratedAsset[]): void {
    for (const asset of assets) {
      if (!asset.characterIds?.length && !asset.sourceNodeId) {
        continue;
      }

      const nodeId = `generated:${asset.id}`;
      this.addNode({
        id: nodeId,
        kind: 'generated-asset',
        refId: asset.id,
        label: asset.prompt ?? asset.id,
      });

      if (asset.characterIds) {
        for (const characterId of asset.characterIds) {
          this.addEdge(nodeId, characterId, 'depicts-character', 'lineage');
        }
      }

      if (asset.sourceNodeId) {
        this.addEdge(nodeId, `canvas:${asset.sourceNodeId}`, 'generated-from', 'lineage');
      }
    }
  }

  private buildEntityAssetBindingEdges(bindings: readonly EntityAssetBinding[]): void {
    for (const binding of bindings) {
      if (binding.status !== 'confirmed') {
        continue;
      }

      const nodeId = `asset-ref:${binding.assetRef}`;
      this.addNode({
        id: nodeId,
        kind: 'asset',
        refId: binding.assetRef,
        label: binding.role,
      });

      this.addEdge(
        binding.entityId,
        nodeId,
        'bound-to-representation',
        toBindingProvenance(binding.source),
        binding.confidence,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private addNode(node: CreativeGraphNode): void {
    this.nodes.set(node.id, node);
  }

  private addEdge(
    from: string,
    to: string,
    type: CreativeRelationEdgeType,
    provenance: CreativeRelationProvenance,
    confidence?: number,
  ): void {
    this.edges.push({
      from,
      to,
      type,
      strength: 'confirmed',
      confidence,
      provenance,
    });
  }
}

function toBindingProvenance(source: EntityAssetBindingSource): CreativeRelationProvenance {
  switch (source) {
    case 'user':
      return 'user';
    case 'importer':
      return 'import';
    case 'agent':
    case 'matcher':
      return 'ai';
    case 'story':
    case 'canvas':
      return 'lineage';
  }
}
