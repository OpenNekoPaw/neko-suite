import { useState, useCallback, memo } from 'react';
import { ToolCall } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { ImagePreview, AudioPlayer, VideoPlayer } from '@/components/ChatView/MediaPreview';
import { VSCodeMessages } from '@/components/hooks/useVSCode';

// Get vscode API for postMessage
const vscode = (window as { vscode?: { postMessage: (msg: unknown) => void } }).vscode;

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

// Tools that generate images
const IMAGE_GENERATION_TOOLS = ['generate_image', 'image_generation', 'create_image', 'text_to_image'];

// Tools that generate videos
const VIDEO_GENERATION_TOOLS = ['generate_video', 'video_generation', 'create_video', 'text_to_video'];

// Tools that generate audio
const AUDIO_GENERATION_TOOLS = ['generate_audio', 'audio_generation', 'create_audio', 'text_to_audio', 'text_to_speech'];

// Tools that read/write files
const FILE_TOOLS = ['read_file', 'write_file', 'edit_file', 'create_file', 'delete_file'];

/**
 * Check if a URL is valid for display in webview
 */
function isValidMediaUrl(url: string, extensions: string[]): boolean {
  if (!url || typeof url !== 'string') return false;

  // Accept HTTP/HTTPS URLs
  if (url.startsWith('http://') || url.startsWith('https://')) return true;

  // Accept VSCode webview resource URIs (from backend conversion)
  if (url.includes('vscode-webview-resource://') || url.includes('vscode-resource')) return true;

  // Accept base64 data URLs for the given type
  if (url.startsWith('data:')) return true;

  // Accept local file paths with matching extensions
  if (url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url)) {
    const lowerUrl = url.toLowerCase();
    return extensions.some(ext => lowerUrl.endsWith(ext));
  }

  return false;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'];

function isValidImageUrl(url: string): boolean {
  return isValidMediaUrl(url, IMAGE_EXTENSIONS);
}

function isValidVideoUrl(url: string): boolean {
  return isValidMediaUrl(url, VIDEO_EXTENSIONS);
}

function isValidAudioUrl(url: string): boolean {
  return isValidMediaUrl(url, AUDIO_EXTENSIONS);
}

/**
 * Check if a string is a valid file path
 */
function isFilePath(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  // Absolute paths (Unix or Windows)
  if (str.startsWith('/') || /^[A-Za-z]:\\/.test(str)) return true;
  // Relative paths with file extensions
  if (/\.\w{1,10}$/.test(str) && !str.includes('://')) return true;
  return false;
}

/**
 * Extract file paths from tool arguments or results
 */
function extractFilePath(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Common field names for file paths
  const pathFields = ['path', 'filePath', 'file_path', 'file', 'filename'];
  for (const field of pathFields) {
    const value = obj[field];
    if (typeof value === 'string' && isFilePath(value)) {
      return value;
    }
  }
  return null;
}

// Check if result contains image URLs
function extractImageUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];

  const result = data as Record<string, unknown>;
  const urlSet = new Set<string>();

  // Check common image URL patterns - use Set to deduplicate
  if (typeof result.url === 'string') urlSet.add(result.url);
  if (typeof result.imageUrl === 'string') urlSet.add(result.imageUrl);
  // Skip thumbnailUrl as it's usually same as main URL or lower quality
  if (Array.isArray(result.urls)) {
    for (const u of result.urls) {
      if (typeof u === 'string') urlSet.add(u);
    }
  }
  if (Array.isArray(result.images)) {
    for (const img of result.images) {
      if (typeof img === 'string') urlSet.add(img);
      else if (img && typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') {
        urlSet.add((img as Record<string, unknown>).url as string);
      }
    }
  }

  // Filter valid image URLs and return unique array
  return Array.from(urlSet).filter(isValidImageUrl);
}

// Extract local path from result data (preserved during webview URI conversion)
function extractLocalPath(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const result = data as Record<string, unknown>;
  if (typeof result.localPath === 'string') return result.localPath;
  // Fallback to url if it's a local path
  if (typeof result.url === 'string') {
    const url = result.url;
    if (url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url)) {
      return url;
    }
  }
  return undefined;
}

// Extract local paths array from result data
function extractLocalPaths(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const result = data as Record<string, unknown>;

  // Check localPaths array first
  if (Array.isArray(result.localPaths)) {
    return result.localPaths.filter((p): p is string => typeof p === 'string');
  }

  // Fallback to single localPath
  const singlePath = extractLocalPath(data);
  if (singlePath) return [singlePath];

  // Fallback to urls if they are local paths
  if (Array.isArray(result.urls)) {
    return result.urls.filter((u): u is string => {
      if (typeof u !== 'string') return false;
      return u.startsWith('/') || /^[A-Za-z]:[\\/]/.test(u);
    });
  }

  return [];
}

// Check if result contains video URLs
function extractVideoUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];

  const result = data as Record<string, unknown>;
  const urlSet = new Set<string>();

  // Check common video URL patterns
  if (typeof result.url === 'string') urlSet.add(result.url);
  if (typeof result.videoUrl === 'string') urlSet.add(result.videoUrl);
  if (Array.isArray(result.urls)) {
    for (const u of result.urls) {
      if (typeof u === 'string') urlSet.add(u);
    }
  }
  if (Array.isArray(result.videos)) {
    for (const vid of result.videos) {
      if (typeof vid === 'string') urlSet.add(vid);
      else if (vid && typeof vid === 'object' && typeof (vid as Record<string, unknown>).url === 'string') {
        urlSet.add((vid as Record<string, unknown>).url as string);
      }
    }
  }

  return Array.from(urlSet).filter(isValidVideoUrl);
}

// Check if result contains audio URLs
function extractAudioUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];

  const result = data as Record<string, unknown>;
  const urlSet = new Set<string>();

  // Check common audio URL patterns
  if (typeof result.url === 'string') urlSet.add(result.url);
  if (typeof result.audioUrl === 'string') urlSet.add(result.audioUrl);
  if (Array.isArray(result.urls)) {
    for (const u of result.urls) {
      if (typeof u === 'string') urlSet.add(u);
    }
  }
  if (Array.isArray(result.audios)) {
    for (const aud of result.audios) {
      if (typeof aud === 'string') urlSet.add(aud);
      else if (aud && typeof aud === 'object' && typeof (aud as Record<string, unknown>).url === 'string') {
        urlSet.add((aud as Record<string, unknown>).url as string);
      }
    }
  }

  return Array.from(urlSet).filter(isValidAudioUrl);
}

/**
 * Extract smart summary from tool arguments based on tool type
 * Returns a concise string representation of the most important parameter
 */
function getToolSummary(toolName: string, args: Record<string, unknown>): string {
  // File operations - show file name
  if (FILE_TOOLS.includes(toolName)) {
    const filePath = extractFilePath(args);
    if (filePath) {
      return filePath.split('/').pop() || filePath;
    }
  }

  // Search/find operations - show pattern
  const pattern = args['pattern'] || args['query'] || args['search'];
  if (typeof pattern === 'string') {
    return pattern.length > 30 ? pattern.slice(0, 30) + '...' : pattern;
  }

  // Command execution - show command
  const command = args['command'] || args['cmd'];
  if (typeof command === 'string') {
    return command.length > 40 ? command.slice(0, 40) + '...' : command;
  }

  // URL operations - show URL
  const url = args['url'];
  if (typeof url === 'string') {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname.slice(0, 20);
    } catch {
      return url.slice(0, 40);
    }
  }

  // Fallback: show first string argument (truncated)
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > 0 && key !== 'id') {
      const display = value.length > 40 ? value.slice(0, 40) + '...' : value;
      return display;
    }
  }

  // No good summary, return empty
  return '';
}

function ToolCallDisplayComponent({ toolCall }: ToolCallDisplayProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Handle opening a file
  const handleOpenFile = useCallback((filePath: string) => {
    vscode?.postMessage({ type: 'openFile', filePath });
  }, []);

  // Handle tool confirmation (ask mode)
  const handleConfirm = useCallback((approved: boolean) => {
    console.log('[ToolCallDisplay] handleConfirm called:', {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      approved,
    });
    VSCodeMessages.confirmTool(toolCall.id, approved);
  }, [toolCall.id, toolCall.name]);

  const argsJson = JSON.stringify(toolCall.arguments, null, 2);
  const resultJson = toolCall.result?.data !== undefined
    ? JSON.stringify(toolCall.result.data, null, 2)
    : null;

  const hasExpandableContent =
    Object.keys(toolCall.arguments).length > 0 ||
    (resultJson !== null && resultJson.length > 0);

  // Check if this is a background mode task
  const resultData = toolCall.result?.data as Record<string, unknown> | undefined;
  const isBackgroundMode = resultData?.backgroundMode === true;
  const backgroundTaskStatus = resultData?.status as string | undefined;

  // For background tasks: show preview if task is completed (session reload case)
  // Skip preview only if task is still running (TaskCard handles live preview)
  const isBackgroundTaskCompleted = isBackgroundMode && backgroundTaskStatus === 'completed';
  const shouldShowMediaPreview = !isBackgroundMode || isBackgroundTaskCompleted;

  // Check if this is an image generation tool with image results
  const isImageTool = IMAGE_GENERATION_TOOLS.includes(toolCall.name);
  const imageUrls = (toolCall.result?.success && shouldShowMediaPreview)
    ? extractImageUrls(toolCall.result.data)
    : [];

  // Check if this is a video generation tool with video results
  const isVideoTool = VIDEO_GENERATION_TOOLS.includes(toolCall.name);
  const videoUrls = (toolCall.result?.success && shouldShowMediaPreview)
    ? extractVideoUrls(toolCall.result.data)
    : [];

  // Check if this is an audio generation tool with audio results
  const isAudioTool = AUDIO_GENERATION_TOOLS.includes(toolCall.name);
  const audioUrls = (toolCall.result?.success && shouldShowMediaPreview)
    ? extractAudioUrls(toolCall.result.data)
    : [];

  // Extract local paths for file opening (preserved during webview URI conversion)
  const localPaths = toolCall.result?.success
    ? extractLocalPaths(toolCall.result.data)
    : [];

  // Check if this is a file tool and extract file path
  const isFileTool = FILE_TOOLS.includes(toolCall.name);
  const filePath = extractFilePath(toolCall.arguments) || extractFilePath(toolCall.result?.data);

  // Get smart summary for compact display
  const summary = getToolSummary(toolCall.name, toolCall.arguments);

  // Determine status
  const isPending = !toolCall.result;
  const isSuccess = toolCall.result?.success === true;
  const isFailed = toolCall.result?.success === false;
  const needsConfirmation = toolCall.pendingConfirmation === true;

  // If needs confirmation, show confirmation UI
  if (needsConfirmation) {
    console.log('[ToolCallDisplay] Rendering confirmation UI for:', {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      hasResult: !!toolCall.result,
    });
    return (
      <div className="my-2 border border-[var(--vscode-inputValidation-warningBorder)] rounded-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--vscode-inputValidation-warningBackground)]">
          <WarningIcon className="w-4 h-4 text-[var(--vscode-inputValidation-warningBorder)] shrink-0" />
          <span className="font-medium text-[12px] text-[var(--vscode-foreground)]">
            Tool Confirmation Required
          </span>
        </div>

        {/* Content */}
        <div className="px-3 py-2 bg-[var(--vscode-editor-background)]">
          {/* Tool name and action */}
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-[11px] px-1.5 py-0.5 bg-[var(--vscode-textBlockQuote-background)] rounded">
              {toolCall.name}
            </span>
            {toolCall.confirmation?.action && (
              <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
                {toolCall.confirmation.action}
              </span>
            )}
          </div>

          {/* Description */}
          {toolCall.confirmation?.description && (
            <p className="text-[11px] text-[var(--vscode-foreground)] mb-2">
              {toolCall.confirmation.description}
            </p>
          )}

          {/* Summary */}
          {summary && (
            <div className="text-[10px] font-mono text-[var(--vscode-descriptionForeground)] mb-2 truncate">
              {summary}
            </div>
          )}

          {/* Expandable details */}
          {hasExpandableContent && (
            <div className="mb-2">
              <button
                onClick={toggleExpand}
                className="flex items-center gap-1 text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline"
              >
                <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                {isExpanded ? 'Hide details' : 'Show details'}
              </button>

              {isExpanded && (
                <div className="mt-1 pl-2 border-l border-[var(--vscode-panel-border)]">
                  <pre className="p-1.5 bg-[var(--vscode-textBlockQuote-background)] rounded overflow-x-auto font-mono text-[10px] max-h-[100px] w-full max-w-full">
                    {argsJson}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Confirmation buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--vscode-panel-border)]">
            <button
              onClick={() => handleConfirm(true)}
              className="px-3 py-1 text-[11px] font-medium rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              Allow
            </button>
            <button
              onClick={() => handleConfirm(false)}
              className="px-3 py-1 text-[11px] font-medium rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] transition-colors"
            >
              Deny
            </button>
            <span className="flex-1" />
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              Press Enter to allow, Esc to deny
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-1">
      {/* Compact single-line header - Claude Code style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors
          ${isPending ? 'bg-[var(--vscode-textBlockQuote-background)]' : ''}
          ${isSuccess ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#22c55e)]' : ''}
          ${isFailed ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]' : ''}
          hover:bg-[var(--vscode-list-hoverBackground)]
        `}
        onClick={hasExpandableContent ? toggleExpand : undefined}
      >
        {/* Status indicator */}
        {isPending && <LoadingSpinner className="w-3 h-3 text-[var(--vscode-textLink-foreground)] shrink-0" />}
        {isSuccess && <SuccessIcon className="w-3 h-3 text-[var(--vscode-charts-green)] shrink-0" />}
        {isFailed && <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />}

        {/* Tool name */}
        <span className="font-medium text-[var(--vscode-foreground)] shrink-0">
          {toolCall.name}
        </span>

        {/* Summary (file name, pattern, etc.) */}
        {summary && (
          <span className="text-[var(--vscode-descriptionForeground)] font-mono truncate">
            {summary}
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Open file button for file tools */}
        {isFileTool && filePath && isSuccess && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFile(filePath);
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1 shrink-0"
            title={`Open ${filePath}`}
          >
            <FileIcon className="w-3 h-3" />
            <span>Open</span>
          </button>
        )}

        {/* Duration */}
        {toolCall.result?.duration && (
          <span className="text-[var(--vscode-descriptionForeground)] text-[10px] shrink-0">
            {toolCall.result.duration}ms
          </span>
        )}

        {/* Expand indicator */}
        {hasExpandableContent && (
          <ChevronIcon className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </div>

      {/* Error message (always show if failed) */}
      {isFailed && toolCall.result?.error && (
        <div className="px-2 py-1 text-[10px] text-[var(--vscode-charts-red)] bg-[var(--vscode-inputValidation-errorBackground)]">
          {toolCall.result.error}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 ml-4 pl-2 border-l border-[var(--vscode-panel-border)] text-[10px]">
          {/* Arguments */}
          {Object.keys(toolCall.arguments).length > 0 && (
            <div className="mb-2">
              <div className="text-[var(--vscode-descriptionForeground)] opacity-70 mb-0.5">
                {t('chat.toolCall.args')}
              </div>
              <pre className="p-1.5 bg-[var(--vscode-editor-background)] rounded overflow-x-auto font-mono border border-[var(--vscode-panel-border)] max-h-[150px] w-full max-w-full">
                {argsJson}
              </pre>
            </div>
          )}

          {/* Result data */}
          {resultJson && (
            <div>
              <div className="text-[var(--vscode-descriptionForeground)] opacity-70 mb-0.5">
                Result
              </div>
              <pre className="p-1.5 bg-[var(--vscode-editor-background)] rounded overflow-x-auto font-mono border border-[var(--vscode-panel-border)] max-h-[150px] w-full max-w-full">
                {resultJson}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Image preview for image generation tools (always show if available) */}
      {isImageTool && imageUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {imageUrls.map((url, index) => (
            <ImagePreview
              key={index}
              src={url}
              alt={`Generated image ${index + 1}`}
              name={`generated_${index + 1}.png`}
              localPath={localPaths[index] || localPaths[0]}
            />
          ))}
        </div>
      )}

      {/* Video preview for video generation tools (always show if available) */}
      {isVideoTool && videoUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {videoUrls.map((url, index) => (
            <VideoPlayer
              key={index}
              src={url}
              title={`generated_${index + 1}.mp4`}
              localPath={localPaths[index] || localPaths[0]}
            />
          ))}
        </div>
      )}

      {/* Audio preview for audio generation tools (always show if available) */}
      {isAudioTool && audioUrls.length > 0 && (
        <div className="mt-2 space-y-2">
          {audioUrls.map((url, index) => (
            <AudioPlayer
              key={index}
              src={url}
              title={`generated_${index + 1}.mp3`}
              localPath={localPaths[index] || localPaths[0]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const ToolCallDisplay = memo(ToolCallDisplayComponent);

// File icon
function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// Chevron icon
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Success icon
function SuccessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Error icon
function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Warning icon
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

// Loading spinner
function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
