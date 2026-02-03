/**
 * Media Engine Interface
 *
 * Defines the unified media engine interface that abstracts
 * both basic mode (WebCodecs + FFmpeg.wasm + WebGPU) and
 * compatible mode (Native FFmpeg + wgpu).
 */
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if an object implements IMediaEngine
 */
export function isMediaEngine(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const engine = obj;
    return (typeof engine.name === 'string' &&
        typeof engine.mode === 'string' &&
        typeof engine.state === 'string' &&
        typeof engine.initialize === 'function' &&
        typeof engine.dispose === 'function' &&
        typeof engine.createVideoDecoder === 'function' &&
        typeof engine.createAudioDecoder === 'function' &&
        typeof engine.createEncoder === 'function');
}
//# sourceMappingURL=engine.js.map