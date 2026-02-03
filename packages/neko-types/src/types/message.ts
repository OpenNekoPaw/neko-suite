// =============================================================================
// Message Types (Extension Host <-> WebView)
// =============================================================================

import { ProjectData } from './project';
import {
  ConfigState,
  MCPServerConfig,
  WorkflowConfig,
  PromptPresetConfig,
  ProviderConfig,
} from './config';

// =============================================================================
// Attachment Types (Chat UI DTO)
// =============================================================================

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

// =============================================================================
// Export Progress Types
// =============================================================================

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

// =============================================================================
// Compatible Mode Export Types
// =============================================================================

/** Export configuration for compatible mode (native encoder) */
export interface CompatibleExportConfig {
  /** Output file path */
  outputPath: string;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Frame rate (fps) */
  fps: number;
  /** Video codec */
  videoCodec: 'h264' | 'h265' | 'vp9' | 'prores';
  /** Video bitrate in bps */
  videoBitrate?: number;
  /** Encoding preset */
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';
  /** Container format */
  container?: 'mp4' | 'mov' | 'webm' | 'mkv';
  /** Include audio */
  includeAudio?: boolean;
  /** Audio codec */
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'flac';
  /** Audio bitrate in bps */
  audioBitrate?: number;
  /** Background color [r, g, b, a] (0-1) */
  backgroundColor?: [number, number, number, number];
}

/** Compatible mode export progress */
export interface CompatibleExportProgress {
  /** Current frame number */
  currentFrame: number;
  /** Total frames */
  totalFrames: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated remaining time in milliseconds */
  estimatedRemainingMs: number;
  /** Current phase */
  phase: 'initializing' | 'rendering' | 'encoding' | 'finalizing';
  /** Performance statistics (optional) */
  performanceStats?: {
    /** Average render time per frame (ms) */
    avgRenderTime: number;
    /** Average encode time per frame (ms) */
    avgEncodeTime: number;
    /** Average decode time per frame (ms) */
    avgDecodeTime?: number;
    /** Current FPS */
    currentFps: number;
    /** Memory used (MB) */
    memoryUsedMB?: number;
    /** VRAM used (MB) */
    vramUsedMB?: number;
    /** CPU usage (0-100%) */
    cpuUsage?: number;
    /** GPU usage (0-100%) */
    gpuUsage?: number;
  };
}

/** Compatible mode export result */
export interface CompatibleExportResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  /** Total export time in milliseconds */
  totalTimeMs?: number;
  /** Total frames rendered */
  framesRendered?: number;
  /** Average frame render time in milliseconds */
  avgFrameTimeMs?: number;
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

export type MessageToWebview =
  | { type: 'update'; content: ProjectData }
  | { type: 'fileAdded'; path: string; mediaType: 'video' | 'audio' | 'image' }
  | { type: 'error'; message: string }
  | { type: 'saved' }
  | { type: 'fileUri'; path: string; uri: string; isBase64?: boolean }
  | { type: 'exportProgress'; progress: ExportProgressInfo }
  // Audio decode messages (Extension -> WebView)
  | { type: 'audioDecodeResult'; requestId: string; success: boolean; data?: string; mimeType?: string; duration?: number; cached?: boolean; error?: string }
  // Streaming export messages (Extension -> WebView)
  | { type: 'exportDialogResult'; success: boolean; cancelled?: boolean; path?: string; error?: string }
  | { type: 'exportChunkResult'; success: boolean; error?: string }
  | { type: 'exportStreamError'; error: string }
  | { type: 'exportComplete'; success: boolean; path?: string; error?: string }
  | { type: 'exportCancelled' }
  | { type: 'blobSaveResult'; success: boolean; cancelled?: boolean; path?: string; error?: string }
  | { type: 'exportPathSelected'; success: boolean; cancelled?: boolean; path?: string; error?: string }
  // Compatible mode export messages (Extension -> WebView)
  | { type: 'compatibleExportStarted'; exportId: string }
  | { type: 'compatibleExportProgress'; exportId: string; progress: CompatibleExportProgress }
  | { type: 'compatibleExportResult'; exportId: string; result: CompatibleExportResult }
  | { type: 'compatibleExportCancelled'; exportId: string }
  // Compatible mode preview messages (Extension -> WebView)
  | { type: 'previewFrameReady'; requestId: string; frameData: string; width: number; height: number; timestamp: number }
  | { type: 'previewFrameError'; requestId: string; error: string }
  // Context menu result (Extension -> WebView)
  | { type: 'contextMenuResult'; menuId: string; selectedId?: string }
  // AI Action messages (Extension -> WebView)
  | { type: 'aiActionStarted'; actionId: string; elementIds: string[] }
  | { type: 'aiActionProgress'; actionId: string; content?: string; toolCall?: { id: string; name: string; arguments: Record<string, unknown> }; toolResult?: { toolCallId: string; success: boolean; data: unknown; error?: string } }
  | { type: 'aiActionResult'; actionId: string; success: boolean; data?: unknown; error?: string }
  // Template messages (Extension -> WebView)
  | { type: 'templateList'; templates: TemplateSummaryMessage[] }
  | { type: 'templateExecutionStarted'; templateId: string; templateName: string; steps: TemplateStepMessage[] }
  | { type: 'templateStepProgress'; templateId: string; stepId: string; state: 'running' | 'completed' | 'failed' | 'skipped'; error?: string; outputPreview?: string }
  | { type: 'templateExecutionResult'; templateId: string; success: boolean; data?: unknown; error?: string }
  // Configuration messages (Extension -> WebView)
  | { type: 'configState'; config: ConfigState }
  | { type: 'configChanged'; changeType: 'provider' | 'model' | 'mcp' | 'workflow' | 'prompt'; id: string }
  // Provider model discovery response (Extension -> WebView)
  | { type: 'providerModelsResult'; requestId: string; providerId: string; success: boolean; models?: ProviderModelInfo[]; error?: string }
  // Tool execution request (Extension -> WebView)
  | { type: 'tool.execute'; requestId: string; toolName: string; params: Record<string, unknown> }
  // File range read response (Extension -> WebView) - for testing on-demand loading
  | { type: 'fileRangeResult'; requestId: string; success: boolean; data?: string; actualStart?: number; actualEnd?: number; fileSize?: number; error?: string };

/** Model info returned from provider API */
export interface ProviderModelInfo {
  id: string;
  name?: string;
  capabilities: ProviderModelCapability[];
  owner?: string;
}

/** Model capability types */
export type ProviderModelCapability =
  | 'chat'
  | 'vision'
  | 'function_call'
  | 'image-generation'
  | 'video-generation'
  | 'audio-generation'
  | 'embedding'
  | 'stream';

export type MessageFromWebview =
  | { type: 'ready' }
  | { type: 'save'; content: ProjectData }
  | { type: 'requestFile'; path: string }
  | { type: 'addMediaToTimeline'; path: string }
  | { type: 'saveBlob'; data: string; filename: string; mimeType: string }
  | { type: 'selectExportPath'; filename: string; format: string }
  | { type: 'saveBlobToPath'; data: string; path: string; mimeType: string }
  // Audio decode request (WebView -> Extension)
  | { type: 'decodeAudio'; requestId: string; videoPath: string; startTime: number; duration: number; format?: 'wav' | 'mp3'; sampleRate?: number; channels?: number }
  // Streaming export messages (WebView -> Extension)
  | { type: 'showExportDialog'; filename: string; format: string }
  | { type: 'writeExportChunk'; data: ArrayBuffer }  // Binary data (Transferable)
  | { type: 'finalizeExport'; success: boolean; error?: string }
  | { type: 'cancelExport' }
  // Compatible mode export messages (WebView -> Extension)
  | { type: 'startCompatibleExport'; exportId: string; config: CompatibleExportConfig }
  | { type: 'cancelCompatibleExport'; exportId: string }
  // Compatible mode preview messages (WebView -> Extension)
  | { type: 'requestPreviewFrame'; requestId: string; time: number; width?: number; height?: number }
  // Export progress for status bar (WebView -> Extension)
  | { type: 'exportProgress'; isExporting: boolean; percent: number; message: string; currentFrame?: number; totalFrames?: number; currentFps?: number; estimatedTimeRemaining?: number }
  // Context menu request (WebView -> Extension)
  | { type: 'showContextMenu'; menuId: string; items: ContextMenuItem[] }
  // Configuration requests (WebView -> Extension)
  | { type: 'getConfig' }
  | { type: 'updateMCPServer'; server: MCPServerConfig }
  | { type: 'updateWorkflow'; workflow: WorkflowConfig }
  | { type: 'updatePrompt'; prompt: PromptPresetConfig }
  | { type: 'updateProvider'; provider: ProviderConfig }
  | { type: 'deleteMCPServer'; id: string }
  | { type: 'deleteWorkflow'; id: string }
  | { type: 'deletePrompt'; id: string }
  | { type: 'deleteProvider'; id: string }
  // Tool execution messages (Extension -> WebView)
  | { type: 'tool.execute'; requestId: string; toolName: string; params: Record<string, unknown> }
  // Tool execution response (WebView -> Extension)
  | { type: 'tool.result'; requestId: string; success: boolean; result?: unknown; error?: string }
  // AI Action execution request (WebView -> Extension)
  | { type: 'executeAIAction'; actionId: string; elementIds: string[]; params?: Record<string, unknown> }
  // Template execution requests (WebView -> Extension)
  | { type: 'getTemplates'; category?: string }
  | { type: 'executeTemplate'; templateId: string; params: Record<string, unknown> }
  | { type: 'cancelTemplateExecution'; templateId: string }
  // Provider model discovery (WebView -> Extension)
  | { type: 'listProviderModels'; providerId: string; requestId: string }
  // Plan mode messages (WebView -> Extension)
  | { type: 'planApprove'; planId: string; conversationId: string; filePath?: string }
  | { type: 'planReject'; planId: string; conversationId: string }
  | { type: 'planStepApprove'; planId: string; stepId: string; conversationId: string }
  | { type: 'planStepReject'; planId: string; stepId: string; conversationId: string }
  | { type: 'planStepModify'; planId: string; stepId: string; newDescription: string; conversationId: string }
  // File range read request (WebView -> Extension) - for testing on-demand loading
  | { type: 'readFileRange'; requestId: string; path: string; start: number; end: number };
