/**
 * Media Processing Protocol - Compatible Mode Types
 *
 * Compatible mode rendering protocol for Extension-side rendering.
 */

// =============================================================================
// Compatible Mode Rendering Protocol (Extension-side rendering for preview)
// =============================================================================

/**
 * Base media request type (for compatible mode requests)
 */
interface BaseMediaRequest {
  /** Request ID for matching response */
  requestId: string;
  /** Request timestamp */
  timestamp: number;
}

/**
 * Composite layer configuration for Extension-side rendering
 */
export interface CompositeLayerConfig {
  /** Video/image file path */
  source: string;
  /** Source media time point (seconds) */
  sourceTime: number;
  /** Transform settings */
  transform: {
    /** X position (pixels) */
    x: number;
    /** Y position (pixels) */
    y: number;
    /** X scale factor (1.0 = original) */
    scaleX: number;
    /** Y scale factor (1.0 = original) */
    scaleY: number;
    /** Rotation in degrees */
    rotation: number;
    /** Anchor X (0-1, default 0.5 = center) */
    anchorX: number;
    /** Anchor Y (0-1, default 0.5 = center) */
    anchorY: number;
  };
  /** Opacity (0-1) */
  opacity: number;
  /** Z-index for ordering (higher = on top) */
  zIndex: number;
}

/**
 * Render composite frame request (Compatible mode)
 * Extension端使用 FFmpeg + wgpu 合成多层并返回渲染结果
 */
export interface RenderCompositeFrameRequest extends BaseMediaRequest {
  type: 'media:renderCompositeFrame';
  payload: {
    /** Layers to composite (ordered by zIndex) */
    layers: CompositeLayerConfig[];
    /** Timeline time point (seconds) */
    time: number;
    /** Output width in pixels */
    width: number;
    /** Output height in pixels */
    height: number;
    /** Background color RGBA (0-255) */
    backgroundColor?: [number, number, number, number];
  };
}

/**
 * Render composite frame response
 */
export interface RenderCompositeFrameResponse {
  requestId: string;
  type: 'media:response:renderCompositeFrame';
  error?: string;
  payload?: {
    /** Binary JPEG data (preferred, more efficient) */
    imageData?: Uint8Array;
    /** Rendered image as base64 data URL (legacy fallback) */
    imageDataUrl?: string;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
  };
}

/**
 * Get single video frame request (Compatible mode)
 * For compatible mode preview - Extension端解码单帧
 */
export interface CompatibleGetVideoFrameRequest extends BaseMediaRequest {
  type: 'media:compatibleGetVideoFrame';
  payload: {
    /** Video file path */
    videoPath: string;
    /** Time point (seconds) */
    timeInSeconds: number;
    /** Output width (optional, use original if not specified) */
    width?: number;
    /** Output height (optional, use original if not specified) */
    height?: number;
  };
}

/**
 * Get single video frame response (Compatible mode)
 */
export interface CompatibleGetVideoFrameResponse {
  requestId: string;
  type: 'media:response:compatibleGetVideoFrame';
  error?: string;
  payload?: {
    /** Frame image as binary JPEG data (preferred, more efficient) */
    imageData?: Uint8Array;
    /** Frame image as base64 data URL (legacy fallback) */
    imageDataUrl?: string;
    /** Frame width */
    width: number;
    /** Frame height */
    height: number;
  };
}

/**
 * All compatible mode request types
 */
export type CompatibleModeRequest = RenderCompositeFrameRequest | CompatibleGetVideoFrameRequest;

/**
 * All compatible mode response types
 */
export type CompatibleModeResponse = RenderCompositeFrameResponse | CompatibleGetVideoFrameResponse;
