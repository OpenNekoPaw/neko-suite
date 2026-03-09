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

/**
 * Data type that can flow through a port
 */
export type PortDataType = 'image' | 'video' | 'audio' | 'text' | 'any';

/**
 * Port definition for node input/output
 */
export interface PortDefinition {
  /** Unique port identifier within the node */
  id: string;
  /** Port direction */
  type: 'input' | 'output';
  /** Which side of the node the port appears on */
  position: ConnectionAnchor;
  /** Data type this port accepts/produces */
  dataType?: PortDataType;
  /** Display label for the port */
  label?: string;
  /** Maximum number of connections (default: 1 for input, Infinity for output) */
  maxConnections?: number;
}

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
  /** Port definitions for data-flow connections (optional, backward compatible) */
  ports?: PortDefinition[];
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
  /** Source port ID (for port-based connections) */
  sourcePort?: string;
  /** Target port ID (for port-based connections) */
  targetPort?: string;
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

// =============================================================================
// Port Helpers
// =============================================================================

/** Default ports for media nodes */
export const MEDIA_NODE_PORTS: PortDefinition[] = [
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/** Default ports for storyboard nodes */
export const STORYBOARD_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/** Default ports for annotation nodes (no ports, uses legacy anchors) */
export const ANNOTATION_NODE_PORTS: PortDefinition[] = [];

/** Default ports for group nodes */
export const GROUP_NODE_PORTS: PortDefinition[] = [
  { id: 'in', type: 'input', position: 'left', dataType: 'any', label: 'Input' },
  { id: 'out', type: 'output', position: 'right', dataType: 'any', label: 'Output' },
];

/**
 * Get default ports for a node type.
 * Returns empty array for types that use legacy anchors.
 */
export function getDefaultPorts(nodeType: CanvasNodeType): PortDefinition[] {
  switch (nodeType) {
    case 'media':
      return MEDIA_NODE_PORTS;
    case 'storyboard':
      return STORYBOARD_NODE_PORTS;
    case 'annotation':
      return ANNOTATION_NODE_PORTS;
    case 'group':
      return GROUP_NODE_PORTS;
    default:
      return [];
  }
}

/**
 * Check if two port data types are compatible for connection.
 * 'any' is compatible with everything.
 */
export function arePortTypesCompatible(
  sourceType: PortDataType | undefined,
  targetType: PortDataType | undefined,
): boolean {
  if (!sourceType || !targetType) return true;
  if (sourceType === 'any' || targetType === 'any') return true;
  return sourceType === targetType;
}
