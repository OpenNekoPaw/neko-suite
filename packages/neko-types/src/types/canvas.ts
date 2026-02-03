// =============================================================================
// Canvas Types - Infinite Canvas Editor Data Model
// =============================================================================

/**
 * Canvas node type discriminator
 */
export type CanvasNodeType = 'media' | 'storyboard' | 'annotation' | 'group';

/**
 * Connection anchor position on a node
 */
export type ConnectionAnchor = 'top' | 'right' | 'bottom' | 'left';

/**
 * Connection type for styling
 */
export type ConnectionType = 'default' | 'sequence' | 'reference';

// =============================================================================
// Node Types
// =============================================================================

/**
 * Base interface for all canvas nodes
 */
export interface CanvasNodeBase {
  /** Unique node identifier */
  id: string;
  /** Node type discriminator */
  type: CanvasNodeType;
  /** Position in canvas coordinates */
  position: { x: number; y: number };
  /** Size in canvas units */
  size: { width: number; height: number };
  /** Z-index for layering */
  zIndex: number;
  /** Whether node is locked from editing */
  locked?: boolean;
}

/**
 * Media asset node - references a media file
 */
export interface MediaCanvasNode extends CanvasNodeBase {
  type: 'media';
  data: {
    /** Relative path to the media file */
    assetPath: string;
    /** Relative path to thumbnail image */
    thumbnailPath?: string;
    /** Media type hint */
    mediaType?: 'video' | 'image' | 'audio';
    /** Duration in seconds (for video/audio) */
    duration?: number;
  };
}

/**
 * Storyboard/scene node - represents a scene or shot
 */
export interface StoryboardCanvasNode extends CanvasNodeBase {
  type: 'storyboard';
  data: {
    /** Scene title */
    title: string;
    /** Scene description */
    description?: string;
    /** Estimated duration in seconds */
    duration?: number;
    /** Color for visual grouping (hex) */
    color?: string;
  };
}

/**
 * Text annotation node
 */
export interface AnnotationCanvasNode extends CanvasNodeBase {
  type: 'annotation';
  data: {
    /** Annotation text content */
    content: string;
    /** Text style options */
    style?: {
      fontSize?: number;
      color?: string;
      backgroundColor?: string;
    };
  };
}

/**
 * Group node - contains other nodes
 */
export interface GroupCanvasNode extends CanvasNodeBase {
  type: 'group';
  data: {
    /** Child node IDs */
    childIds: string[];
    /** Group label */
    label?: string;
    /** Group color (hex) */
    color?: string;
  };
}

/**
 * Union type of all canvas node types
 */
export type CanvasNode =
  | MediaCanvasNode
  | StoryboardCanvasNode
  | AnnotationCanvasNode
  | GroupCanvasNode;

// =============================================================================
// Connection Types
// =============================================================================

/**
 * Connection between two nodes
 */
export interface CanvasConnection {
  /** Unique connection identifier */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Source anchor position */
  sourceAnchor: ConnectionAnchor;
  /** Target node ID */
  targetId: string;
  /** Target anchor position */
  targetAnchor: ConnectionAnchor;
  /** Connection type for styling */
  type?: ConnectionType;
  /** Optional label on the connection */
  label?: string;
}

// =============================================================================
// Viewport Types
// =============================================================================

/**
 * Canvas viewport state (pan and zoom)
 */
export interface CanvasViewport {
  /** Pan offset in canvas coordinates */
  pan: { x: number; y: number };
  /** Zoom level (1 = 100%) */
  zoom: number;
}

// =============================================================================
// Canvas Data (File Format)
// =============================================================================

/**
 * Canvas data structure - persisted to .jvc file
 */
export interface CanvasData {
  /** File format version */
  version: string;
  /** Canvas name */
  name: string;
  /** Viewport state for restoring view */
  viewport?: CanvasViewport;
  /** All nodes on the canvas */
  nodes: CanvasNode[];
  /** All connections between nodes */
  connections: CanvasConnection[];
  /** Linked video project path (relative) */
  linkedProject?: string;
}

// =============================================================================
// Canvas Constants
// =============================================================================

/** Current canvas file format version */
export const CANVAS_VERSION = '1.0';

/** Default canvas data for new files */
export const DEFAULT_CANVAS_DATA: CanvasData = {
  version: CANVAS_VERSION,
  name: 'Untitled Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [],
  connections: [],
};

// =============================================================================
// Type Guards
// =============================================================================

export function isMediaNode(node: CanvasNode): node is MediaCanvasNode {
  return node.type === 'media';
}

export function isStoryboardNode(node: CanvasNode): node is StoryboardCanvasNode {
  return node.type === 'storyboard';
}

export function isAnnotationNode(node: CanvasNode): node is AnnotationCanvasNode {
  return node.type === 'annotation';
}

export function isGroupNode(node: CanvasNode): node is GroupCanvasNode {
  return node.type === 'group';
}
