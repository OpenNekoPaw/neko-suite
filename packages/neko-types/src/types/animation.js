// =============================================================================
// Animatable Property System (关键帧动画系统)
// =============================================================================
/**
 * Create default animatable property
 */
export function createAnimatableProperty(baseValue) {
    return { baseValue, keyframes: [] };
}
/**
 * Create default element transform
 */
export function createDefaultElementTransform() {
    return {
        x: createAnimatableProperty(0.5),
        y: createAnimatableProperty(0.5),
        scaleX: createAnimatableProperty(1),
        scaleY: createAnimatableProperty(1),
        rotation: createAnimatableProperty(0),
        opacity: createAnimatableProperty(1),
        anchorX: 0.5,
        anchorY: 0.5,
    };
}
//# sourceMappingURL=animation.js.map