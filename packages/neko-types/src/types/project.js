// =============================================================================
// Project Data (.jvi file format)
// =============================================================================
// =============================================================================
// Helper Functions
// =============================================================================
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
/**
 * Create default project defaults (global settings)
 */
export function createDefaultProjectDefaults() {
    return {
        text: {
            fontSize: 48,
            fontFamily: 'Arial',
            color: '#ffffff',
            backgroundColor: 'transparent',
            textAlign: 'center',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
        },
        transform: {
            x: 0.5,
            y: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
        },
        audio: {
            volume: 1,
            pan: 0,
            fadeIn: 0,
            fadeOut: 0,
            gain: 0,
        },
    };
}
export function createDefaultProject(name = 'Untitled Project') {
    return {
        version: '2.0',
        name,
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        tracks: [
            {
                id: generateId(),
                name: 'Main Track',
                type: 'media',
                elements: [],
                muted: false,
                isMain: true,
            },
        ],
        defaults: createDefaultProjectDefaults(),
    };
}
export function createDefaultTextElement(startTime = 0) {
    return {
        id: generateId(),
        type: 'text',
        name: 'New Text',
        content: 'Enter text here',
        duration: 5,
        startTime,
        trimStart: 0,
        trimEnd: 0,
        fontSize: 48,
        fontFamily: 'Arial',
        color: '#ffffff',
        backgroundColor: 'transparent',
        textAlign: 'center',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
    };
}
/**
 * Sort tracks by type: text on top, shape, media in middle, audio/subtitle at bottom
 */
export function sortTracksByType(tracks) {
    return [...tracks].sort((a, b) => {
        const order = { text: 0, shape: 1, media: 2, audio: 3, subtitle: 4 };
        return order[a.type] - order[b.type];
    });
}
/**
 * Calculate the effective duration of an element (after trim)
 */
export function getEffectiveDuration(element) {
    return element.duration - element.trimStart - element.trimEnd;
}
/**
 * Calculate the end time of an element on the timeline
 */
export function getElementEndTime(element) {
    return element.startTime + getEffectiveDuration(element);
}
/**
 * Get the total duration of all tracks
 */
export function getTotalDuration(tracks) {
    let maxEnd = 0;
    for (const track of tracks) {
        for (const element of track.elements) {
            const endTime = getElementEndTime(element);
            if (endTime > maxEnd) {
                maxEnd = endTime;
            }
        }
    }
    return maxEnd;
}
//# sourceMappingURL=project.js.map