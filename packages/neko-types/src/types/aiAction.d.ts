/**
 * Element types that can have AI actions applied
 */
export type AIActionElementType = 'video' | 'image' | 'audio' | 'text' | 'shape';
/**
 * AI action capability requirements
 */
export type AIActionCapability = 'text-generation' | 'image-generation' | 'video-generation' | 'vision' | 'transcription' | 'translation';
/**
 * AI Quick Action definition
 */
export interface AIQuickAction {
    /** Unique action identifier */
    id: string;
    /** Display label (localization key or direct text) */
    label: string;
    /** Icon name (from icon library) */
    icon?: string;
    /** Element types this action applies to */
    elementTypes: AIActionElementType[];
    /** Required AI capabilities */
    requiredCapabilities: AIActionCapability[];
    /** Action category for grouping */
    category: 'generate' | 'edit' | 'analyze' | 'enhance';
    /** Whether this action supports multi-selection */
    supportsMultiSelect?: boolean;
    /** Priority for ordering (higher = shown first) */
    priority?: number;
}
/**
 * AI action execution request
 */
export interface AIActionRequest {
    /** Action to execute */
    actionId: string;
    /** Selected element IDs */
    elementIds: string[];
    /** Additional parameters for the action */
    params?: Record<string, unknown>;
}
/**
 * AI action execution result
 */
export interface AIActionResult {
    /** Whether the action succeeded */
    success: boolean;
    /** Result data (varies by action type) */
    data?: unknown;
    /** Error message if failed */
    error?: string;
    /** Task ID for async operations */
    taskId?: string;
}
/**
 * Built-in AI actions for different element types
 */
export declare const AI_ACTIONS: AIQuickAction[];
/**
 * Get available AI actions for given element type(s)
 */
export declare function getActionsForElementType(elementType: AIActionElementType, isMultiSelect?: boolean): AIQuickAction[];
/**
 * Map TimelineElement type to AIActionElementType
 */
export declare function mapElementTypeToAIType(elementType: 'media' | 'text' | 'audio' | 'shape' | 'subtitle', mediaType?: 'video' | 'image'): AIActionElementType;
//# sourceMappingURL=aiAction.d.ts.map