/**
 * Media Encoder Interface
 *
 * Defines the unified encoder interface for both basic and compatible modes.
 */
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if an encoder supports streaming
 */
export function isStreamingEncoder(encoder) {
    return 'canAcceptFrame' in encoder && 'waitForCapacity' in encoder;
}
/**
 * Check if an encoder is an audio encoder
 */
export function isAudioEncoder(encoder) {
    return (typeof encoder === 'object' &&
        encoder !== null &&
        'encode' in encoder &&
        'getEncodedChunks' in encoder &&
        !('encodeVideoFrame' in encoder));
}
//# sourceMappingURL=encoder.js.map