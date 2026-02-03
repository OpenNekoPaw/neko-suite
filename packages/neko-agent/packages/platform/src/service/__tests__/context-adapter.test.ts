/**
 * ProjectContext Adapter Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockProjectContextAdapter,
  createContextSummary,
} from '../../tools/project-adapter';
import type { ElementInput } from '../../types/context';

describe('MockProjectContextAdapter', () => {
  let adapter: MockProjectContextAdapter;

  beforeEach(() => {
    adapter = new MockProjectContextAdapter('test-project', 'Test Project');
  });

  describe('project info', () => {
    it('should have correct project ID and name', () => {
      expect(adapter.projectId).toBe('test-project');
      expect(adapter.projectName).toBe('Test Project');
    });
  });

  describe('timeline context', () => {
    it('should return timeline info', async () => {
      const info = await adapter.getTimelineInfo();

      expect(info.duration).toBeDefined();
      expect(info.fps).toBeDefined();
      expect(info.width).toBeDefined();
      expect(info.height).toBeDefined();
      expect(info.trackCount).toBeDefined();
      expect(info.currentTime).toBeDefined();
    });

    it('should get and set current time', async () => {
      await adapter.setCurrentTime(5.5);
      const time = await adapter.getCurrentTime();

      expect(time).toBe(5.5);
    });

    it('should return empty tracks initially', async () => {
      const tracks = await adapter.getTracks();

      expect(Array.isArray(tracks)).toBe(true);
      expect(tracks.length).toBe(0);
    });

    it('should get track by ID after adding', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      const track = await adapter.getTrack(trackId);

      expect(track).toBeDefined();
      expect(track?.id).toBe(trackId);
      expect(track?.name).toBe('Test Track');
    });

    it('should return undefined for non-existent track', async () => {
      const track = await adapter.getTrack('non-existent');
      expect(track).toBeUndefined();
    });

    it('should add and delete track', async () => {
      const initialTracks = await adapter.getTracks();
      const initialCount = initialTracks.length;

      const trackId = await adapter.addTrack('audio', 'New Audio Track');
      const afterAdd = await adapter.getTracks();
      expect(afterAdd.length).toBe(initialCount + 1);

      await adapter.deleteTrack(trackId);
      const afterDelete = await adapter.getTracks();
      expect(afterDelete.length).toBe(initialCount);
    });
  });

  describe('element management', () => {
    it('should add element to track', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');

      const element: ElementInput = {
        type: 'video',
        startTime: 0,
        duration: 5,
        properties: { name: 'Test Video' },
      };

      const elementId = await adapter.addElement(trackId, element);
      expect(elementId).toBeDefined();

      const retrievedElement = await adapter.getElement(elementId);
      expect(retrievedElement).toBeDefined();
      expect(retrievedElement?.trackId).toBe(trackId);
      expect(retrievedElement?.type).toBe('video');
    });

    it('should get elements by track', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');

      await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 3,
      });

      await adapter.addElement(trackId, {
        type: 'video',
        startTime: 3,
        duration: 2,
      });

      const elements = await adapter.getElements(trackId);
      expect(elements.length).toBeGreaterThanOrEqual(2);
      expect(elements.every((e) => e.trackId === trackId)).toBe(true);
    });

    it('should update element', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      const elementId = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });

      await adapter.updateElement(elementId, {
        startTime: 2,
        duration: 8,
      });

      const updated = await adapter.getElement(elementId);
      expect(updated?.startTime).toBe(2);
      expect(updated?.duration).toBe(8);
    });

    it('should delete element', async () => {
      const trackId = await adapter.addTrack('audio', 'Test Track');
      const elementId = await adapter.addElement(trackId, {
        type: 'audio',
        startTime: 0,
        duration: 3,
      });

      await adapter.deleteElement(elementId);
      const element = await adapter.getElement(elementId);

      expect(element).toBeUndefined();
    });
  });

  describe('media context', () => {
    it('should return empty media list initially', async () => {
      const media = await adapter.getMediaList();
      expect(Array.isArray(media)).toBe(true);
      expect(media.length).toBe(0);
    });

    it('should import media', async () => {
      const mediaId = await adapter.importMedia('/path/to/video.mp4');
      expect(mediaId).toBeDefined();

      const media = await adapter.getMedia(mediaId);
      expect(media).toBeDefined();
      expect(media?.path).toBe('/path/to/video.mp4');
    });

    it('should search media by name', async () => {
      await adapter.importMedia('/videos/intro.mp4');
      await adapter.importMedia('/videos/outro.mp4');
      await adapter.importMedia('/audio/background.mp3');

      const results = await adapter.searchMedia('intro');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('intro.mp4');
    });

    it('should delete media', async () => {
      const mediaId = await adapter.importMedia('/test/file.mp4');
      await adapter.deleteMedia(mediaId);

      const media = await adapter.getMedia(mediaId);
      expect(media).toBeUndefined();
    });

    it('should return undefined for thumbnail when not set', async () => {
      const mediaId = await adapter.importMedia('/video.mp4');
      const thumbnail = await adapter.getThumbnail(mediaId);

      // Mock adapter doesn't set thumbnailUrl
      expect(thumbnail).toBeUndefined();
    });
  });

  describe('selection context', () => {
    it('should return initial empty selection', async () => {
      const selection = await adapter.getSelection();

      expect(selection.elements).toEqual([]);
      expect(selection.tracks).toEqual([]);
    });

    it('should select elements', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      const elementId = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });

      await adapter.selectElements([elementId]);
      const selection = await adapter.getSelection();

      expect(selection.elements).toContain(elementId);
    });

    it('should add to selection', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      const element1 = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });
      const element2 = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 5,
        duration: 5,
      });

      await adapter.selectElements([element1]);
      await adapter.addToSelection([element2]);

      const selection = await adapter.getSelection();
      expect(selection.elements).toContain(element1);
      expect(selection.elements).toContain(element2);
    });

    it('should remove from selection', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      const element1 = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });
      const element2 = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 5,
        duration: 5,
      });

      await adapter.selectElements([element1, element2]);
      await adapter.removeFromSelection([element1]);

      const selection = await adapter.getSelection();
      expect(selection.elements).not.toContain(element1);
      expect(selection.elements).toContain(element2);
    });

    it('should clear selection', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      const elementId = await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });

      await adapter.selectElements([elementId]);
      await adapter.clearSelection();

      const selection = await adapter.getSelection();
      expect(selection.elements).toEqual([]);
    });

    it('should select time range', async () => {
      await adapter.selectTimeRange(5, 10);
      const selection = await adapter.getSelection();

      expect(selection.timeRange).toBeDefined();
      expect(selection.timeRange?.start).toBe(5);
      expect(selection.timeRange?.end).toBe(10);
    });
  });

  describe('project operations', () => {
    it('should track changes', async () => {
      const initialHasChanges = await adapter.hasChanges();
      expect(initialHasChanges).toBe(false);

      const trackId = await adapter.addTrack('video', 'Test Track');
      await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });

      const afterChange = await adapter.hasChanges();
      expect(afterChange).toBe(true);
    });

    it('should save project', async () => {
      const trackId = await adapter.addTrack('video', 'Test Track');
      await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });

      await adapter.save();
      const afterSave = await adapter.hasChanges();

      expect(afterSave).toBe(false);
    });

    it('should support undo/redo', async () => {
      const canUndoInitial = await adapter.canUndo();
      expect(canUndoInitial).toBe(false);

      // Perform an action
      const trackId = await adapter.addTrack('video', 'Test Track');
      await adapter.addElement(trackId, {
        type: 'video',
        startTime: 0,
        duration: 5,
      });

      const canUndoAfter = await adapter.canUndo();
      expect(canUndoAfter).toBe(true);

      await adapter.undo();
      const canRedoAfter = await adapter.canRedo();
      expect(canRedoAfter).toBe(true);
    });
  });
});

describe('createContextSummary', () => {
  let adapter: MockProjectContextAdapter;

  beforeEach(() => {
    adapter = new MockProjectContextAdapter('test', 'Test');
  });

  it('should create summary with project info', async () => {
    const summary = await createContextSummary(adapter);

    expect(summary).toContain('Test');
    expect(summary).toContain('Timeline');
  });

  it('should include timeline information', async () => {
    const summary = await createContextSummary(adapter);

    expect(summary).toContain('FPS');
    expect(summary).toContain('Tracks');
  });

  it('should include track details when tracks exist', async () => {
    await adapter.addTrack('audio', 'Background Music');
    const summary = await createContextSummary(adapter);

    expect(summary).toContain('Background Music');
    expect(summary).toContain('audio');
  });

  it('should include element counts', async () => {
    const trackId = await adapter.addTrack('video', 'Video Track');
    await adapter.addElement(trackId, {
      type: 'video',
      startTime: 0,
      duration: 5,
    });

    const summary = await createContextSummary(adapter);
    expect(summary).toContain('1 elements');
  });

  it('should include selection state when elements selected', async () => {
    const trackId = await adapter.addTrack('video', 'Video Track');
    const elementId = await adapter.addElement(trackId, {
      type: 'video',
      startTime: 0,
      duration: 5,
    });

    await adapter.selectElements([elementId]);
    const summary = await createContextSummary(adapter);

    expect(summary).toContain('Selection');
    expect(summary).toContain('selected');
  });
});
