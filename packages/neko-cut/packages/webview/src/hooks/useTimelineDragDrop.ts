/**
 * useTimelineDragDrop Hook
 * 管理文件拖放导入逻辑
 */

import { useCallback, useState, RefObject } from 'react';
import { PIXELS_PER_SECOND, TRACK_HEIGHT, TRACK_LABEL_WIDTH, DEFAULT_IMAGE_DURATION, DEFAULT_VIDEO_DURATION } from '../constants';
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
  addMediaElementWithAudio: (trackId: string, src: string, name: string, duration: number, startTime: number) => Promise<{ videoElementId: string; audioElementId?: string }>;
  addElement: (trackId: string, element: Omit<TextElement, 'id'>) => void;
  addTrack: (type: 'media' | 'audio' | 'text', name?: string) => string;
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
  onError,
}: TimelineDragDropOptions) {
  // Drag over state
  const [isDragOver, setIsDragOver] = useState(false);

  // Drag over handler
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  // Drag leave handler
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the timeline entirely
    if (!timelineRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, [timelineRef]);

  // Drop handler
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!project) return;

    // Calculate drop position (time)
    const rect = tracksRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left + (tracksRef.current?.scrollLeft || 0) - TRACK_LABEL_WIDTH;
    const y = e.clientY - rect.top + (tracksRef.current?.scrollTop || 0);
    const dropTime = Math.max(0, x / (PIXELS_PER_SECOND * zoomLevel));

    // Determine which track was dropped on based on Y position
    const trackIndex = Math.floor(y / TRACK_HEIGHT);
    const targetTrack = tracks[trackIndex];

    // Helper function to add file to appropriate track (async for duration fetch)
    const addFileToTrack = async (filePath: string, displayName: string, startTime: number): Promise<boolean> => {
      const fileType = getFileType(displayName);
      if (!fileType) {
        // Provide feedback for unsupported file types
        const ext = displayName.slice(displayName.lastIndexOf('.')).toLowerCase();
        onError?.(`Unsupported file type: ${ext || 'unknown'}`);
        return false;
      }

      if (fileType === 'subtitle') {
        // Add subtitle to text track
        let textTrackId = targetTrack?.type === 'text' ? targetTrack.id : '';
        if (!textTrackId) {
          // Find or create a text track
          const existingTextTrack = project.tracks.find(t => t.type === 'text');
          if (existingTextTrack) {
            textTrackId = existingTextTrack.id;
          } else {
            textTrackId = addTrack('text');
          }
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
        // Add audio to audio track
        let audioTrackId = targetTrack?.type === 'audio' ? targetTrack.id : '';
        if (!audioTrackId) {
          const existingAudioTrack = project.tracks.find(t => t.type === 'audio');
          if (existingAudioTrack) {
            audioTrackId = existingAudioTrack.id;
          } else {
            audioTrackId = addTrack('audio');
          }
        }
        // Get real duration from metadata
        let duration = DEFAULT_VIDEO_DURATION;
        try {
          duration = await getMediaInfoService().getDuration(filePath);
        } catch (e) {
          logger.warn('Failed to get audio duration:', e);
        }
        addMediaElement(audioTrackId, filePath, displayName, duration, startTime);
      } else {
        // Add video/image to media track
        let mediaTrackId = targetTrack?.type === 'media' ? targetTrack.id : '';
        if (!mediaTrackId) {
          const existingMediaTrack = project.tracks.find(t => t.type === 'media');
          if (existingMediaTrack) {
            mediaTrackId = existingMediaTrack.id;
          } else {
            mediaTrackId = addTrack('media');
          }
        }
        // Get real duration for video, use default for images
        let duration = DEFAULT_IMAGE_DURATION;
        if (fileType === 'video') {
          try {
            duration = await getMediaInfoService().getDuration(filePath);
          } catch (e) {
            logger.warn('Failed to get video duration:', e);
            duration = DEFAULT_VIDEO_DURATION;
          }
          // Video: use addMediaElementWithAudio for automatic audio track creation
          await addMediaElementWithAudio(mediaTrackId, filePath, displayName, duration, startTime);
        } else {
          // Image: use addMediaElement (no audio)
          addMediaElement(mediaTrackId, filePath, displayName, duration, startTime);
        }
      }
      return true;
    };

    // Helper to wrap getAsString as Promise
    const getUriListAsync = (item: DataTransferItem): Promise<string> => {
      return new Promise(resolve => {
        item.getAsString(resolve);
      });
    };

    // Process drop items asynchronously
    const processDropItems = async () => {
      // First, check for asset library drag data (application/json)
      const jsonData = e.dataTransfer.getData(ASSET_DRAG_MIME);
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData) as AssetDragData;
          const items = getDragItems(data);

          if (items.length > 0) {
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.files && item.files.length > 0) {
                const file = item.files[0];
                await addFileToTrack(file.path, file.name, dropTime + i * 0.5);
              }
            }
            return; // Done processing
          }
        } catch (err) {
          // Not valid JSON or not asset data, continue with other handlers
          logger.debug('JSON parse failed, trying other handlers');
        }
      }

      // Handle files from VSCode Explorer or file system
      const items = e.dataTransfer.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          // Check for VSCode resource URI (text/uri-list)
          if (item.type === 'text/uri-list') {
            const uriList = await getUriListAsync(item);
            const uris = uriList.split('\n').filter(uri => uri.trim());
            for (let idx = 0; idx < uris.length; idx++) {
              const uri = uris[idx];
              // Parse the URI to get file path
              let filePath = uri.trim();
              // Convert file:// URI to path if needed
              if (filePath.startsWith('file://')) {
                filePath = decodeURIComponent(filePath.slice(7));
                // On Windows, remove leading slash from /C:/...
                if (filePath.match(/^\/[A-Za-z]:\//)) {
                  filePath = filePath.slice(1);
                }
              }

              const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'media';
              await addFileToTrack(filePath, fileName, dropTime + idx * 0.5);
            }
          }
        }
      }

      // Also handle files dropped directly (from OS file manager)
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // For files from OS, we need to use webkitRelativePath or name
          // The path property might be available in Electron context
          const filePath = (file as File & { path?: string }).path || file.name;
          await addFileToTrack(filePath, file.name, dropTime + i * 0.5);
        }
      }
    };

    // Execute async processing
    processDropItems().catch(err => {
      logger.error('Error processing drop:', err);
      onError?.('Failed to process dropped files');
    });
  }, [project, tracks, zoomLevel, addMediaElement, addMediaElementWithAudio, addElement, addTrack, tracksRef, onError]);

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
