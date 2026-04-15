/**
 * ImagePreview - Compact image preview card
 * Matches ToolCallDisplay style with collapsible content
 * Supports click-to-open for local files
 */

import { useState, useCallback, memo } from 'react';
import { VSCodeMessages } from '@/messages';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  name?: string;
  className?: string;
  /** Local file path for opening in VSCode */
  localPath?: string;
  /** Inline mode: show only image without header (for use inside cards like TaskCard) */
  inline?: boolean;
}

/**
 * Extract filename from path or URL
 */
function getFileName(src: string, name?: string): string {
  if (name) return name.split('/').pop() || name;
  try {
    const url = new URL(src);
    return url.pathname.split('/').pop() || 'image';
  } catch {
    return src.split('/').pop() || 'image';
  }
}

function ImagePreviewComponent({
  src,
  alt = '',
  name,
  className,
  localPath,
  inline = false,
}: ImagePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fileName = getFileName(src, name);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Open file in VSCode or system default
  const handleOpenFile = useCallback(() => {
    const pathToOpen = localPath || src;
    // Check if it's a local file path
    if (pathToOpen.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathToOpen)) {
      VSCodeMessages.openFile(pathToOpen);
    } else {
      VSCodeMessages.openUrl(pathToOpen);
    }
  }, [localPath, src]);

  // Inline mode: show only the image without header
  if (inline) {
    return (
      <div className={className}>
        {hasError ? (
          <div className="flex items-center justify-center py-4 text-[var(--vscode-errorForeground)] text-[11px] bg-[var(--vscode-editor-background)] rounded">
            <ErrorIcon className="w-4 h-4 mr-2" />
            <span>Failed to load image</span>
          </div>
        ) : (
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--vscode-editor-background)] rounded">
                <LoadingSpinner className="w-5 h-5" />
              </div>
            )}
            <img
              src={src}
              alt={alt}
              onLoad={handleLoad}
              onError={handleError}
              onClick={handleOpenFile}
              className={`w-full max-h-[200px] rounded object-contain cursor-pointer hover:opacity-90 transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`my-1 ${className || ''}`}>
      {/* Compact header - matches ToolCallDisplay style */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-t text-[11px] cursor-pointer transition-colors
          ${
            hasError
              ? 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#ef4444)]'
              : 'bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#22c55e)]'
          }
          hover:bg-[var(--vscode-list-hoverBackground)]
          ${!isExpanded ? 'rounded-b' : ''}
        `}
        onClick={toggleExpand}
      >
        {/* Status indicator */}
        {hasError ? (
          <ErrorIcon className="w-3 h-3 text-[var(--vscode-charts-red)] shrink-0" />
        ) : (
          <ImageIcon className="w-3 h-3 text-[var(--vscode-charts-green)] shrink-0" />
        )}

        {/* File name */}
        <span className="font-medium text-[var(--vscode-foreground)] truncate flex-1">
          {fileName}
        </span>

        {/* Open button */}
        {!hasError && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFile();
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] text-[var(--vscode-button-secondaryForeground)] transition-colors flex items-center gap-1 shrink-0"
            title="Open file"
          >
            <OpenIcon className="w-3 h-3" />
            <span>Open</span>
          </button>
        )}

        {/* Expand indicator */}
        <ChevronIcon
          className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border border-t-0 border-[var(--vscode-panel-border)] rounded-b bg-[var(--vscode-editor-background)] p-2">
          {hasError ? (
            <div className="flex items-center justify-center py-4 text-[var(--vscode-errorForeground)] text-[11px]">
              <ErrorIcon className="w-4 h-4 mr-2" />
              <span>Failed to load image</span>
            </div>
          ) : (
            <div className="relative">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--vscode-editor-background)]">
                  <LoadingSpinner className="w-5 h-5" />
                </div>
              )}
              <img
                src={src}
                alt={alt}
                onLoad={handleLoad}
                onError={handleError}
                onClick={handleOpenFile}
                className={`w-full max-h-[200px] rounded object-contain cursor-pointer hover:opacity-90 transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const ImagePreview = memo(ImagePreviewComponent);

// Icons
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function OpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin text-[var(--vscode-foreground)]`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
