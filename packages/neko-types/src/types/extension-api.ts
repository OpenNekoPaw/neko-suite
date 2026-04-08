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

import type { Event } from 'vscode';
import type {
  CanvasNode,
  CanvasNodeType,
  ShotCanvasNode,
  SceneGroupCanvasNode,
  GalleryCanvasNode,
} from './canvas';
import type { ProjectData } from './project';

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

  /**
   * AI-powered generation capabilities.
   * All methods are no-ops (return rejected promise) when neko-agent is not installed.
   */
  ai: {
    /**
     * Generate a video clip from a text prompt and optionally a reference image.
     * The generated clip is automatically imported into the asset library and added
     * to the timeline at the specified position.
     *
     * @returns The ID of the newly created timeline element.
     */
    generateVideoForClip(options: {
      prompt: string;
      /** Track to insert into (default: first video track) */
      trackId?: string;
      /** Start time in seconds (default: end of track) */
      startTime?: number;
      /** Reference image base64 for image-to-video generation */
      referenceImageBase64?: string;
      /** Duration hint in seconds — actual duration depends on provider */
      durationHint?: number;
    }): Promise<string>;
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

/** Partial update data for canvas nodes managed by the agent */
export type CanvasNodeUpdateData =
  | Partial<ShotCanvasNode['data']>
  | Partial<SceneGroupCanvasNode['data']>
  | Partial<GalleryCanvasNode['data']>;

/**
 * Fired when an asset is added, updated, or removed from the canvas asset library.
 * Distinct from the asset-registry AssetChangeEvent to avoid naming conflicts.
 */
export interface NekoCanvasAssetChangeEvent {
  readonly type: 'add' | 'update' | 'delete';
  readonly assetId: string;
}

/**
 * Fired when nodes or shapes on the active canvas change.
 */
export interface CanvasChangeEvent {
  readonly type: 'add' | 'update' | 'delete';
  readonly nodeId?: string;
  readonly nodeIds?: string[];
  readonly shapeId?: string;
  readonly entityType?: 'node' | 'connection' | 'selection' | 'generation' | 'import' | 'operation';
  readonly reason?: string;
  readonly operationType?: string;
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

  nodes: {
    /**
     * List all nodes on the active canvas, optionally filtered by type
     */
    list(type?: CanvasNodeType): Promise<CanvasNode[]>;

    /**
     * Get a single node by ID
     */
    get(nodeId: string): Promise<CanvasNode | undefined>;

    /**
     * Update a node's data fields
     */
    update(nodeId: string, data: CanvasNodeUpdateData): Promise<void>;

    /**
     * Create a new node at the given canvas position
     * @returns The ID of the created node
     */
    create(type: CanvasNodeType, position: { x: number; y: number }, data: object): Promise<string>;

    /**
     * Trigger image generation for a ShotNode or a specific GalleryCell.
     * Delegates to BatchGenerationScheduler.
     */
    generateImage(nodeId: string, cellId?: string): Promise<void>;

    /**
     * Trigger batch image generation for multiple nodes
     */
    generateBatch(nodeIds: string[]): Promise<void>;

    /**
     * Fired whenever the canvas selection changes.
     * Ambient context listener for neko-agent.
     */
    onSelectionChange: Event<CanvasNode[]>;
  };

  /**
   * Cross-extension event subscriptions.
   * neko-agent subscribes to these to track canvas state for ambient context.
   */
  events: {
    /**
     * Fired whenever an asset is added, updated, or deleted in the project library.
     */
    onDidChangeAssets: Event<NekoCanvasAssetChangeEvent>;

    /**
     * Fired whenever nodes or shapes on the active canvas are added, updated, or deleted.
     */
    onDidChangeCanvas: Event<CanvasChangeEvent>;
  };
}

// =============================================================================
// NekoStory API
// =============================================================================

/**
 * Structured representation of a scene in a Fountain screenplay.
 * `line_start` / `line_end` are 0-based line numbers enabling
 * `Read(offset=line_start, limit=line_end-line_start+1)` access patterns.
 */
export interface NekoStorySceneEntry {
  readonly id: string;
  readonly heading: string;
  readonly intExt: string | null;
  readonly location: string;
  readonly time: string | null;
  readonly line_start: number;
  readonly line_end: number;
}

/**
 * Aggregated character information within a single Fountain file.
 */
export interface NekoStoryCharacterEntry {
  readonly name: string;
  readonly first_line: number;
  readonly scene_ids: readonly string[];
}

/**
 * Agent-accessible structured representation of a Fountain screenplay file.
 */
export interface NekoStoryScriptIndex {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly NekoStorySceneEntry[];
  readonly characters: readonly NekoStoryCharacterEntry[];
}

/**
 * Minimal structural representation of a parsed Fountain document.
 * Returned by NekoStoryAPI.parseScript — consumers iterate elements for
 * headings, action lines, dialogue, etc.
 */
export interface NekoStoryParsedScript {
  readonly title?: string;
  readonly elements: ReadonlyArray<{
    readonly type: string;
    readonly text: string;
    readonly [key: string]: unknown;
  }>;
}

/**
 * Result of converting a Fountain screenplay to a neko-cut ProjectData timeline.
 * Returned by NekoStoryAPI.convertToTimeline.
 */
export interface NekoStoryConversionResult {
  /** The generated ProjectData ready to be saved as a .nkv file */
  readonly project: ProjectData;
  /** Number of scene headings found */
  readonly sceneCount: number;
  /** Total estimated timeline duration in seconds */
  readonly totalDurationSec: number;
  /** Deduplicated character names (upper-case) */
  readonly characterNames: readonly string[];
}

/**
 * NekoStory Extension API
 * Exported by neko-story extension for screenplay parsing and index access
 */
export interface NekoStoryAPI {
  /**
   * Parse Fountain screenplay text into a structured document.
   * Useful for inspecting element types before converting to a timeline.
   */
  parseScript(content: string): NekoStoryParsedScript;

  /**
   * Convert a Fountain screenplay to a neko-cut timeline ProjectData.
   * The result's `project` field can be saved directly as a .nkv file.
   */
  convertToTimeline(fountainContent: string, projectName?: string): NekoStoryConversionResult;

  /**
   * Returns a structured ScriptIndex for the given file path or URI string.
   * Returns undefined if the file has not been indexed yet.
   */
  getScriptIndex(uriOrPath: string): NekoStoryScriptIndex | undefined;
}

// =============================================================================
// NekoSketch API
// =============================================================================

/**
 * Source context for images imported into neko-sketch from other modules.
 * Used to enable round-trip "send back" workflow buttons.
 */
export interface SketchImportContext {
  /** Module that initiated the import */
  source: 'canvas' | 'cut' | 'preview' | 'agent';
  /** Source canvas node ID (ShotNode / GalleryNode) */
  sourceNodeId?: string;
  /** Source cut clip ID */
  sourceClipId?: string;
  /** Additional metadata (prompt, cellId, shotNumber, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Selection state data for AI inpainting operations.
 * Returned by `getSelectionMask()`.
 */
export interface SketchSelectionData {
  /** Bounding box of the selection in canvas coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Grayscale mask PNG (base64): white = selected, black = unselected */
  mask: string;
  /** Base64 PNG of the composite canvas (used as the source image for inpainting) */
  layerImageData: string;
}

/**
 * NekoSketch Extension API
 * Exported by neko-sketch extension for programmatic canvas access.
 */
export interface NekoSketchAPI {
  /**
   * Import an image (base64-encoded PNG/JPEG) into the active sketch canvas
   * as a new raster layer. No-ops silently when no sketch editor is open.
   */
  importImageData(base64: string, name: string): void;

  /**
   * Import an image with a source context to enable round-trip workflow buttons
   * (Back to Canvas, Send to Timeline). If no sketch editor is currently open,
   * stores the import as pending and injects it once the next editor becomes ready.
   */
  importImageWithContext(base64: string, name: string, context: SketchImportContext): void;

  /**
   * Export the current sketch canvas composite as a base64 PNG.
   * Returns null when no sketch editor is open or canvas data is unavailable.
   */
  exportCanvas(): Promise<string | null>;

  /** Whether a sketch editor is currently open and active. */
  isActive(): boolean;

  /**
   * Get the current rectangular selection mask for AI inpainting.
   * Returns null when there is no active selection in the sketch editor.
   */
  getSelectionMask(): Promise<SketchSelectionData | null>;

  /**
   * Get the pixel data of the specified layer (or the active layer) as base64 PNG.
   * Falls back to the composite canvas when individual layer extraction is unsupported.
   * Returns null when no sketch editor is open.
   */
  getLayerImageData(layerId?: string): Promise<string | null>;

  /**
   * Get the composite canvas image (all visible layers) as base64 PNG.
   * Returns null when no sketch editor is open.
   */
  getCanvasImageData(): Promise<string | null>;
}

// =============================================================================
// NekoPuppet API
// =============================================================================

/**
 * NekoPuppet Extension API
 * Exported by neko-puppet extension for programmatic face parameter access.
 *
 * The standard face parameters are defined in puppet-face-params.ts (32 params).
 * Values are keyed by the stable `PuppetFaceParameter.id` field.
 */
export interface NekoPuppetAPI {
  /**
   * Get the current face parameter values for the active puppet model.
   * Returns a Record keyed by parameter id (e.g. "faceWidth", "eyeOpenL") with numeric values.
   * Returns an empty record when no puppet editor is open.
   */
  getCurrentFaceParams(): Record<string, number>;

  /**
   * Set one or more face parameters on the active puppet model.
   * Keys must be valid PuppetFaceParameter ids. Values are clamped to each parameter's [min, max].
   * Silently no-ops when no puppet editor is open.
   */
  setFaceParams(params: Record<string, number>): Promise<void>;
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
  NEKO_STORY: 'neko.neko-story',
  NEKO_SKETCH: 'neko.neko-sketch',
  NEKO_PUPPET: 'neko.neko-puppet',
  NEKO_AUTH: 'neko.neko-auth',
} as const;

// =============================================================================
// P3: Skill Provider Interface
// =============================================================================

/**
 * A single capability advertised by a plugin for discovery in the agent UI.
 *
 * Skills appear in the agent's skill browser and can be invoked directly by
 * the user or matched automatically by the LLM when the user's intent aligns
 * with the skill description.
 */
export interface SkillDef {
  /** Unique within the owning extension, e.g. "batch-generate" */
  readonly id: string;
  /** Short display name shown in the skill browser (e.g. "Batch Generate Images") */
  readonly name: string;
  /** One-sentence description for LLM intent matching */
  readonly description: string;
  /** Optional emoji or codicon name (\$(symbol-name)) for the skill icon */
  readonly icon?: string;
  /**
   * VSCode command to invoke when the skill is selected.
   * The agent passes `{ intent?: string }` as the first argument.
   */
  readonly command: string;
  /**
   * Broad capability categories for filtering in the skill browser.
   * @example ['generation', 'image']
   */
  readonly tags?: readonly string[];
}

/**
 * Interface that Neko extensions implement to advertise their AI capabilities.
 *
 * Extensions that expose `ISkillProvider` as part of their exported API allow
 * neko-agent to enumerate all installed skills across the suite without
 * hard-coding plugin names.
 *
 * @example
 * // In neko-canvas/extension.ts activate():
 * const api: NekoCanvasAPI & ISkillProvider = {
 *   ...existingApi,
 *   getSkills: () => [{ id: 'batch', name: 'Batch Generate', ... }],
 * };
 * return api;
 */
export interface ISkillProvider {
  /**
   * Returns the list of skills exposed by this extension.
   * The agent calls this once on activation and re-calls on `vscode.extensions.onDidChange`.
   */
  getSkills(): readonly SkillDef[];
}
