import { TimelineTrack } from './timelineTrack';
import { TimelineElement } from './element';
export interface ProjectDefaults {
    text: {
        fontSize: number;
        fontFamily: string;
        color: string;
        backgroundColor: string;
        textAlign: 'left' | 'center' | 'right';
        fontWeight: 'normal' | 'bold';
        fontStyle: 'normal' | 'italic';
        textDecoration: 'none' | 'underline' | 'line-through';
    };
    transform: {
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
        opacity: number;
    };
    audio: {
        volume: number;
        pan: number;
        fadeIn: number;
        fadeOut: number;
        gain: number;
    };
}
export interface ProjectData {
    version: string;
    name: string;
    resolution: {
        width: number;
        height: number;
    };
    fps: number;
    tracks: TimelineTrack[];
    defaults?: ProjectDefaults;
}
export declare function generateId(): string;
/**
 * Create default project defaults (global settings)
 */
export declare function createDefaultProjectDefaults(): ProjectDefaults;
export declare function createDefaultProject(name?: string): ProjectData;
import { TextElement } from './element';
export declare function createDefaultTextElement(startTime?: number): TextElement;
/**
 * Sort tracks by type: text on top, shape, media in middle, audio/subtitle at bottom
 */
export declare function sortTracksByType(tracks: TimelineTrack[]): TimelineTrack[];
/**
 * Calculate the effective duration of an element (after trim)
 */
export declare function getEffectiveDuration(element: TimelineElement): number;
/**
 * Calculate the end time of an element on the timeline
 */
export declare function getElementEndTime(element: TimelineElement): number;
/**
 * Get the total duration of all tracks
 */
export declare function getTotalDuration(tracks: TimelineTrack[]): number;
//# sourceMappingURL=project.d.ts.map