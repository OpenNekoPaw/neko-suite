/**
 * Canvas Components - Public exports
 */

export { InfiniteCanvas } from './InfiniteCanvas';
export type { InfiniteCanvasProps } from './InfiniteCanvas';

export { CanvasViewport } from './CanvasViewport';
export type { CanvasViewportProps } from './CanvasViewport';

export { CanvasGrid, GRID_SIZE, GRID_MAJOR_INTERVAL } from './CanvasGrid';
export type { CanvasGridProps } from './CanvasGrid';

export { AlignmentGuides } from './AlignmentGuides';
export type { AlignmentGuidesProps } from './AlignmentGuides';

// Node components
export { BaseNode, MediaNode, StoryboardNode, AnnotationNode, TextNode, ArtboardNode, createArtboardData } from './nodes';
export type {
  BaseNodeProps,
  MediaNodeProps,
  StoryboardNodeProps,
  AnnotationNodeProps,
  TextNodeProps,
  ArtboardNodeProps,
} from './nodes';

// Connection components
export { Connection, ConnectionLayer } from './connections';
export type { ConnectionProps, ConnectionLayerProps } from './connections';

// Control components
export { ZoomControls, MiniMap, LayerPanel } from './controls';
export type { ZoomControlsProps, MiniMapProps, LayerPanelProps } from './controls';

// Media components
export { ImageViewer } from './media';
export type { ImageViewerProps } from './media';
