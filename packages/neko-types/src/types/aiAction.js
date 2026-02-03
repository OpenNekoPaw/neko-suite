// =============================================================================
// AI Quick Actions - Types for AI action buttons and context menu integration
// =============================================================================
/**
 * Built-in AI actions for different element types
 */
export const AI_ACTIONS = [
    // Video actions
    {
        id: 'video-generate-variant',
        label: 'ai.action.generateVariant',
        icon: 'sparkles',
        elementTypes: ['video'],
        requiredCapabilities: ['video-generation'],
        category: 'generate',
        priority: 100,
    },
    {
        id: 'video-extend',
        label: 'ai.action.extendVideo',
        icon: 'arrow-right',
        elementTypes: ['video'],
        requiredCapabilities: ['video-generation'],
        category: 'generate',
        priority: 90,
    },
    {
        id: 'video-describe',
        label: 'ai.action.describeContent',
        icon: 'file-text',
        elementTypes: ['video', 'image'],
        requiredCapabilities: ['vision'],
        category: 'analyze',
        priority: 80,
    },
    {
        id: 'video-extract-keyframes',
        label: 'ai.action.extractKeyframes',
        icon: 'images',
        elementTypes: ['video'],
        requiredCapabilities: [],
        category: 'analyze',
        priority: 70,
    },
    // Image actions
    {
        id: 'image-to-video',
        label: 'ai.action.imageToVideo',
        icon: 'video',
        elementTypes: ['image'],
        requiredCapabilities: ['video-generation'],
        category: 'generate',
        priority: 100,
    },
    {
        id: 'image-edit',
        label: 'ai.action.editImage',
        icon: 'edit',
        elementTypes: ['image'],
        requiredCapabilities: ['image-generation'],
        category: 'edit',
        priority: 90,
    },
    {
        id: 'image-upscale',
        label: 'ai.action.upscale',
        icon: 'maximize',
        elementTypes: ['image', 'video'],
        requiredCapabilities: [],
        category: 'enhance',
        priority: 80,
    },
    // Text/Subtitle actions
    {
        id: 'text-translate',
        label: 'ai.action.translate',
        icon: 'languages',
        elementTypes: ['text'],
        requiredCapabilities: ['translation'],
        category: 'edit',
        priority: 100,
    },
    {
        id: 'text-rewrite',
        label: 'ai.action.rewrite',
        icon: 'pencil',
        elementTypes: ['text'],
        requiredCapabilities: ['text-generation'],
        category: 'edit',
        priority: 90,
    },
    {
        id: 'text-generate-voiceover',
        label: 'ai.action.generateVoiceover',
        icon: 'mic',
        elementTypes: ['text'],
        requiredCapabilities: [],
        category: 'generate',
        priority: 80,
    },
    // Audio actions
    {
        id: 'audio-transcribe',
        label: 'ai.action.transcribe',
        icon: 'file-text',
        elementTypes: ['audio'],
        requiredCapabilities: ['transcription'],
        category: 'analyze',
        priority: 100,
    },
    // Multi-element actions
    {
        id: 'batch-style-unify',
        label: 'ai.action.unifyStyle',
        icon: 'palette',
        elementTypes: ['video', 'image'],
        requiredCapabilities: ['vision'],
        category: 'enhance',
        supportsMultiSelect: true,
        priority: 50,
    },
];
/**
 * Get available AI actions for given element type(s)
 */
export function getActionsForElementType(elementType, isMultiSelect = false) {
    return AI_ACTIONS.filter((action) => {
        const typeMatch = action.elementTypes.includes(elementType);
        const multiSelectMatch = !isMultiSelect || action.supportsMultiSelect;
        return typeMatch && multiSelectMatch;
    }).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
/**
 * Map TimelineElement type to AIActionElementType
 */
export function mapElementTypeToAIType(elementType, mediaType) {
    switch (elementType) {
        case 'media':
            return mediaType === 'image' ? 'image' : 'video';
        case 'text':
            return 'text';
        case 'audio':
            return 'audio';
        case 'shape':
            return 'shape';
        case 'subtitle':
            return 'text'; // Treat subtitle as text for AI actions
        default:
            return 'video';
    }
}
//# sourceMappingURL=aiAction.js.map