/**
 * Extension API Types
 *
 * Defines the public API interfaces that Neko extensions export
 * for inter-extension communication via VSCode Extension API.
 *
 * Usage:
 * - neko-cut exports NekoCutAPI
 * - neko-canvas exports NekoCanvasAPI
 * - neko-agent discovers and calls these APIs via vscode.extensions.getExtension()
 */

// =============================================================================
// NekoCut API
// =============================================================================

/**
 * Timeline element configuration for adding new elements
 */
export interface TimelineElementConfig {
  type: 'video' | 'audio' | 'image' | 'text' | 'shape' | 'subtitle';
  trackId: string;
  startTime: number;
  duration: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * Timeline element update payload
 */
export interface TimelineElementUpdate {
  startTime?: number;
  duration?: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * Timeline information
 */
export interface TimelineInfo {
  duration: number;
  fps: number;
  width: number;
  height: number;
  trackCount: number;
}

/**
 * Timeline element representation (for API response)
 */
export interface NekoCutTimelineElement {
  id: string;
  type: string;
  trackId: string;
  startTime: number;
  duration: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * NekoCut Extension API
 * Exported by neko-cut extension for timeline manipulation
 */
export interface NekoCutAPI {
  timeline: {
    /**
     * Get information about the current timeline
     */
    getInfo(): Promise<TimelineInfo>;

    /**
     * Add a new element to the timeline
     * @returns The ID of the created element
     */
    addElement(config: TimelineElementConfig): Promise<string>;

    /**
     * Update an existing timeline element
     */
    updateElement(id: string, updates: TimelineElementUpdate): Promise<void>;

    /**
     * Delete an element from the timeline
     */
    deleteElement(id: string): Promise<void>;

    /**
     * List all elements in the timeline
     */
    listElements(): Promise<NekoCutTimelineElement[]>;
  };
}

// =============================================================================
// NekoCanvas API
// =============================================================================

/**
 * Asset filter options
 */
export interface AssetFilter {
  type?: 'video' | 'audio' | 'image' | 'text' | 'other';
  search?: string;
}

/**
 * Asset representation
 */
export interface Asset {
  id: string;
  name: string;
  type: string;
  path: string;
  thumbnail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Canvas configuration for creation
 */
export interface CanvasConfig {
  name: string;
  width: number;
  height: number;
  backgroundColor?: string;
}

/**
 * Shape configuration for canvas
 */
export interface ShapeConfig {
  type: 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  [key: string]: unknown;
}

/**
 * NekoCanvas Extension API
 * Exported by neko-canvas extension for asset and canvas manipulation
 */
export interface NekoCanvasAPI {
  asset: {
    /**
     * Import an asset file into the library
     */
    import(path: string): Promise<Asset>;

    /**
     * List assets with optional filtering
     */
    list(filter?: AssetFilter): Promise<Asset[]>;

    /**
     * Get an asset by ID
     */
    getById(id: string): Promise<Asset | null>;
  };

  canvas: {
    /**
     * Create a new canvas
     * @returns The ID of the created canvas
     */
    create(config: CanvasConfig): Promise<string>;

    /**
     * Add a shape to a canvas
     * @returns The ID of the created shape
     */
    addShape(canvasId: string, shape: ShapeConfig): Promise<string>;
  };
}

// =============================================================================
// Extension Discovery Constants
// =============================================================================

/**
 * VSCode extension IDs for Neko suite extensions
 */
export const NEKO_EXTENSION_IDS = {
  NEKO_CUT: 'neko.nekocut',
  NEKO_CANVAS: 'neko.nekocanvas',
  NEKO_AGENT: 'neko.nekoagent',
} as const;
