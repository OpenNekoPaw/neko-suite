/**
 * Media Engine Capabilities
 *
 * Defines capability detection types for media engines.
 */
/**
 * Supported video codec identifiers
 */
export type VideoCodecId = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1' | 'prores' | 'dnxhd';
/**
 * Supported audio codec identifiers
 */
export type AudioCodecId = 'aac' | 'mp3' | 'opus' | 'vorbis' | 'flac' | 'pcm' | 'ac3' | 'dts';
/**
 * Video codec capability
 */
export interface VideoCodecCapability {
    /** Codec identifier */
    codec: VideoCodecId;
    /** Whether decoding is supported */
    decode: boolean;
    /** Whether encoding is supported */
    encode: boolean;
    /** Supported profiles (e.g., 'baseline', 'main', 'high' for H.264) */
    profiles?: string[];
    /** Maximum supported bitrate in bps */
    maxBitrate?: number;
    /** Maximum supported resolution */
    maxResolution?: {
        width: number;
        height: number;
    };
    /** Whether hardware acceleration is available */
    hardwareAccelerated?: boolean;
}
/**
 * Audio codec capability
 */
export interface AudioCodecCapability {
    /** Codec identifier */
    codec: AudioCodecId;
    /** Whether decoding is supported */
    decode: boolean;
    /** Whether encoding is supported */
    encode: boolean;
    /** Maximum supported sample rate in Hz */
    maxSampleRate?: number;
    /** Maximum supported channels */
    maxChannels?: number;
    /** Supported bit depths */
    bitDepths?: number[];
}
/**
 * Hardware acceleration type
 */
export type HardwareAccelType = 'videotoolbox' | 'nvenc' | 'vaapi' | 'qsv' | 'd3d11va' | 'webgpu';
/**
 * Hardware acceleration info
 */
export interface HardwareAccelInfo {
    /** Whether hardware acceleration is available */
    available: boolean;
    /** Hardware acceleration type */
    type?: HardwareAccelType;
    /** Device name */
    deviceName?: string;
    /** Supported decoders */
    decoders?: string[];
    /** Supported encoders */
    encoders?: string[];
    /** Recommended decoder */
    recommendedDecoder?: string;
    /** Recommended encoder */
    recommendedEncoder?: string;
}
/**
 * Media engine capabilities
 *
 * Describes what a media engine can do, used for mode selection
 * and feature availability checks.
 */
export interface MediaEngineCapabilities {
    /** Supported video codecs */
    videoCodecs: VideoCodecCapability[];
    /** Supported audio codecs */
    audioCodecs: AudioCodecCapability[];
    /** Supported container formats */
    containerFormats: string[];
    /** Whether hardware acceleration is available */
    hardwareAcceleration: boolean;
    /** Hardware acceleration details */
    hwAccelInfo?: HardwareAccelInfo;
    /** Maximum supported resolution */
    maxResolution: {
        width: number;
        height: number;
    };
    /** Whether HDR is supported */
    hdrSupport: boolean;
    /** Whether this engine requires Webview to be active */
    requiresWebview: boolean;
    /** Whether GPU effects processing is available */
    gpuEffects: boolean;
    /** GPU backend (if GPU effects available) */
    gpuBackend?: 'webgpu' | 'webgl' | 'wgpu';
}
/**
 * Check if capabilities support a specific video codec for decoding
 */
export declare function canDecodeVideo(capabilities: MediaEngineCapabilities, codec: string): boolean;
/**
 * Check if capabilities support a specific video codec for encoding
 */
export declare function canEncodeVideo(capabilities: MediaEngineCapabilities, codec: string): boolean;
/**
 * Check if capabilities support a specific audio codec for decoding
 */
export declare function canDecodeAudio(capabilities: MediaEngineCapabilities, codec: string): boolean;
/**
 * Check if capabilities support a specific audio codec for encoding
 */
export declare function canEncodeAudio(capabilities: MediaEngineCapabilities, codec: string): boolean;
/**
 * Check if capabilities support a specific container format
 */
export declare function supportsContainer(capabilities: MediaEngineCapabilities, container: string): boolean;
/**
 * Default capabilities for basic mode (WebCodecs + FFmpeg.wasm + WebGPU)
 */
export declare const BASIC_MODE_CAPABILITIES: MediaEngineCapabilities;
/**
 * Default capabilities for compatible mode (Native FFmpeg + wgpu)
 */
export declare const COMPATIBLE_MODE_CAPABILITIES: MediaEngineCapabilities;
//# sourceMappingURL=capabilities.d.ts.map