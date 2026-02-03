import { EasingType } from './easing';
export type TransitionType = 'none' | 'fade' | 'dissolve' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'cross-zoom' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'iris-in' | 'iris-out' | 'clock-wipe' | 'clock-wipe-ccw' | 'blinds-horizontal' | 'blinds-vertical' | 'cube-left' | 'cube-right' | 'cube-up' | 'cube-down' | 'flip-horizontal' | 'flip-vertical' | 'page-curl-left' | 'page-curl-right' | 'pixelate' | 'blur' | 'glitch' | 'radial-wipe' | 'morph' | 'dip-to-black' | 'dip-to-white' | 'dip-to-color' | 'custom';
/** Transition direction */
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';
/** Transition parameters */
export interface TransitionParams {
    /** Direction for directional transitions */
    direction?: TransitionDirection;
    /** Edge softness (0-1) */
    softness?: number;
    /** Color for color-based transitions (e.g., dip-to-color) */
    color?: string;
    /** Custom GLSL shader fragment */
    customShader?: string;
    /** Number of blinds for blinds transitions (default: 10) */
    blindsCount?: number;
    /** Start angle for clock wipe (0-360, default: 0) */
    startAngle?: number;
    /** Perspective depth for 3D transitions (default: 1000) */
    perspective?: number;
    /** Pixelate block size for pixelate transition (default: 10) */
    blockSize?: number;
    /** Blur radius for blur transition (default: 20) */
    blurRadius?: number;
    /** Glitch intensity for glitch transition (0-1, default: 0.5) */
    glitchIntensity?: number;
}
/** Transition definition */
export interface Transition {
    /** Unique identifier */
    id?: string;
    /** Transition type */
    type: TransitionType;
    /** Duration in seconds */
    duration: number;
    /** Easing function for progress */
    easing: EasingType;
    /** Additional parameters */
    params?: TransitionParams;
    /** @deprecated Use params.softness */
    softness?: number;
    /** @deprecated Use params.blindsCount */
    blindsCount?: number;
    /** @deprecated Use params.startAngle */
    startAngle?: number;
    /** @deprecated Use params.color */
    dipColor?: string;
}
/**
 * Placement mode for transitions between elements
 * 元素间转场的放置模式
 */
export type TransitionPlacement = 'overlap' | 'cut';
/**
 * Transition between two adjacent elements
 * 两个相邻元素之间的转场
 */
export interface ElementTransition {
    /** Unique identifier */
    id: string;
    /** ID of the element before the transition */
    fromElementId: string;
    /** ID of the element after the transition */
    toElementId: string;
    /** Transition definition */
    transition: Transition;
    /**
     * Placement mode:
     * - 'overlap': Elements overlap during transition
     * - 'cut': Transition takes extra time at the cut point
     */
    placement: TransitionPlacement;
}
//# sourceMappingURL=transition.d.ts.map