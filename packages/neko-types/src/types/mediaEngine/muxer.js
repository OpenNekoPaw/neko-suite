/**
 * Muxer Types
 *
 * Defines the unified muxer interface for MP4 and WebM container formats.
 */
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if a chunk is a video chunk
 */
export function isVideoChunk(chunk) {
    return 'type' in chunk && (chunk.type === 'key' || chunk.type === 'delta');
}
/**
 * Check if a chunk is an audio chunk
 */
export function isAudioChunk(chunk) {
    return 'isKeyframe' in chunk;
}
//# sourceMappingURL=muxer.js.map