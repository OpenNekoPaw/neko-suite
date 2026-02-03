/**
 * NekoCanvas API - Exported interface for other extensions
 */
import * as vscode from 'vscode';

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
  shapeId?: string;
}

/**
 * NekoCanvas API interface exported to other extensions
 */
export interface NekoCanvasAPI {
  /**
   * Asset operations
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

    /**
     * Delete asset
     */
    delete(id: string): Promise<void>;

    /**
     * Update asset metadata
     */
    update(id: string, updates: Partial<Asset>): Promise<void>;
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
