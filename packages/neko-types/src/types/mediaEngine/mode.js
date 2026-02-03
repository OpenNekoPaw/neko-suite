/**
 * Media Engine Mode Types
 *
 * Defines the runtime modes for the progressive media processing architecture.
 */
// =============================================================================
// Basic Mode Supported Formats
// =============================================================================
/**
 * Video codecs supported by basic mode (WebCodecs)
 */
export const BASIC_MODE_VIDEO_CODECS = ['h264', 'vp8', 'vp9'];
/**
 * Audio codecs supported by basic mode (FFmpeg.wasm + Web Audio)
 */
export const BASIC_MODE_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm'];
/**
 * Container formats supported by basic mode
 */
export const BASIC_MODE_CONTAINERS = ['mp4', 'webm', 'ogg', 'mov'];
/**
 * Check if a video codec is supported by basic mode
 */
export function isBasicModeVideoCodec(codec) {
    return BASIC_MODE_VIDEO_CODECS.includes(codec.toLowerCase());
}
/**
 * Check if an audio codec is supported by basic mode
 */
export function isBasicModeAudioCodec(codec) {
    return BASIC_MODE_AUDIO_CODECS.includes(codec.toLowerCase());
}
/**
 * Check if a container format is supported by basic mode
 */
export function isBasicModeContainer(container) {
    return BASIC_MODE_CONTAINERS.includes(container.toLowerCase());
}
//# sourceMappingURL=mode.js.map