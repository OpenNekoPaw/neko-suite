/**
 * Media Decoder Interface
 *
 * Defines the unified decoder interface for both basic and compatible modes.
 * Aligned with media-processor-rs/src/decoder/traits.rs
 */
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if a decoded frame is a video frame
 */
export function isVideoFrame(frame) {
    return frame.type === 'video';
}
/**
 * Check if a decoded frame is an audio frame
 */
export function isAudioFrame(frame) {
    return frame.type === 'audio';
}
/**
 * Check if a decoder is a video decoder
 */
export function isVideoDecoder(decoder) {
    return decoder.type === 'video';
}
/**
 * Check if a decoder is an audio decoder
 */
export function isAudioDecoder(decoder) {
    return decoder.type === 'audio';
}
//# sourceMappingURL=decoder.js.map