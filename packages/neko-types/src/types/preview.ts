/**
 * Engine-first preview contracts shared by Extension Host, Webview-facing code,
 * and engine clients.
 *
 * Keep this file platform-neutral: no DOM, React, or VSCode types.
 */

export type PreviewAssetKind = 'image' | 'video' | 'audio' | 'document' | 'unknown';

export type PreviewManifestStatus = 'ready' | 'requires-proxy' | 'stream-required' | 'unsupported';

export type PreviewProjectionType = 'flat' | 'equirectangular' | 'cubemap' | 'fisheye' | 'unknown';

export type PreviewProjectionConfidence = 'explicit' | 'trusted-filename' | 'heuristic' | 'none';

export type PreviewDynamicRange = 'sdr' | 'hdr' | 'unknown';

export type PreviewToneMapping = 'none' | 'aces' | 'reinhard' | 'filmic';

export type PanoramaViewMode = 'sphere' | 'flat' | 'little-planet';

export type PreviewVariantRole =
  | 'source'
  | 'proxy'
  | 'thumbnail'
  | 'fov-crop'
  | 'tile'
  | 'stream'
  | 'screenshot'
  | 'unsupported';

export interface PreviewDimensions {
  readonly width: number;
  readonly height: number;
}

export interface PreviewProjectionMetadata {
  readonly type: PreviewProjectionType;
  readonly confidence: PreviewProjectionConfidence;
  readonly source: 'metadata' | 'filename' | 'aspect-ratio' | 'extension' | 'manual' | 'unknown';
  readonly requiresConfirmation?: boolean;
  readonly croppedAreaPixels?: PreviewDimensions;
  readonly fullPanoPixels?: PreviewDimensions;
}

export interface PreviewCodecMetadata {
  readonly container?: string;
  readonly imageFormat?: string;
  readonly videoCodec?: string;
  readonly audioCodec?: string;
  readonly pixelFormat?: string;
  readonly colorSpace?: string;
  readonly durationSecs?: number;
  readonly fps?: number;
  readonly hasAudio?: boolean;
}

export interface PreviewMediaMetadata {
  readonly dimensions?: PreviewDimensions;
  readonly fileSizeBytes: number;
  readonly mimeType: string;
  readonly dynamicRange: PreviewDynamicRange;
  readonly bitDepth?: number;
  readonly codec?: PreviewCodecMetadata;
}

export interface PreviewErrorState {
  readonly code:
    | 'unsupported-format'
    | 'proxy-required'
    | 'probe-failed'
    | 'source-missing'
    | 'engine-unavailable'
    | 'unknown';
  readonly message: string;
  readonly recoverable: boolean;
}

export interface PreviewStreamDescriptor {
  readonly streamId: string;
  readonly wsUrl?: string;
  readonly audioStreamId?: string;
  readonly audioWsUrl?: string;
  readonly container: 'h264-annexb' | 'h264-avcc' | 'fmp4' | 'native' | 'unknown';
  readonly codecString?: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
}

export interface PreviewTileTemplate {
  readonly urlTemplate: string;
  readonly tileSize: number;
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly overlap?: number;
}

export interface PreviewVariant {
  readonly id: string;
  readonly assetId: string;
  readonly role: PreviewVariantRole;
  readonly url?: string;
  readonly token?: string;
  readonly mimeType?: string;
  readonly dimensions?: PreviewDimensions;
  readonly fileSizeBytes?: number;
  readonly tileTemplate?: PreviewTileTemplate;
  readonly stream?: PreviewStreamDescriptor;
  readonly viewState?: PanoramaViewState;
  readonly error?: PreviewErrorState;
}

export interface PanoramaViewState {
  readonly mode: PanoramaViewMode;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly fovDeg: number;
  readonly exposure: number;
  readonly toneMapping: PreviewToneMapping;
}

export interface PreviewManifest {
  readonly manifestVersion: 1;
  readonly assetId: string;
  readonly token: string;
  readonly kind: PreviewAssetKind;
  readonly status: PreviewManifestStatus;
  readonly sourceName: string;
  readonly sourceUrl?: string;
  readonly projection: PreviewProjectionMetadata;
  readonly media: PreviewMediaMetadata;
  readonly defaultViewState?: PanoramaViewState;
  readonly variants: readonly PreviewVariant[];
  readonly error?: PreviewErrorState;
  readonly createdAt: string;
  readonly expiresAt?: string;
}

export interface RegisterPreviewAssetRequest {
  readonly source: string;
  readonly kind?: PreviewAssetKind;
  readonly expectedProjection?: PreviewProjectionType;
  readonly explicitOpen?: boolean;
}

export interface PreviewVariantRequest {
  readonly role: PreviewVariantRole;
  readonly viewState?: PanoramaViewState;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly format?: 'jpeg' | 'png' | 'webp';
}

export interface EnvironmentPlacement {
  readonly sourceAssetId: string;
  readonly sourceUri?: string;
  readonly mode: 'skybox' | 'ibl' | 'background-and-ibl';
  readonly rotationDeg: number;
  readonly intensity: number;
  readonly exposure: number;
  readonly visibleAsBackground: boolean;
}

export const DEFAULT_PANORAMA_VIEW_STATE: PanoramaViewState = {
  mode: 'sphere',
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  fovDeg: 75,
  exposure: 0,
  toneMapping: 'aces',
};
