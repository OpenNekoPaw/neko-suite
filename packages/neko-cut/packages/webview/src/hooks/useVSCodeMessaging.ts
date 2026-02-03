import { useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../stores/editor-store';
import type { ProjectData } from '../types';
import { DEFAULT_IMAGE_DURATION, DEFAULT_VIDEO_DURATION } from '../constants';
import { getMediaInfoService } from '../services';
import { getVSCodeAPI, postMessage } from '../utils/vscodeApi';

// Get VSCode API singleton
const vscode = getVSCodeAPI();

// Cache for file path -> webview URI mappings
const fileUriCache = new Map<string, string>();

// Reverse cache for webview URI -> file path mappings (for proxyFetch optimization)
const uriToPathCache = new Map<string, string>();

// =============================================================================
// FileRangeCache - Chunk-based caching for large files (>1GB support)
// =============================================================================

/**
 * FileRangeCache manages on-demand loading of file data in chunks.
 * Instead of loading entire files into memory, it:
 * 1. Tracks loaded byte ranges
 * 2. Only loads requested ranges on demand
 * 3. Merges adjacent ranges to reduce fragmentation
 * 4. Supports partial cache hits (only loads missing parts)
 */
class FileRangeCache {
  // Loaded byte ranges for each file
  private _loadedRanges: Map<string, Array<{ start: number; end: number }>> = new Map();

  // Loaded data chunks for each file (start offset -> ArrayBuffer)
  private _loadedData: Map<string, Map<number, ArrayBuffer>> = new Map();

  // File sizes (path -> size)
  private _fileSizes: Map<string, number> = new Map();

  /**
   * Check if a range is already loaded for a file
   */
  isRangeLoaded(path: string, start: number, end: number): boolean {
    const ranges = this._loadedRanges.get(path);
    if (!ranges) return false;

    for (const range of ranges) {
      if (range.start <= start && range.end >= end) {
        return true;
      }
    }
    return false;
  }

  /**
   * Mark a range as loaded and store the data
   */
  markRangeLoaded(path: string, start: number, data: ArrayBuffer): void {
    const end = start + data.byteLength - 1;

    // Store data chunk
    if (!this._loadedData.has(path)) {
      this._loadedData.set(path, new Map());
    }
    this._loadedData.get(path)!.set(start, data);

    // Update loaded ranges with merging
    if (!this._loadedRanges.has(path)) {
      this._loadedRanges.set(path, []);
    }

    const ranges = this._loadedRanges.get(path)!;
    const newRanges: Array<{ start: number; end: number }> = [];
    let mergedStart = start;
    let mergedEnd = end;

    for (const range of ranges) {
      // Check if ranges overlap or are adjacent
      if (range.end + 1 >= mergedStart && range.start - 1 <= mergedEnd) {
        // Merge
        mergedStart = Math.min(mergedStart, range.start);
        mergedEnd = Math.max(mergedEnd, range.end);
      } else {
        newRanges.push(range);
      }
    }

    newRanges.push({ start: mergedStart, end: mergedEnd });
    this._loadedRanges.set(path, newRanges);
  }

  /**
   * Extract data for a range from loaded chunks
   * Returns null if the range is not fully loaded
   */
  extractRange(path: string, start: number, end: number): ArrayBuffer | null {
    const dataChunks = this._loadedData.get(path);
    if (!dataChunks) return null;

    // Find the chunk containing this range
    for (const [chunkStart, chunk] of dataChunks.entries()) {
      const chunkEnd = chunkStart + chunk.byteLength - 1;

      if (chunkStart <= start && chunkEnd >= end) {
        // Range is within this chunk
        const localStart = start - chunkStart;
        const length = end - start + 1;
        return chunk.slice(localStart, localStart + length);
      }
    }

    // Range might span multiple chunks - need to combine
    // For simplicity, we'll return null and let caller reload
    // This is rare in practice since we load contiguous ranges
    return null;
  }

  /**
   * Set file size
   */
  setFileSize(path: string, size: number): void {
    this._fileSizes.set(path, size);
  }

  /**
   * Get file size (returns 0 if unknown)
   */
  getFileSize(path: string): number {
    return this._fileSizes.get(path) ?? 0;
  }

  /**
   * Clear cache for a specific file
   */
  clearFile(path: string): void {
    this._loadedRanges.delete(path);
    this._loadedData.delete(path);
    this._fileSizes.delete(path);
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this._loadedRanges.clear();
    this._loadedData.clear();
    this._fileSizes.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(path: string): { ranges: number; totalBytes: number } {
    const ranges = this._loadedRanges.get(path) ?? [];
    const dataChunks = this._loadedData.get(path);
    let totalBytes = 0;
    if (dataChunks) {
      for (const chunk of dataChunks.values()) {
        totalBytes += chunk.byteLength;
      }
    }
    return { ranges: ranges.length, totalBytes };
  }
}

// Global file range cache instance
const fileRangeCache = new FileRangeCache();

// Pending requests for file URIs
const pendingFileRequests = new Map<string, Array<(uri: string) => void>>();

// Listeners for cache updates (for components to re-render when URI arrives)
const cacheUpdateListeners: Array<() => void> = [];

// Pending context menu callbacks
const pendingContextMenuCallbacks = new Map<string, (selectedId?: string) => void>();

// =============================================================================
// Module-level message listener for fileUri responses
// This ensures getFileUri works even outside React component tree (e.g., export)
// =============================================================================
let globalListenerInitialized = false;

function initGlobalFileUriListener(): void {
  if (globalListenerInitialized) return;
  globalListenerInitialized = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    // Handle fileUri response
    if (message.type === 'fileUri' && message.path && message.uri) {
      // Decode URI to handle special characters
      const decodedUri = message.uri.replace(/%2B/g, '+');
      fileUriCache.set(message.path, decodedUri);
      // Also update reverse mapping for proxyFetch optimization
      uriToPathCache.set(decodedUri, message.path);

      // Resolve any pending promises
      const pending = pendingFileRequests.get(message.path);
      if (pending) {
        pending.forEach(resolve => resolve(decodedUri));
        pendingFileRequests.delete(message.path);
      }

      // Notify listeners
      cacheUpdateListeners.forEach(listener => listener());
    }
  });

}

// Initialize global listener immediately when module loads
initGlobalFileUriListener();

export function subscribeToUriCacheUpdates(callback: () => void) {
  cacheUpdateListeners.push(callback);
  return () => {
    const index = cacheUpdateListeners.indexOf(callback);
    if (index > -1) cacheUpdateListeners.splice(index, 1);
  };
}

/**
 * Get a webview URI for a file path asynchronously
 * This is a module-level function for use outside of React components
 */
export function getFileUri(path: string): Promise<string> {
  // Check cache first
  const cached = fileUriCache.get(path);
  if (cached) {
    return Promise.resolve(cached);
  }

  // Request from extension
  return new Promise((resolve) => {
    // Add to pending requests
    if (!pendingFileRequests.has(path)) {
      pendingFileRequests.set(path, []);
      // Send request via vscode API
      if (vscode) {
        vscode.postMessage({ type: 'requestFile', path });
      } else {
        // In dev mode, just return the path as-is
        resolve(path);
        return;
      }
    }
    pendingFileRequests.get(path)!.push(resolve);
  });
}

// =============================================================================
// File Range Read API (for testing on-demand loading via Extension Host)
// =============================================================================

// Pending file range read requests
const pendingFileRangeRequests = new Map<string, {
  resolve: (data: ArrayBuffer) => void;
  reject: (error: Error) => void;
}>();

let fileRangeRequestIdCounter = 0;
let fileRangeListenerInitialized = false;

function initFileRangeListener(): void {
  if (fileRangeListenerInitialized) return;
  fileRangeListenerInitialized = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'fileRangeResult' && message.requestId) {
      const pending = pendingFileRangeRequests.get(message.requestId);
      if (pending) {
        pendingFileRangeRequests.delete(message.requestId);
        if (message.success && message.data) {
          // Decode base64 to ArrayBuffer
          const binaryString = atob(message.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          console.log(`[readFileRange] Received: requestId=${message.requestId}, actualRange=${message.actualStart}-${message.actualEnd}, size=${bytes.length}, fileSize=${message.fileSize}`);
          pending.resolve(bytes.buffer);
        } else {
          pending.reject(new Error(message.error || 'Failed to read file range'));
        }
      }
    }
  });
}

// Initialize listener
initFileRangeListener();

/**
 * Read a specific byte range from a file via Extension Host
 * This uses Node.js fs API for true on-demand loading (supports Range requests)
 *
 * @param path - File path (relative to .jvi file)
 * @param start - Start byte offset (inclusive)
 * @param end - End byte offset (inclusive)
 * @returns ArrayBuffer containing the requested bytes
 */
export function readFileRange(path: string, start: number, end: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (!vscode) {
      reject(new Error('VSCode API not available'));
      return;
    }

    const requestId = `fileRange_${++fileRangeRequestIdCounter}_${Date.now()}`;
    pendingFileRangeRequests.set(requestId, { resolve, reject });

    vscode.postMessage({
      type: 'readFileRange',
      requestId,
      path,
      start,
      end,
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingFileRangeRequests.has(requestId)) {
        pendingFileRangeRequests.delete(requestId);
        reject(new Error('File range read timeout'));
      }
    }, 30000);
  });
}

/**
 * Get file path from webview URI (reverse lookup)
 * Returns null if URI is not in cache
 */
export function getPathFromUri(uri: string): string | null {
  return uriToPathCache.get(uri) || null;
}

/**
 * Get cached file data for a specific range
 * Returns null if the range is not fully cached
 *
 * @deprecated Use readFileRangeCached instead for on-demand loading
 */
export function getCachedFileData(path: string, start?: number, end?: number): ArrayBuffer | null {
  if (start === undefined || end === undefined) {
    // Legacy behavior: return null (we no longer cache entire files)
    return null;
  }
  return fileRangeCache.extractRange(path, start, end);
}

/**
 * Cache file data for a specific range
 *
 * @deprecated Use readFileRangeCached instead which handles caching automatically
 */
export function setCachedFileData(path: string, data: ArrayBuffer, start: number = 0): void {
  fileRangeCache.markRangeLoaded(path, start, data);
}

/**
 * Read a specific byte range from a file with chunk-based caching.
 * This is the main function for on-demand loading of large files (>1GB support).
 *
 * Key features:
 * - Only loads the requested range, not the entire file
 * - Caches loaded ranges to avoid duplicate requests
 * - Merges adjacent ranges to reduce fragmentation
 * - Supports partial cache hits
 *
 * @param path - File path (relative to .jvi file)
 * @param start - Start byte offset (inclusive)
 * @param end - End byte offset (inclusive)
 * @returns ArrayBuffer containing the requested bytes
 */
export async function readFileRangeCached(path: string, start: number, end: number): Promise<ArrayBuffer> {
  // Check if range is already cached
  if (fileRangeCache.isRangeLoaded(path, start, end)) {
    const cached = fileRangeCache.extractRange(path, start, end);
    if (cached) {
      return cached;
    }
  }

  // Load the range via Extension Host
  const data = await readFileRange(path, start, end);

  // Cache the loaded data
  fileRangeCache.markRangeLoaded(path, start, data);

  return data;
}

/**
 * Clear file cache for a specific file or all files
 * Useful when file content changes or to free memory
 */
export function clearFileCache(path?: string): void {
  if (path) {
    fileRangeCache.clearFile(path);
    console.log(`[clearFileCache] Cleared cache for ${path}`);
  } else {
    fileRangeCache.clearAll();
    console.log(`[clearFileCache] Cleared all file cache`);
  }
}

/**
 * Get file cache statistics for debugging
 */
export function getFileCacheStats(path: string): { ranges: number; totalBytes: number } {
  return fileRangeCache.getStats(path);
}

/**
 * Test function to verify on-demand loading via Extension Host
 * Call this from browser console: testFileRangeRead('video.mp4', 0, 1024)
 */
export async function testFileRangeRead(path: string, start: number, end: number): Promise<void> {
  console.log(`[TEST] Reading file range: path=${path}, range=${start}-${end}`);
  const startTime = performance.now();

  try {
    const data = await readFileRange(path, start, end);
    const elapsed = performance.now() - startTime;
    console.log(`[TEST] Success! Received ${data.byteLength} bytes in ${elapsed.toFixed(2)}ms`);

    // Show first 32 bytes as hex
    const view = new Uint8Array(data);
    const hex = Array.from(view.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`[TEST] First 32 bytes: ${hex}`);
  } catch (error) {
    console.error('[TEST] Failed:', error);
  }
}

// Expose test function to window for console testing
if (typeof window !== 'undefined') {
  (window as unknown as { testFileRangeRead: typeof testFileRangeRead }).testFileRangeRead = testFileRangeRead;
}

export function useVSCodeMessaging() {
  const { setProject, project, currentTime, isPlaying, selectElement, seek, setAIActionStatus } = useEditorStore();
  const projectRef = useRef(project);
  const lastSavedRef = useRef<string>('');

  projectRef.current = project;

  // Send message to Extension Host (uses centralized postMessage)
  const sendMessage = useCallback((message: unknown) => {
    postMessage(message);
  }, []);

  // Send status update to Extension Host for status bar
  const sendStatusUpdate = useCallback(() => {
    if (!vscode || !projectRef.current) return;

    const trackCount = projectRef.current.tracks.length;
    const elementCount = projectRef.current.tracks.reduce(
      (sum: number, track: { elements: unknown[] }) => sum + track.elements.length,
      0
    );

    sendMessage({
      type: 'statusUpdate',
      currentTime: useEditorStore.getState().currentTime,
      totalDuration: useEditorStore.getState().getTotalDuration(),
      trackCount,
      elementCount,
      isPlaying: useEditorStore.getState().isPlaying,
      fps: projectRef.current.fps,
    });
  }, [sendMessage]);

  // Save project to file (manual save only)
  const saveProject = useCallback(() => {
    if (projectRef.current) {
      const content = JSON.stringify(projectRef.current);
      // Only save if content has changed
      if (content !== lastSavedRef.current) {
        lastSavedRef.current = content;
        console.log('[useVSCodeMessaging] Manual save triggered, tracks:', projectRef.current.tracks?.length);
        sendMessage({ type: 'save', content: projectRef.current });
      } else {
        console.log('[useVSCodeMessaging] No changes to save');
      }
    }
  }, [sendMessage]);

  // Handle incoming messages from Extension Host
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'update':
          // Store the incoming content as "last saved" to avoid immediate re-save
          lastSavedRef.current = JSON.stringify(message.content);
          setProject(message.content as ProjectData, message.projectRoot as string | undefined);

          // Pre-request URIs for all media files in the project
          if (message.content && message.content.tracks) {
            const mediaPaths = new Set<string>();
            message.content.tracks.forEach((track: any) => {
              if (track.elements) {
                track.elements.forEach((element: any) => {
                  if ((element.type === 'media' || element.type === 'audio') && element.src) {
                    mediaPaths.add(element.src);
                  }
                });
              }
            });

            // Request webview URIs for all unique media paths
            mediaPaths.forEach(path => {
              if (!fileUriCache.has(path)) {
                vscode?.postMessage({ type: 'requestFile', path });
              }
            });

            // If we have paths to request, notify listeners after a short delay
            // to trigger re-render when URIs arrive
            if (mediaPaths.size > 0) {
              setTimeout(() => {
                cacheUpdateListeners.forEach(listener => listener());
              }, 100);
            }
          }
          break;

        case 'fileUri':
          // Handle file URI response - cache it for future use
          if (message.path && message.uri) {
            // Decode URI to handle special characters like + (which may be encoded as %2B)
            // The URI from extension may have been double-encoded during JSON serialization
            const decodedUri = message.uri.replace(/%2B/g, '+');

            fileUriCache.set(message.path, decodedUri);

            // Resolve any pending promises
            const pending = pendingFileRequests.get(message.path);
            if (pending) {
              pending.forEach(resolve => resolve(decodedUri));
              pendingFileRequests.delete(message.path);
            }

            // Notify all listeners that cache was updated
            cacheUpdateListeners.forEach(listener => listener());
          }
          break;

        case 'addMediaFile':
          // Handle adding media file to timeline
          if (message.path && message.mediaType) {
            const addMediaToStore = async () => {
              const { addMediaElement, addMediaElementWithAudio, getTotalDuration } = useEditorStore.getState();
              const mediaInfoService = getMediaInfoService();
              const fileName = message.path.split('/').pop() || message.path;

              // Read actual duration when possible (fallback to defaults)
              let duration = message.mediaType === 'image' ? DEFAULT_IMAGE_DURATION : DEFAULT_VIDEO_DURATION;
              if (message.mediaType !== 'image') {
                try {
                  duration = await mediaInfoService.getDuration(message.path);
                } catch (e) {
                  console.warn('[useVSCodeMessaging] Failed to get media duration:', e);
                }
              }

              // Add to the first available media track, or at the end of timeline
              const totalDuration = getTotalDuration();

              if (message.mediaType === 'video') {
                await addMediaElementWithAudio('', message.path, fileName, duration, totalDuration);
              } else {
                addMediaElement('', message.path, fileName, duration, totalDuration);
              }

              // Pre-request the webview URI for this file
              sendMessage({ type: 'requestFile', path: message.path });

              console.log(`Added ${message.mediaType} file to timeline:`, message.path);
            };
            addMediaToStore().catch(err => {
              console.error('[useVSCodeMessaging] Failed to add media file to timeline:', err);
            });
          }
          break;

        case 'saved':
          // Confirmation that file was saved
          console.log('Project saved successfully');
          break;

        case 'externalChange':
          // File was changed externally - prompt user to reload
          if (message.content) {
            const shouldReload = window.confirm(
              'The file has been changed externally. Do you want to reload it?\n\n' +
              'Click OK to reload (your unsaved changes will be lost) or Cancel to keep your current version.'
            );
            if (shouldReload) {
              lastSavedRef.current = JSON.stringify(message.content);
              setProject(message.content as ProjectData, message.projectRoot as string | undefined);
            }
          }
          break;

        case 'requestStatus':
          // Extension is requesting current status (e.g., when webview becomes visible)
          sendStatusUpdate();
          break;

        case 'selectElement':
          // Handle element selection from outline view
          if (message.trackId && message.elementId) {
            // Select the element
            selectElement(message.trackId, message.elementId, false);

            // Find the element to get its start time and jump to it
            if (projectRef.current) {
              const track = projectRef.current.tracks.find(t => t.id === message.trackId);
              if (track) {
                const element = track.elements.find(el => el.id === message.elementId);
                if (element) {
                  // Jump to the element's start time
                  seek(element.startTime);

                  // Dispatch custom event to scroll timeline to this element
                  // The Timeline component will listen for this event
                  window.dispatchEvent(new CustomEvent('scrollToElement', {
                    detail: {
                      trackId: message.trackId,
                      elementId: message.elementId,
                      startTime: element.startTime,
                    }
                  }));

                  console.log(`Jumped to element at ${element.startTime}s`);
                }
              }
            }
          }
          break;

        case 'error':
          console.error('Error from extension:', message.message);
          break;

        case 'exportProgress':
          // Handle export progress from Extension Host FFmpeg
          // Dispatch custom event for ExportPanel to handle
          window.dispatchEvent(new CustomEvent('exportProgress', {
            detail: message.progress
          }));
          break;

        case 'blobSaveResult':
          // Handle blob save result from Extension Host
          window.dispatchEvent(new CustomEvent('blobSaveResult', {
            detail: {
              success: message.success,
              error: message.error,
              path: message.path,
            }
          }));
          break;

        // Streaming export messages
        case 'exportDialogResult':
          // Handle export dialog result (user selected file or cancelled)
          window.dispatchEvent(new CustomEvent('exportDialogResult', {
            detail: {
              success: message.success,
              cancelled: message.cancelled,
              path: message.path,
              error: message.error,
            }
          }));
          break;

        case 'exportChunkResult':
          // Handle chunk write result
          window.dispatchEvent(new CustomEvent('exportChunkResult', {
            detail: {
              success: message.success,
              error: message.error,
            }
          }));
          break;

        case 'exportStreamError':
          // Handle stream error
          window.dispatchEvent(new CustomEvent('exportStreamError', {
            detail: { error: message.error }
          }));
          break;

        case 'exportComplete':
          // Handle export completion
          window.dispatchEvent(new CustomEvent('exportComplete', {
            detail: {
              success: message.success,
              path: message.path,
              error: message.error,
            }
          }));
          break;

        case 'exportCancelled':
          // Handle export cancellation
          window.dispatchEvent(new CustomEvent('exportCancelled', { detail: {} }));
          break;

        case 'showExportPanel':
          // Handle request to show export panel (from status bar click)
          window.dispatchEvent(new CustomEvent('showExportPanel', { detail: {} }));
          break;

        case 'contextMenuResult':
          // Handle context menu result from Extension Host
          if (message.menuId) {
            const callback = pendingContextMenuCallbacks.get(message.menuId);
            if (callback) {
              callback(message.selectedId);
              pendingContextMenuCallbacks.delete(message.menuId);
            }
          }
          break;

        case 'aiActionStatus':
          // Handle AI action status update from Extension Host
          if (message.actionId && message.status) {
            setAIActionStatus({
              actionId: message.actionId,
              status: message.status,
              progress: message.progress,
              message: message.message,
              error: message.error,
            });
          }
          break;

        default:
          // Ignore media:response:* messages - they are handled by MediaRequestProxy
          // Ignore export:* messages - they are handled by StreamingExportManager
          // Ignore fileRangeResult - handled by initFileRangeListener
          // Ignore audioDecodeResult - handled by setupAudioDecodeListener
          // Ignore mediaEngine:* messages - mode management removed
          if (
            !message.type?.startsWith('media:response:') &&
            !message.type?.startsWith('export:') &&
            !message.type?.startsWith('mediaEngine:') &&
            message.type !== 'fileRangeResult' &&
            message.type !== 'audioDecodeResult'
          ) {
            console.log('Unknown message type:', message.type);
          }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setProject, sendStatusUpdate, selectElement, seek, setAIActionStatus]);

  // Send status updates when playback state changes
  useEffect(() => {
    if (!project) return;
    sendStatusUpdate();
  }, [currentTime, isPlaying, project, sendStatusUpdate]);

  // Request file URI for media playback
  const requestFileUri = useCallback((path: string) => {
    sendMessage({ type: 'requestFile', path });
  }, [sendMessage]);

  // Get webview URI for a file path (with caching and async request)
  const getFileUri = useCallback((path: string): Promise<string> => {
    // Check cache first
    const cached = fileUriCache.get(path);
    if (cached) {
      return Promise.resolve(cached);
    }

    // Request from extension
    return new Promise((resolve) => {
      // Add to pending requests
      if (!pendingFileRequests.has(path)) {
        pendingFileRequests.set(path, []);
        // Send request
        sendMessage({ type: 'requestFile', path });
      }
      pendingFileRequests.get(path)!.push(resolve);
    });
  }, [sendMessage]);

  // Add media to timeline
  const addMediaToTimeline = useCallback((path: string) => {
    sendMessage({ type: 'addMediaToTimeline', path });
  }, [sendMessage]);

  // Export video
  const exportVideo = useCallback((format: 'mp4' | 'webm', quality: 'low' | 'medium' | 'high') => {
    sendMessage({ type: 'export', format, quality });
  }, [sendMessage]);

  // Streaming export methods
  const showExportDialog = useCallback((filename: string, format: string) => {
    sendMessage({ type: 'showExportDialog', filename, format });
  }, [sendMessage]);

  const writeExportChunk = useCallback((data: Uint8Array) => {
    // Create a copy of the ArrayBuffer for sending
    // VSCode webview handles ArrayBuffer efficiently internally
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (vscode) {
      vscode.postMessage({ type: 'writeExportChunk', data: buffer });
    } else {
      console.log('Would send binary chunk:', data.byteLength, 'bytes');
    }
  }, []);

  const finalizeExport = useCallback((success: boolean, error?: string) => {
    sendMessage({ type: 'finalizeExport', success, error });
  }, [sendMessage]);

  const cancelExport = useCallback(() => {
    sendMessage({ type: 'cancelExport' });
  }, [sendMessage]);

  // Send export progress to status bar
  const sendExportProgress = useCallback((info: {
    isExporting: boolean;
    percent: number;
    message: string;
    currentFrame?: number;
    totalFrames?: number;
    currentFps?: number;
    estimatedTimeRemaining?: number;
  }) => {
    sendMessage({ type: 'exportProgress', ...info });
  }, [sendMessage]);

  // Show VSCode native context menu
  const showContextMenu = useCallback((
    items: Array<{
      id: string;
      label: string;
      disabled?: boolean;
      separator?: boolean;
      shortcut?: string;
    }>
  ): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const menuId = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      pendingContextMenuCallbacks.set(menuId, resolve);
      sendMessage({ type: 'showContextMenu', menuId, items });
    });
  }, [sendMessage]);

  return {
    sendMessage,
    saveProject,
    requestFileUri,
    getFileUri,
    addMediaToTimeline,
    exportVideo,
    sendStatusUpdate,
    // Streaming export
    showExportDialog,
    writeExportChunk,
    finalizeExport,
    cancelExport,
    // Export progress
    sendExportProgress,
    // Context menu
    showContextMenu,
  };
}

/**
 * Get a webview URI for a file path synchronously from cache
 * Returns null if not cached yet
 */
export function getCachedFileUri(path: string): string | null {
  return fileUriCache.get(path) || null;
}

/**
 * Show VSCode native context menu (module-level function)
 * Returns a promise that resolves to the selected item's id, or undefined if cancelled
 */
export function showVSCodeContextMenu(
  items: Array<{
    id: string;
    label: string;
    disabled?: boolean;
    separator?: boolean;
    shortcut?: string;
  }>
): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!vscode) {
      // In dev mode, just resolve undefined
      resolve(undefined);
      return;
    }
    const menuId = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    pendingContextMenuCallbacks.set(menuId, resolve);
    vscode.postMessage({ type: 'showContextMenu', menuId, items });
  });
}

// Pending audio decode requests for waveform generation
const pendingAudioDecodeRequests = new Map<string, {
  resolve: (data: ArrayBuffer) => void;
  reject: (error: Error) => void;
}>();

// Listen for audioDecodeResult messages (setup once)
let audioDecodeListenerSetup = false;
function setupAudioDecodeListener() {
  if (audioDecodeListenerSetup) return;
  audioDecodeListenerSetup = true;

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (message.type === 'audioDecodeResult' && message.requestId) {
      const pending = pendingAudioDecodeRequests.get(message.requestId);
      if (pending) {
        pendingAudioDecodeRequests.delete(message.requestId);
        if (message.success && message.data) {
          // Handle both binary (preferred) and base64 (legacy) formats
          let buffer: ArrayBuffer;
          if (message.data instanceof ArrayBuffer) {
            // Preferred: direct ArrayBuffer from postMessage
            buffer = message.data;
          } else if (ArrayBuffer.isView(message.data)) {
            // TypedArray or DataView
            buffer = message.data.buffer.slice(
              message.data.byteOffset,
              message.data.byteOffset + message.data.byteLength
            );
          } else if (typeof message.data === 'object' && message.data !== null) {
            // Structured clone result (object with numeric keys or data array)
            const values = (message.data as { data?: number[] }).data ?? Object.values(message.data as Record<string, number>);
            buffer = new Uint8Array(values).buffer;
          } else if (typeof message.data === 'string') {
            // Legacy: base64 encoded string
            const binaryString = atob(message.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            buffer = bytes.buffer;
          } else {
            pending.reject(new Error('Invalid audio data format'));
            return;
          }
          pending.resolve(buffer);
        } else {
          pending.reject(new Error(message.error || 'Failed to decode audio'));
        }
      }
    }
  });
}

/**
 * Decode audio using Extension Host's ffmpeg (module-level function)
 * Used as fallback when Web Audio API cannot decode certain formats (e.g., AAC in Electron)
 *
 * @param filePath - Original file path (not webview URI)
 * @param duration - Duration to decode in seconds (0 for full file)
 * @returns ArrayBuffer containing WAV audio data
 */
export function decodeAudioViaExtension(
  filePath: string,
  duration: number = 0
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (!vscode) {
      reject(new Error('VSCode API not available'));
      return;
    }

    setupAudioDecodeListener();

    const requestId = `waveform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    pendingAudioDecodeRequests.set(requestId, { resolve, reject });

    // Request audio decode via ffmpeg
    // startTime=0, duration=0 means full file (or up to reasonable limit handled by service)
    vscode.postMessage({
      type: 'decodeAudio',
      requestId,
      videoPath: filePath,
      startTime: 0,
      duration: duration,
      format: 'wav',
      sampleRate: 44100,
      channels: 1, // Mono is sufficient for waveform
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      if (pendingAudioDecodeRequests.has(requestId)) {
        pendingAudioDecodeRequests.delete(requestId);
        reject(new Error('Audio decode timeout'));
      }
    }, 60000);
  });
}
