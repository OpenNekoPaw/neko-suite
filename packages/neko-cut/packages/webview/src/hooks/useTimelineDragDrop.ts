/**
 * useTimelineDragDrop Hook
 * 管理文件拖放导入逻辑
 *
 * Race-condition fixes (2026-03-04):
 * 1. Drop data is extracted synchronously during the event handler; async
 *    processing is serialized via dropQueueRef so rapid successive drops never
 *    interleave Zustand state reads.
 * 2. Track resolution uses getCurrentTracks() (live store state) instead of
 *    the stale React-closure snapshot of project.tracks, preventing duplicate
 *    track creation when multiple files are dropped in one gesture.
 */

import { useCallback, useState, useRef, RefObject } from 'react';
import {
  PIXELS_PER_SECOND,
  TRACK_HEIGHT,
  TRACK_LABEL_WIDTH,
  DEFAULT_IMAGE_DURATION,
  DEFAULT_VIDEO_DURATION,
} from '../constants';
import { getFileType } from '../utils';
import type { ProjectData, TimelineTrack, TextElement } from '../types';
import { CENTERED_TRANSFORM, ASSET_DRAG_MIME, getDragItems, type AssetDragData } from '@neko/shared';
import { getMediaInfoService } from '../services';
import { getLogger } from '../utils/logger';

const logger = getLogger('useTimelineDragDrop');

export interface TimelineDragDropOptions {
  timelineRef: RefObject<HTMLDivElement>;
  tracksRef: RefObject<HTMLDivElement>;
  project: ProjectData | null;
  tracks: TimelineTrack[];
  zoomLevel: number;
  addMediaElement: (trackId: string, src: string, name: string, duration: number, startTime: number) => void;
  addMediaElementWithAudio: (
    trackId: string,
    src: string,
    name: string,
    duration: number,
    startTime: number
  ) => Promise<{ videoElementId: string; audioElementId?: string }>;
  addElement: (trackId: string, element: Omit<TextElement, 'id'>) => void;
  addTrack: (type: 'media' | 'audio' | 'text', name?: string) => string;
  /**
   * Read current project tracks from the live store state.
   * Prevents stale-snapshot race: track resolution inside async drop processing
   * must see tracks created by earlier files in the same drop batch.
   */
  getCurrentTracks: () => TimelineTrack[];
  /** Optional callback for error feedback (e.g., unsupported file type) */
  onError?: (message: string) => void;
}

export function useTimelineDragDrop({
  timelineRef,
  tracksRef,
  project,
  tracks,
  zoomLevel,
  addMediaElement,
  addMediaElementWithAudio,
  addElement,
  addTrack,
  getCurrentTracks,
  onError,
}: TimelineDragDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Serializes concurrent drops — each drop's async processing completes before
  // the next begins, preventing interleaved track-creation state reads.
  const dropQueueRef = useRef<Promise<void>>(Promise.resolve());

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only clear when leaving the timeline entirely
      if (!timelineRef.current?.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    },
    [timelineRef]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!project) return;

      // ── Synchronous extraction ─────────────────────────────────────────────
      // dataTransfer data is only accessible during the synchronous event handler.
      // Extract everything before returning so the queued async function has access.
      const rect = tracksRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0) - TRACK_LABEL_WIDTH;
      const y = e.clientY - rect.top + (tracksRef.current?.scrollTop || 0);
      const dropTime = Math.max(0, x / (PIXELS_PER_SECOND * zoomLevel));
      const trackIndex = Math.floor(y / TRACK_HEIGHT);
      const targetTrack = tracks[trackIndex];

      const jsonData = e.dataTransfer.getData(ASSET_DRAG_MIME);
      const uriList = e.dataTransfer.getData('text/uri-list');
      const filesSnapshot: Array<{ name: string; path: string }> = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i]!;
        filesSnapshot.push({
          name: file.name,
          path: (file as File & { path?: string }).path ?? file.name,
        });
      }

      // ── Inner helpers (defined at event time, close over live callbacks) ──

      /** Add a single file to the appropriate timeline track */
      const addFileToTrack = async (
        filePath: string,
        displayName: string,
        startTime: number
      ): Promise<boolean> => {
        const fileType = getFileType(displayName);
        if (!fileType) {
          const ext = displayName.slice(displayName.lastIndexOf('.')).toLowerCase();
          onError?.(`Unsupported file type: ${ext || 'unknown'}`);
          return false;
        }

        if (fileType === 'subtitle') {
          let textTrackId = targetTrack?.type === 'text' ? targetTrack.id : '';
          if (!textTrackId) {
            // Use live state — previous file in the same batch may have created this track
            const existing = getCurrentTracks().find(t => t.type === 'text');
            textTrackId = existing ? existing.id : addTrack('text');
          }
          addElement(textTrackId, {
            type: 'text',
            name: displayName,
            content: displayName,
            startTime,
            duration: 5,
            trimStart: 0,
            trimEnd: 0,
            fontSize: 24,
            fontFamily: 'sans-serif',
            color: '#ffffff',
            backgroundColor: 'transparent',
            textAlign: 'center',
            fontWeight: 'normal',
            fontStyle: 'normal',
            textDecoration: 'none',
            x: 0.5,
            y: 0.85,
            rotation: 0,
            transform: CENTERED_TRANSFORM,
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          } as Omit<TextElement, 'id'>);
        } else if (fileType === 'audio') {
          let audioTrackId = targetTrack?.type === 'audio' ? targetTrack.id : '';
          if (!audioTrackId) {
            // Use live state — avoids duplicate audio tracks across multi-file drops
            const existing = getCurrentTracks().find(t => t.type === 'audio');
            audioTrackId = existing ? existing.id : addTrack('audio');
          }
          let duration = DEFAULT_VIDEO_DURATION;
          try {
            duration = await getMediaInfoService().getDuration(filePath);
          } catch (err) {
            logger.warn('Failed to get audio duration:', err);
          }
          addMediaElement(audioTrackId, filePath, displayName, duration, startTime);
        } else {
          // video or image
          let mediaTrackId = targetTrack?.type === 'media' ? targetTrack.id : '';
          if (!mediaTrackId) {
            // Use live state — avoids duplicate media tracks across multi-file drops
            const existing = getCurrentTracks().find(t => t.type === 'media');
            mediaTrackId = existing ? existing.id : addTrack('media');
          }
          if (fileType === 'video') {
            let duration = DEFAULT_VIDEO_DURATION;
            try {
              duration = await getMediaInfoService().getDuration(filePath);
            } catch (err) {
              logger.warn('Failed to get video duration:', err);
            }
            // addMediaElementWithAudio awaits audio/subtitle detection internally,
            // so the next file won't start until this one's linked tracks are created.
            await addMediaElementWithAudio(mediaTrackId, filePath, displayName, duration, startTime);
          } else {
            // image — no audio detection needed
            addMediaElement(mediaTrackId, filePath, displayName, DEFAULT_IMAGE_DURATION, startTime);
          }
        }
        return true;
      };

      /** Process the extracted drop snapshot asynchronously */
      const processDropItems = async (): Promise<void> => {
        // Priority 1: asset library drag data
        if (jsonData) {
          try {
            const data = JSON.parse(jsonData) as AssetDragData;
            const items = getDragItems(data);
            if (items.length > 0) {
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item?.files && item.files.length > 0) {
                  const file = item.files[0];
                  if (file) {
                    await addFileToTrack(file.path, file.name, dropTime + i * 0.5);
                  }
                }
              }
              return;
            }
          } catch {
            logger.debug('JSON parse failed, trying other handlers');
          }
        }

        // Priority 2: VSCode Explorer / URI list (extracted synchronously above)
        if (uriList) {
          const uris = uriList
            .split('\n')
            .map(u => u.trim())
            .filter(u => u && !u.startsWith('#'));
          for (let idx = 0; idx < uris.length; idx++) {
            let filePath = uris[idx]!;
            if (filePath.startsWith('file://')) {
              filePath = decodeURIComponent(filePath.slice(7));
              // Windows: remove leading slash from /C:/...
              if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
            }
            const fileName =
              filePath.split('/').pop() || filePath.split('\\').pop() || 'media';
            await addFileToTrack(filePath, fileName, dropTime + idx * 0.5);
          }
          return;
        }

        // Priority 3: OS file manager drop (files extracted synchronously above)
        for (let i = 0; i < filesSnapshot.length; i++) {
          const file = filesSnapshot[i]!;
          await addFileToTrack(file.path, file.name, dropTime + i * 0.5);
        }
      };

      // ── Enqueue async processing ───────────────────────────────────────────
      // Chain onto the queue so each drop completes before the next begins.
      dropQueueRef.current = dropQueueRef.current
        .then(() => processDropItems())
        .catch((err: unknown) => {
          logger.error('Error processing drop:', err);
          onError?.('Failed to process dropped files');
        });
    },
    [
      project,
      tracks,
      zoomLevel,
      addMediaElement,
      addMediaElementWithAudio,
      addElement,
      addTrack,
      getCurrentTracks,
      tracksRef,
      onError,
    ]
  );

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
