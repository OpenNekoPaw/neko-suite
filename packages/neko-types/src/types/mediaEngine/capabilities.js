/**
 * Media Engine Capabilities
 *
 * Defines capability detection types for media engines.
 */
// =============================================================================
// Capability Helpers
// =============================================================================
/**
 * Check if capabilities support a specific video codec for decoding
 */
export function canDecodeVideo(capabilities, codec) {
    const codecLower = codec.toLowerCase();
    return capabilities.videoCodecs.some((c) => c.codec === codecLower && c.decode);
}
/**
 * Check if capabilities support a specific video codec for encoding
 */
export function canEncodeVideo(capabilities, codec) {
    const codecLower = codec.toLowerCase();
    return capabilities.videoCodecs.some((c) => c.codec === codecLower && c.encode);
}
/**
 * Check if capabilities support a specific audio codec for decoding
 */
export function canDecodeAudio(capabilities, codec) {
    const codecLower = codec.toLowerCase();
    return capabilities.audioCodecs.some((c) => c.codec === codecLower && c.decode);
}
/**
 * Check if capabilities support a specific audio codec for encoding
 */
export function canEncodeAudio(capabilities, codec) {
    const codecLower = codec.toLowerCase();
    return capabilities.audioCodecs.some((c) => c.codec === codecLower && c.encode);
}
/**
 * Check if capabilities support a specific container format
 */
export function supportsContainer(capabilities, container) {
    const containerLower = container.toLowerCase();
    return capabilities.containerFormats.includes(containerLower);
}
// =============================================================================
// Default Capabilities
// =============================================================================
/**
 * Default capabilities for basic mode (WebCodecs + FFmpeg.wasm + WebGPU)
 */
export const BASIC_MODE_CAPABILITIES = {
    videoCodecs: [
        { codec: 'h264', decode: true, encode: true, profiles: ['baseline', 'main', 'high'] },
        { codec: 'vp8', decode: true, encode: true },
        { codec: 'vp9', decode: true, encode: false },
    ],
    audioCodecs: [
        { codec: 'aac', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 2 },
        { codec: 'mp3', decode: true, encode: false, maxSampleRate: 48000, maxChannels: 2 },
        { codec: 'opus', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 2 },
        { codec: 'vorbis', decode: true, encode: false, maxSampleRate: 48000, maxChannels: 2 },
        { codec: 'flac', decode: true, encode: false, maxSampleRate: 96000, maxChannels: 2 },
        { codec: 'pcm', decode: true, encode: true, maxSampleRate: 96000, maxChannels: 2 },
    ],
    containerFormats: ['mp4', 'webm', 'ogg', 'mov'],
    hardwareAcceleration: true,
    maxResolution: { width: 4096, height: 2160 },
    hdrSupport: false,
    requiresWebview: true,
    gpuEffects: true,
    gpuBackend: 'webgpu',
};
/**
 * Default capabilities for compatible mode (Native FFmpeg + wgpu)
 */
export const COMPATIBLE_MODE_CAPABILITIES = {
    videoCodecs: [
        { codec: 'h264', decode: true, encode: true, profiles: ['baseline', 'main', 'high'], hardwareAccelerated: true },
        { codec: 'h265', decode: true, encode: true, profiles: ['main', 'main10'], hardwareAccelerated: true },
        { codec: 'vp8', decode: true, encode: true },
        { codec: 'vp9', decode: true, encode: true },
        { codec: 'av1', decode: true, encode: false },
        { codec: 'prores', decode: true, encode: true, profiles: ['proxy', 'lt', 'standard', 'hq', '4444'] },
        { codec: 'dnxhd', decode: true, encode: true },
    ],
    audioCodecs: [
        { codec: 'aac', decode: true, encode: true, maxSampleRate: 96000, maxChannels: 8 },
        { codec: 'mp3', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 2 },
        { codec: 'opus', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 8 },
        { codec: 'vorbis', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 8 },
        { codec: 'flac', decode: true, encode: true, maxSampleRate: 192000, maxChannels: 8 },
        { codec: 'pcm', decode: true, encode: true, maxSampleRate: 192000, maxChannels: 8 },
        { codec: 'ac3', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 6 },
        { codec: 'dts', decode: true, encode: false, maxSampleRate: 48000, maxChannels: 6 },
    ],
    containerFormats: ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'mxf'],
    hardwareAcceleration: true,
    maxResolution: { width: 8192, height: 4320 },
    hdrSupport: true,
    requiresWebview: false,
    gpuEffects: true,
    gpuBackend: 'wgpu',
};
//# sourceMappingURL=capabilities.js.map