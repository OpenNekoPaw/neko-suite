/**
 * Media Diff Protocol
 *
 * Defines IPC protocol between Extension Host and Webview for media diff visualization.
 *
 * Responsibilities:
 * - Define request/response message types
 * - Define diff result structures for image/video/audio
 * - Ensure type-safe communication
 */
// =============================================================================
// Media Type Definitions
// =============================================================================
/**
 * Supported media file extensions
 */
export const MEDIA_EXTENSIONS = {
    // Images
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.bmp': 'image',
    '.svg': 'image',
    // Videos
    '.mp4': 'video',
    '.mov': 'video',
    '.avi': 'video',
    '.mkv': 'video',
    '.webm': 'video',
    '.m4v': 'video',
    // Audio
    '.mp3': 'audio',
    '.wav': 'audio',
    '.ogg': 'audio',
    '.flac': 'audio',
    '.aac': 'audio',
    '.m4a': 'audio',
};
// =============================================================================
// Protocol Constants
// =============================================================================
/** Protocol version */
export const MEDIA_DIFF_PROTOCOL_VERSION = '1.0.0';
/** Default analysis timeout (30 seconds) */
export const DEFAULT_DIFF_TIMEOUT = 30000;
/** Default keyframe sample count for video diff */
export const DEFAULT_KEYFRAME_SAMPLES = 10;
/** Default waveform sample count for audio diff */
export const DEFAULT_WAVEFORM_SAMPLES = 1000;
// =============================================================================
// Utility Functions
// =============================================================================
/**
 * Get media type from file extension
 */
export function getMediaType(filePath) {
    const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!ext)
        return null;
    return MEDIA_EXTENSIONS[ext] ?? null;
}
/**
 * Check if file is a supported media file
 */
export function isSupportedMediaFile(filePath) {
    return getMediaType(filePath) !== null;
}
/**
 * Format similarity as percentage string
 */
export function formatSimilarity(similarity) {
    return `${(similarity * 100).toFixed(1)}%`;
}
/**
 * Get similarity interpretation
 */
export function getSimilarityLevel(similarity) {
    if (similarity >= 0.99)
        return 'identical';
    if (similarity >= 0.9)
        return 'similar';
    if (similarity >= 0.5)
        return 'different';
    return 'significantly-different';
}
//# sourceMappingURL=mediaDiffProtocol.js.map