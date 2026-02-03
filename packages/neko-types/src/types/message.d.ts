import { ProjectData } from './project';
import { ConfigState, MCPServerConfig, WorkflowConfig, PromptPresetConfig, ProviderConfig } from './config';
/**
 * Attachment type enumeration
 */
export type AttachmentType = 'file' | 'image' | 'video' | 'audio';
/**
 * Message attachment for AI chat
 * Used for communication between Extension Host and WebView
 */
export interface MessageAttachment {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Attachment type */
    type: AttachmentType;
    /** File path (optional, for file system access) */
    path?: string;
    /** File size in bytes */
    size?: number;
    /** Base64 preview data URL (for images) */
    preview?: string;
}
/** Export progress information */
export interface ExportProgressInfo {
    /** Progress percentage (0-100) */
    percent: number;
    /** Current frame being processed */
    frame?: number;
    /** Total frames */
    totalFrames?: number;
    /** Current time in seconds */
    time?: number;
    /** Total duration */
    duration?: number;
    /** Processing speed (e.g., '1.5x') */
    speed?: string;
    /** Status message */
    message: string;
    /** Export status */
    status: 'preparing' | 'processing' | 'finalizing' | 'done' | 'error' | 'cancelled';
}
/** Context menu item definition */
export interface ContextMenuItem {
    id: string;
    label: string;
    disabled?: boolean;
    separator?: boolean;
    shortcut?: string;
}
/** Template summary for message passing */
export interface TemplateSummaryMessage {
    id: string;
    name: string;
    description?: string;
    category: 'editing' | 'generation' | 'analysis' | 'custom';
    tags: string[];
    version: string;
    author?: string;
    builtin?: boolean;
}
/** Template step for message passing */
export interface TemplateStepMessage {
    id: string;
    name: string;
}
export type MessageToWebview = {
    type: 'update';
    content: ProjectData;
} | {
    type: 'fileAdded';
    path: string;
    mediaType: 'video' | 'audio' | 'image';
} | {
    type: 'error';
    message: string;
} | {
    type: 'saved';
} | {
    type: 'fileUri';
    path: string;
    uri: string;
    isBase64?: boolean;
} | {
    type: 'exportProgress';
    progress: ExportProgressInfo;
} | {
    type: 'audioDecodeResult';
    requestId: string;
    success: boolean;
    data?: string;
    mimeType?: string;
    duration?: number;
    cached?: boolean;
    error?: string;
} | {
    type: 'exportDialogResult';
    success: boolean;
    cancelled?: boolean;
    path?: string;
    error?: string;
} | {
    type: 'exportChunkResult';
    success: boolean;
    error?: string;
} | {
    type: 'exportStreamError';
    error: string;
} | {
    type: 'exportComplete';
    success: boolean;
    path?: string;
    error?: string;
} | {
    type: 'exportCancelled';
} | {
    type: 'blobSaveResult';
    success: boolean;
    cancelled?: boolean;
    path?: string;
    error?: string;
} | {
    type: 'contextMenuResult';
    menuId: string;
    selectedId?: string;
} | {
    type: 'aiActionStarted';
    actionId: string;
    elementIds: string[];
} | {
    type: 'aiActionProgress';
    actionId: string;
    content?: string;
    toolCall?: {
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    };
    toolResult?: {
        toolCallId: string;
        success: boolean;
        data: unknown;
        error?: string;
    };
} | {
    type: 'aiActionResult';
    actionId: string;
    success: boolean;
    data?: unknown;
    error?: string;
} | {
    type: 'templateList';
    templates: TemplateSummaryMessage[];
} | {
    type: 'templateExecutionStarted';
    templateId: string;
    templateName: string;
    steps: TemplateStepMessage[];
} | {
    type: 'templateStepProgress';
    templateId: string;
    stepId: string;
    state: 'running' | 'completed' | 'failed' | 'skipped';
    error?: string;
    outputPreview?: string;
} | {
    type: 'templateExecutionResult';
    templateId: string;
    success: boolean;
    data?: unknown;
    error?: string;
} | {
    type: 'configState';
    config: ConfigState;
} | {
    type: 'configChanged';
    changeType: 'provider' | 'model' | 'mcp' | 'workflow' | 'prompt';
    id: string;
} | {
    type: 'providerModelsResult';
    requestId: string;
    providerId: string;
    success: boolean;
    models?: ProviderModelInfo[];
    error?: string;
} | {
    type: 'tool.execute';
    requestId: string;
    toolName: string;
    params: Record<string, unknown>;
};
/** Model info returned from provider API */
export interface ProviderModelInfo {
    id: string;
    name?: string;
    capabilities: ProviderModelCapability[];
    owner?: string;
}
/** Model capability types */
export type ProviderModelCapability = 'chat' | 'vision' | 'function_call' | 'image-generation' | 'video-generation' | 'audio-generation' | 'embedding' | 'stream';
export type MessageFromWebview = {
    type: 'ready';
} | {
    type: 'save';
    content: ProjectData;
} | {
    type: 'requestFile';
    path: string;
} | {
    type: 'addMediaToTimeline';
    path: string;
} | {
    type: 'saveBlob';
    data: string;
    filename: string;
    mimeType: string;
} | {
    type: 'decodeAudio';
    requestId: string;
    videoPath: string;
    startTime: number;
    duration: number;
    format?: 'wav' | 'mp3';
    sampleRate?: number;
    channels?: number;
} | {
    type: 'showExportDialog';
    filename: string;
    format: string;
} | {
    type: 'writeExportChunk';
    data: ArrayBuffer;
} | {
    type: 'finalizeExport';
    success: boolean;
    error?: string;
} | {
    type: 'cancelExport';
} | {
    type: 'exportProgress';
    isExporting: boolean;
    percent: number;
    message: string;
    currentFrame?: number;
    totalFrames?: number;
    currentFps?: number;
    estimatedTimeRemaining?: number;
} | {
    type: 'showContextMenu';
    menuId: string;
    items: ContextMenuItem[];
} | {
    type: 'getConfig';
} | {
    type: 'updateMCPServer';
    server: MCPServerConfig;
} | {
    type: 'updateWorkflow';
    workflow: WorkflowConfig;
} | {
    type: 'updatePrompt';
    prompt: PromptPresetConfig;
} | {
    type: 'updateProvider';
    provider: ProviderConfig;
} | {
    type: 'deleteMCPServer';
    id: string;
} | {
    type: 'deleteWorkflow';
    id: string;
} | {
    type: 'deletePrompt';
    id: string;
} | {
    type: 'deleteProvider';
    id: string;
} | {
    type: 'tool.execute';
    requestId: string;
    toolName: string;
    params: Record<string, unknown>;
} | {
    type: 'tool.result';
    requestId: string;
    success: boolean;
    result?: unknown;
    error?: string;
} | {
    type: 'executeAIAction';
    actionId: string;
    elementIds: string[];
    params?: Record<string, unknown>;
} | {
    type: 'getTemplates';
    category?: string;
} | {
    type: 'executeTemplate';
    templateId: string;
    params: Record<string, unknown>;
} | {
    type: 'cancelTemplateExecution';
    templateId: string;
} | {
    type: 'listProviderModels';
    providerId: string;
    requestId: string;
} | {
    type: 'planApprove';
    planId: string;
    conversationId: string;
    filePath?: string;
} | {
    type: 'planReject';
    planId: string;
    conversationId: string;
} | {
    type: 'planStepApprove';
    planId: string;
    stepId: string;
    conversationId: string;
} | {
    type: 'planStepReject';
    planId: string;
    stepId: string;
    conversationId: string;
} | {
    type: 'planStepModify';
    planId: string;
    stepId: string;
    newDescription: string;
    conversationId: string;
};
//# sourceMappingURL=message.d.ts.map