// TODO: Duplicated hook — neko-story has a thin useVSCodeMessaging (56 lines)
// that wraps acquireVsCodeApi + message listener. This version (462 lines) adds
// heavy domain logic (timeline, export, context menu, AI actions).
// The thin wrapper pattern from neko-story could be extracted to
// @neko/shared/hooks/useVSCodeMessaging as a generic base, with this hook
// composing domain-specific handlers on top of it.

import { useEffect, useCallback, useRef } from 'react';
import { useEditorStore, type EditorStore } from '../stores/editor-store';
import type { EditorSubtitleElement, ProjectData, TextElement, TimelineTrack } from '../types';
import { getLogger } from '../utils/logger';

import { DEFAULT_IMAGE_DURATION, DEFAULT_VIDEO_DURATION } from '../constants';
import { getMediaInfoService } from '../services';
import { CENTERED_TRANSFORM } from '@neko/shared';
import { getVSCodeAPI, postMessage } from '../utils/vscodeApi';
import {
  getFileUri as getFileUriAsync,
  handleFileUriResponse,
  requestFileUri as requestFileUriUtil,
} from '../utils/fileUri';
import {
  buildStoryboardMetadataCues,
  buildStoryboardImageClips,
  normalizeCutStoryboardImportPayload,
} from '../utils/storyboardImport';
import type { CutStoryboardImportPayload } from '../utils/storyboardImport';
import { isFrameServerMessage, publishFrameServerMessage } from '../services/frameServerMessages';

const logger = getLogger('useVSCodeMessaging');

// Get VSCode API singleton
const vscode = getVSCodeAPI();

// Pending context menu callbacks
const pendingContextMenuCallbacks = new Map<string, (selectedId?: string) => void>();

export function useVSCodeMessaging() {
  const {
    setProject,
    project,
    currentTime,
    isPlaying,
    selectElement,
    seek,
    setAIActionStatus,
    addElement,
    addMediaElement,
    addTrack,
    getTotalDuration,
  } = useEditorStore();
  const projectRef = useRef(project);
  const lastSavedRef = useRef<string>('');
  const pendingSaveRef = useRef<string | null>(null);

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
      0,
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
        pendingSaveRef.current = content;
        logger.info('Manual save triggered, tracks:', projectRef.current.tracks?.length);
        sendMessage({ type: 'save', content: projectRef.current });
      } else {
        logger.info('No changes to save');
      }
    }
  }, [sendMessage]);

  const importStoryboard = useCallback(
    (payload: CutStoryboardImportPayload) => {
      importStoryboardToStore(
        {
          addElement,
          addMediaElement,
          addTrack,
          getTotalDuration,
          project: projectRef.current,
        },
        payload,
        sendMessage,
      );
    },
    [addElement, addMediaElement, addTrack, getTotalDuration, sendMessage],
  );

  // Handle incoming messages from Extension Host
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'frameServer:config':
        case 'frameServer:streamCreated':
        case 'frameServer:streamStopped':
          if (isFrameServerMessage(message)) {
            publishFrameServerMessage(message);
          }
          break;

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
            mediaPaths.forEach((path) => {
              requestFileUriUtil(path);
            });
          }
          break;

        case 'fileUri':
          // Delegate to shared fileUri module (handles caching, pending promises, listeners)
          if (message.path && message.uri) {
            handleFileUriResponse(message.path as string, message.uri as string);
          }
          break;

        case 'addMediaFile':
          // Handle adding media file to timeline
          if (message.path && message.mediaType) {
            const addMediaToStore = async () => {
              const { addMediaElement, addMediaElementWithAudio, getTotalDuration } =
                useEditorStore.getState();
              const mediaInfoService = getMediaInfoService();
              const fileName = message.path.split('/').pop() || message.path;

              // Read actual duration when possible (fallback to defaults)
              let duration =
                message.mediaType === 'image' ? DEFAULT_IMAGE_DURATION : DEFAULT_VIDEO_DURATION;
              if (message.mediaType !== 'image') {
                try {
                  duration = await mediaInfoService.getDuration(message.path);
                } catch (e) {
                  logger.warn('Failed to get media duration:', e);
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

              logger.info(`Added ${message.mediaType} file to timeline: ${message.path}`);
            };
            addMediaToStore().catch((err) => {
              logger.error('Failed to add media file to timeline:', err);
            });
          }
          break;

        case 'importStoryboard': {
          const payload = normalizeCutStoryboardImportPayload(message);
          if (!payload) {
            logger.warn('Ignored malformed storyboard import payload');
            break;
          }

          try {
            importStoryboard(payload);
          } catch (err) {
            logger.error('Failed to import storyboard into timeline:', err);
          }
          break;
        }

        case 'saved':
          // Confirmation that file was saved
          if (pendingSaveRef.current) {
            lastSavedRef.current = pendingSaveRef.current;
            pendingSaveRef.current = null;
          }
          logger.info('Project saved successfully');
          break;

        case 'error':
          pendingSaveRef.current = null;
          logger.error('Error from extension:', message.message);
          break;

        case 'externalChange':
          // File was changed externally - prompt user to reload
          if (message.content) {
            const shouldReload = window.confirm(
              'The file has been changed externally. Do you want to reload it?\n\n' +
                'Click OK to reload (your unsaved changes will be lost) or Cancel to keep your current version.',
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
              const track = projectRef.current.tracks.find((t) => t.id === message.trackId);
              if (track) {
                const element = track.elements.find((el) => el.id === message.elementId);
                if (element) {
                  // Jump to the element's start time
                  seek(element.startTime);

                  // Dispatch custom event to scroll timeline to this element
                  // The Timeline component will listen for this event
                  window.dispatchEvent(
                    new CustomEvent('scrollToElement', {
                      detail: {
                        trackId: message.trackId,
                        elementId: message.elementId,
                        startTime: element.startTime,
                      },
                    }),
                  );

                  logger.info(`Jumped to element at ${element.startTime}s`);
                }
              }
            }
          }
          break;

        case 'exportProgress':
          // Handle export progress from Extension Host FFmpeg
          // Dispatch custom event for ExportPanel to handle
          window.dispatchEvent(
            new CustomEvent('exportProgress', {
              detail: message.progress,
            }),
          );
          break;

        case 'blobSaveResult':
          // Handle blob save result from Extension Host
          window.dispatchEvent(
            new CustomEvent('blobSaveResult', {
              detail: {
                success: message.success,
                error: message.error,
                path: message.path,
              },
            }),
          );
          break;

        // Streaming export messages
        case 'exportDialogResult':
          // Handle export dialog result (user selected file or cancelled)
          window.dispatchEvent(
            new CustomEvent('exportDialogResult', {
              detail: {
                success: message.success,
                cancelled: message.cancelled,
                path: message.path,
                error: message.error,
              },
            }),
          );
          break;

        case 'exportChunkResult':
          // Handle chunk write result
          window.dispatchEvent(
            new CustomEvent('exportChunkResult', {
              detail: {
                success: message.success,
                error: message.error,
              },
            }),
          );
          break;

        case 'exportStreamError':
          // Handle stream error
          window.dispatchEvent(
            new CustomEvent('exportStreamError', {
              detail: { error: message.error },
            }),
          );
          break;

        case 'exportComplete':
          // Handle export completion
          window.dispatchEvent(
            new CustomEvent('exportComplete', {
              detail: {
                success: message.success,
                path: message.path,
                error: message.error,
              },
            }),
          );
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
            logger.info('Unknown message type:', message.type);
          }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setProject, sendStatusUpdate, selectElement, seek, setAIActionStatus, importStoryboard]);

  // Send status updates when playback state changes
  useEffect(() => {
    if (!project) return;
    sendStatusUpdate();
  }, [currentTime, isPlaying, project, sendStatusUpdate]);

  // Request file URI for media playback
  const requestFileUri = useCallback(
    (path: string) => {
      sendMessage({ type: 'requestFile', path });
    },
    [sendMessage],
  );

  // Get webview URI for a file path (delegates to shared fileUri module)
  const getFileUri = useCallback((path: string): Promise<string> => {
    return getFileUriAsync(path);
  }, []);

  // Add media to timeline
  const addMediaToTimeline = useCallback(
    (path: string) => {
      sendMessage({ type: 'addMediaToTimeline', path });
    },
    [sendMessage],
  );

  // Export video
  const exportVideo = useCallback(
    (format: 'mp4' | 'webm', quality: 'low' | 'medium' | 'high') => {
      sendMessage({ type: 'export', format, quality });
    },
    [sendMessage],
  );

  // Streaming export methods
  const showExportDialog = useCallback(
    (filename: string, format: string) => {
      sendMessage({ type: 'showExportDialog', filename, format });
    },
    [sendMessage],
  );

  const writeExportChunk = useCallback((data: Uint8Array) => {
    // Create a copy of the ArrayBuffer for sending
    // VSCode webview handles ArrayBuffer efficiently internally
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (vscode) {
      vscode.postMessage({ type: 'writeExportChunk', data: buffer });
    } else {
      logger.info(`Would send binary chunk: ${data.byteLength} bytes`);
    }
  }, []);

  const finalizeExport = useCallback(
    (success: boolean, error?: string) => {
      sendMessage({ type: 'finalizeExport', success, error });
    },
    [sendMessage],
  );

  const cancelExport = useCallback(() => {
    sendMessage({ type: 'cancelExport' });
  }, [sendMessage]);

  // Send export progress to status bar
  const sendExportProgress = useCallback(
    (info: {
      isExporting: boolean;
      percent: number;
      message: string;
      currentFrame?: number;
      totalFrames?: number;
      currentFps?: number;
      estimatedTimeRemaining?: number;
    }) => {
      sendMessage({ type: 'exportProgress', ...info });
    },
    [sendMessage],
  );

  // Show VSCode native context menu
  const showContextMenu = useCallback(
    (
      items: Array<{
        id: string;
        label: string;
        disabled?: boolean;
        separator?: boolean;
        shortcut?: string;
      }>,
    ): Promise<string | undefined> => {
      return new Promise((resolve) => {
        const menuId = `menu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        pendingContextMenuCallbacks.set(menuId, resolve);
        sendMessage({ type: 'showContextMenu', menuId, items });
      });
    },
    [sendMessage],
  );

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

type StoryboardCue = ReturnType<typeof buildStoryboardMetadataCues>[number];
type StoryboardImportStoreActions = Pick<
  EditorStore,
  'addElement' | 'addMediaElement' | 'addTrack' | 'getTotalDuration' | 'project'
>;

function importStoryboardToStore(
  store: StoryboardImportStoreActions,
  payload: CutStoryboardImportPayload,
  sendMessage: (message: unknown) => void,
): void {
  const startTime = store.getTotalDuration();
  const clips = buildStoryboardImageClips(payload, startTime);
  const cues = buildStoryboardMetadataCues(payload, startTime);

  for (const clip of clips) {
    store.addMediaElement('', clip.path, clip.name, clip.duration, clip.startTime);
    sendMessage({ type: 'requestFile', path: clip.path });
  }

  const dialogueCues = cues.filter((cue) => cue.kind === 'dialogue');
  if (dialogueCues.length > 0) {
    const subtitleTrackId = findOrCreateStoryboardTrack(
      store.project?.tracks,
      'subtitle',
      'Storyboard Dialogue',
      store.addTrack,
    );
    for (const cue of dialogueCues) {
      store.addElement(subtitleTrackId, createStoryboardSubtitleElement(cue));
    }
  }

  const noteCues = cues.filter((cue) => cue.kind !== 'dialogue');
  if (noteCues.length > 0) {
    const textTrackId = findOrCreateStoryboardTrack(
      store.project?.tracks,
      'text',
      'Storyboard Audio Notes',
      store.addTrack,
    );
    for (const cue of noteCues) {
      store.addElement(textTrackId, createStoryboardTextElement(cue));
    }
  }

  logger.info(
    `Imported ${clips.length} storyboard shots and ${cues.length} metadata cues from ${payload.projectName} into timeline`,
  );
}

function findOrCreateStoryboardTrack(
  tracks: readonly TimelineTrack[] | undefined,
  type: TimelineTrack['type'],
  name: string,
  addTrack: (type: TimelineTrack['type'], name?: string) => string,
): string {
  return (
    tracks?.find((track) => track.type === type && track.name === name)?.id ?? addTrack(type, name)
  );
}

function createStoryboardSubtitleElement(cue: StoryboardCue): Omit<EditorSubtitleElement, 'id'> {
  return {
    type: 'subtitle',
    name: cue.name,
    text: cue.text,
    fontSize: 48,
    color: '#ffffff',
    fontFamily: 'Arial',
    backgroundColor: 'transparent',
    textAlign: 'center',
    strokeColor: 'transparent',
    strokeWidth: 0,
    duration: cue.duration,
    startTime: cue.startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: CENTERED_TRANSFORM,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

function createStoryboardTextElement(cue: StoryboardCue): Omit<TextElement, 'id'> {
  const prefix = cue.kind === 'voiceOver' ? 'Voice Over' : 'Sound Cue';
  return {
    type: 'text',
    name: cue.name,
    content: `${prefix}: ${cue.text}`,
    fontSize: 36,
    fontFamily: 'Arial',
    color: '#f8fafc',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    textAlign: 'left',
    fontWeight: 'normal',
    fontStyle: 'normal',
    duration: cue.duration,
    startTime: cue.startTime,
    trimStart: 0,
    trimEnd: 0,
    transform: CENTERED_TRANSFORM,
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}
