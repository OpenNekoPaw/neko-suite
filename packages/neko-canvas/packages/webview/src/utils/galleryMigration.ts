import type {
  CanvasNode,
  ContainerCapability,
  ContainerChildPlacement,
  GalleryCanvasNode,
  GalleryCell,
} from '@neko/shared';

export interface GalleryMigrationResult {
  nodes: CanvasNode[];
  migrated: boolean;
}

export function migrateGalleryV1ToContainer(
  nodes: CanvasNode[],
  generateId: () => string,
): GalleryMigrationResult {
  const galleriesToMigrate = nodes.filter(
    (node): node is GalleryCanvasNode =>
      node.type === 'gallery' && Array.isArray((node as GalleryCanvasNode).data.cells),
  );

  if (galleriesToMigrate.length === 0) {
    return { nodes, migrated: false };
  }

  let nextNodes = [...nodes];
  const newChildren: CanvasNode[] = [];

  for (const gallery of galleriesToMigrate) {
    const cells: GalleryCell[] = gallery.data.cells ?? [];
    const childIds: string[] = [];
    const childPlacements: Record<string, ContainerChildPlacement> = {};

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!;
      const childId = generateId();
      childIds.push(childId);

      const cols = gallery.data.cols ?? 3;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cellWidth = 80;
      const cellHeight = 80;
      const gap = 8;
      const paddingX = 12;
      const paddingTop = 48;

      newChildren.push({
        id: childId,
        type: 'media',
        position: {
          x: gallery.position.x + paddingX + col * (cellWidth + gap),
          y: gallery.position.y + paddingTop + row * (cellHeight + gap),
        },
        size: { width: cellWidth, height: cellHeight },
        zIndex: gallery.zIndex + i + 1,
        parentId: gallery.id,
        data: {
          assetPath: cell.image ?? '',
          mediaType: 'image',
        },
      } as CanvasNode);

      childPlacements[childId] = {
        childId,
        metadata: {
          label: cell.label,
          prompt: cell.prompt,
          generationStatus: cell.generationStatus,
          costumeLabel: cell.costumeLabel,
          generationHistory: cell.generationHistory,
        },
      };
    }

    const container: ContainerCapability = {
      policy: 'gallery',
      childIds,
      layout: { mode: 'gallery' as const },
      acceptedChildren: { nodeTypes: ['media'] },
      deleteBehavior: 'delete-subtree',
      childPlacements,
    };

    nextNodes = nextNodes.map((node) => {
      if (node.id !== gallery.id) return node;
      const { cells: _cells, ...restData } = (node as GalleryCanvasNode).data;
      return {
        ...node,
        data: restData,
        container,
      } as CanvasNode;
    });
  }

  return {
    nodes: [...nextNodes, ...newChildren],
    migrated: true,
  };
}
