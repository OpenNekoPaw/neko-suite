import { Transform } from './transform';
import { ElementTransform } from './animation';
import { BlendModeType } from './blendMode';
import { ColorCorrection } from './colorCorrection';
import { MaskInstance } from './mask';
import { EffectInstance } from './effects';
import { KeyframeTrack } from './keyframe';
import { Transition } from './transition';
import { SpeedProperties } from './speed';
import { AudioProperties } from './audio';
import { Point2D } from './geometry';
import { ShapeType, ShapeInstance } from './shape';
import { SubtitleCue, SubtitleStyle } from './subtitle';
interface BaseTimelineElement {
    id: string;
    name: string;
    duration: number;
    startTime: number;
    trimStart: number;
    trimEnd: number;
    hidden?: boolean;
    locked?: boolean;
    muted?: boolean;
    /** Static Transform (position, scale, rotation) - for non-animated elements */
    transform?: Transform;
    /** Animatable Transform (supports keyframes) */
    animTransform?: ElementTransform;
    /** Opacity (0-1) - static value */
    opacity?: number;
    /** Blend mode */
    blendMode?: BlendModeType;
    /** Color correction settings */
    colorCorrection?: ColorCorrection;
    /** Mask instances */
    masks?: MaskInstance[];
    /** Effects applied to this element */
    effects?: EffectInstance[];
    /** Legacy keyframe animations */
    keyframes?: KeyframeTrack[];
    /** Transition to next element */
    transitionOut?: Transition;
    /** Transition from previous element */
    transitionIn?: Transition;
    /** Speed control properties */
    speed?: SpeedProperties;
    /** Audio properties (for media/audio elements) */
    audio?: AudioProperties;
}
export interface MediaElement extends BaseTimelineElement {
    type: 'media';
    /** Relative path to media file, e.g., "./assets/intro.mp4" */
    src: string;
    /** Media type hint */
    mediaType?: 'video' | 'image';
}
export interface TextElement extends BaseTimelineElement {
    type: 'text';
    content: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    textAlign: 'left' | 'center' | 'right';
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textDecoration: 'none' | 'underline' | 'line-through';
    /** @deprecated Use transform.x instead */
    x: number;
    /** @deprecated Use transform.y instead */
    y: number;
    /** @deprecated Use transform.rotation instead */
    rotation: number;
    /** @deprecated Use element opacity instead */
    opacity: number;
    /** Line height multiplier (default 1.2) */
    lineHeight?: number;
    /** Letter spacing in pixels */
    letterSpacing?: number;
    /** Text stroke color */
    strokeColor?: string;
    /** Text stroke width */
    strokeWidth?: number;
    /** Drop shadow settings */
    shadow?: {
        color: string;
        offsetX: number;
        offsetY: number;
        blur: number;
    };
}
export interface AudioElement extends BaseTimelineElement {
    type: 'audio';
    /** Relative path to audio file */
    src: string;
}
export interface ShapeElement extends BaseTimelineElement {
    type: 'shape';
    /** Shape instances within this element */
    shapes: ShapeInstance[];
    /** @deprecated Use shapes[0].shape.shapeType instead */
    shapeType?: ShapeType;
    /** @deprecated Use shapes[0].style.fill.color instead */
    fillColor?: string;
    /** @deprecated Use shapes[0].style.stroke.color instead */
    strokeColor?: string;
    /** @deprecated Use shapes[0].style.stroke.width instead */
    strokeWidth?: number;
    /** @deprecated Use shapes[0].shape (RectangleShape).cornerRadius instead */
    cornerRadius?: number;
    /** @deprecated Use shapes[0].shape (PolygonShape).points instead */
    points?: Point2D[];
    /** @deprecated Use shapes[0].style.fill.type !== 'none' instead */
    filled?: boolean;
}
export interface SubtitleElement extends BaseTimelineElement {
    type: 'subtitle';
    /** Subtitle cues within this element */
    cues: SubtitleCue[];
    /** Style for this subtitle element */
    style: SubtitleStyle;
    /** Language code (e.g., 'en', 'zh-CN') */
    language: string;
    /** Whether this is the default subtitle track */
    isDefault?: boolean;
}
export type TimelineElement = MediaElement | TextElement | AudioElement | ShapeElement | SubtitleElement;
export {};
//# sourceMappingURL=element.d.ts.map