/**
 * Effect Processor Interface
 *
 * Defines the unified GPU effect processing interface for both modes.
 */
// =============================================================================
// Type Guards
// =============================================================================
/**
 * Check if an effect processor supports batch processing
 */
export function isBatchEffectProcessor(processor) {
    return 'processFrameBatch' in processor && 'maxBatchSize' in processor;
}
// =============================================================================
// Effect Helpers
// =============================================================================
/**
 * Create default color correction params
 */
export function createColorCorrection(overrides) {
    return {
        type: 'colorCorrection',
        brightness: 0,
        contrast: 1,
        saturation: 1,
        hue: 0,
        gamma: 1,
        exposure: 0,
        ...overrides,
    };
}
/**
 * Create default blur params
 */
export function createBlur(radius, quality = 'medium') {
    return {
        type: 'blur',
        radius,
        quality,
    };
}
/**
 * Create default chroma key params for green screen
 */
export function createGreenScreenKey(overrides) {
    return {
        type: 'chromaKey',
        keyColor: { r: 0, g: 255, b: 0 },
        similarity: 0.4,
        smoothness: 0.1,
        spillSuppression: 0.5,
        ...overrides,
    };
}
//# sourceMappingURL=effects.js.map