/**
 * NekoCanvas API - Exported interface for other extensions
 */
import * as vscode from 'vscode';
import type { CanvasNode, CanvasNodeType } from '@neko/shared';

// Types
export interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'text' | 'other';
  path: string;
  thumbnail?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
    mimeType?: string;
  };
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AssetFilter {
  type?: Asset['type'];
  tags?: string[];
  search?: string;
}

export interface CanvasConfig {
  name: string;
  width: number;
  height: number;
  backgroundColor?: string;
}

export interface ShapeConfig {
  type: 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  properties?: Record<string, unknown>;
}

export interface AssetChangeEvent {
  type: 'add' | 'update' | 'delete';
  assetId: string;
}

export interface CanvasChangeEvent {
  type: 'add' | 'update' | 'delete';
  nodeId?: string;
  nodeIds?: string[];
  shapeId?: string;
  entityType?: 'node' | 'connection' | 'selection' | 'generation' | 'import' | 'operation';
  reason?: string;
  operationType?: string;
}

/**
 * NekoCanvas API interface exported to other extensions
 */
export interface NekoCanvasAPI {
  /**
   * Asset operations.
   * This namespace is a restricted proxy to neko-assets, not an asset fact source.
   */
  asset: {
    /**
     * Import asset from file path
     */
    import(path: string): Promise<Asset>;

    /**
     * List assets with optional filter
     */
    list(filter?: AssetFilter): Promise<Asset[]>;

    /**
     * Get asset by ID
     */
    getById(id: string): Promise<Asset | undefined>;
  };

  /**
   * Canvas operations
   */
  canvas: {
    /**
     * Create new canvas
     * @returns Canvas ID
     */
    create(config: CanvasConfig): Promise<string>;

    /**
     * Add shape to canvas
     * @returns Shape ID
     */
    addShape(canvasId: string, shape: ShapeConfig): Promise<string>;

    /**
     * Update shape
     */
    updateShape(canvasId: string, shapeId: string, updates: Partial<ShapeConfig>): Promise<void>;

    /**
     * Delete shape
     */
    deleteShape(canvasId: string, shapeId: string): Promise<void>;
  };

  /**
   * Canvas node operations — primary API for neko-agent Canvas MCP tools
   */
  nodes: {
    /** List all nodes on the active canvas, optionally filtered by type */
    list(type?: CanvasNodeType): Promise<CanvasNode[]>;
    /** Get a single node by ID */
    get(nodeId: string): Promise<CanvasNode | undefined>;
    /** Update a node's data fields */
    update(nodeId: string, data: Record<string, unknown>): Promise<void>;
    /** Create a new node; returns the new node's ID */
    create(type: CanvasNodeType, position: { x: number; y: number }, data: object): Promise<string>;
    /** Trigger image generation for a ShotNode or a specific GalleryCell */
    generateImage(nodeId: string, cellId?: string): Promise<void>;
    /** Trigger batch image generation for multiple nodes */
    generateBatch(nodeIds: string[]): Promise<void>;
    /** Fired whenever the canvas selection changes */
    onSelectionChange: vscode.Event<CanvasNode[]>;
  };

  /**
   * Event subscriptions
   */
  events: {
    /**
     * Fired when assets change
     */
    onDidChangeAssets: vscode.Event<AssetChangeEvent>;

    /**
     * Fired when canvas changes
     */
    onDidChangeCanvas: vscode.Event<CanvasChangeEvent>;
  };
}
