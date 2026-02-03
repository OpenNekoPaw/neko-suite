/**
 * Project Context Adapters - Bridge between platform and editor
 */

import type {
  ProjectContext,
  TimelineContext,
  MediaContext,
  SelectionContext,
  TimelineInfo,
  TrackInfo,
  ElementInfo,
  ElementInput,
  MediaInfo,
  SelectionInfo,
  ProjectContextEvent,
  ProjectContextListener,
} from '../types/context';

/**
 * Abstract base adapter for project context
 * Subclass this to create concrete implementations
 */
export abstract class BaseProjectContextAdapter implements ProjectContext {
  abstract readonly projectId: string;
  abstract readonly projectName: string;

  protected listeners: Set<ProjectContextListener> = new Set();

  // Timeline methods
  abstract getTimelineInfo(): Promise<TimelineInfo>;
  abstract getTracks(): Promise<TrackInfo[]>;
  abstract getTrack(trackId: string): Promise<TrackInfo | undefined>;
  abstract getElements(trackId?: string): Promise<ElementInfo[]>;
  abstract getElement(elementId: string): Promise<ElementInfo | undefined>;
  abstract addElement(trackId: string, element: ElementInput): Promise<string>;
  abstract updateElement(elementId: string, updates: Partial<ElementInput>): Promise<void>;
  abstract deleteElement(elementId: string): Promise<void>;
  abstract addTrack(type: TrackInfo['type'], name?: string): Promise<string>;
  abstract deleteTrack(trackId: string): Promise<void>;
  abstract setCurrentTime(time: number): Promise<void>;
  abstract getCurrentTime(): Promise<number>;

  // Media methods
  abstract getMediaList(): Promise<MediaInfo[]>;
  abstract getMedia(mediaId: string): Promise<MediaInfo | undefined>;
  abstract importMedia(path: string): Promise<string>;
  abstract deleteMedia(mediaId: string): Promise<void>;
  abstract getThumbnail(mediaId: string): Promise<string | undefined>;
  abstract searchMedia(query: string): Promise<MediaInfo[]>;

  // Selection methods
  abstract getSelection(): Promise<SelectionInfo>;
  abstract selectElements(elementIds: string[]): Promise<void>;
  abstract addToSelection(elementIds: string[]): Promise<void>;
  abstract removeFromSelection(elementIds: string[]): Promise<void>;
  abstract clearSelection(): Promise<void>;
  abstract selectTimeRange(start: number, end: number): Promise<void>;

  // Project methods
  abstract hasChanges(): Promise<boolean>;
  abstract save(): Promise<void>;
  abstract undo(): Promise<void>;
  abstract redo(): Promise<void>;
  abstract canUndo(): Promise<boolean>;
  abstract canRedo(): Promise<boolean>;

  /**
   * Subscribe to context events
   */
  subscribe(listener: ProjectContextListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  protected emit(event: ProjectContextEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Mock project context adapter for testing
 */
export class MockProjectContextAdapter extends BaseProjectContextAdapter {
  readonly projectId: string;
  readonly projectName: string;

  private timeline: TimelineInfo;
  private tracks: Map<string, TrackInfo> = new Map();
  private elements: Map<string, ElementInfo> = new Map();
  private media: Map<string, MediaInfo> = new Map();
  private selection: SelectionInfo = { elements: [], tracks: [] };
  private currentTime = 0;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private dirty = false;

  constructor(projectId = 'mock-project', projectName = 'Mock Project') {
    super();
    this.projectId = projectId;
    this.projectName = projectName;
    this.timeline = {
      duration: 0,
      fps: 30,
      width: 1920,
      height: 1080,
      trackCount: 0,
      currentTime: 0,
    };
  }

  // Timeline implementation
  async getTimelineInfo(): Promise<TimelineInfo> {
    return { ...this.timeline, trackCount: this.tracks.size, currentTime: this.currentTime };
  }

  async getTracks(): Promise<TrackInfo[]> {
    return Array.from(this.tracks.values()).sort((a, b) => a.index - b.index);
  }

  async getTrack(trackId: string): Promise<TrackInfo | undefined> {
    return this.tracks.get(trackId);
  }

  async getElements(trackId?: string): Promise<ElementInfo[]> {
    const elements = Array.from(this.elements.values());
    if (trackId) {
      return elements.filter((e) => e.trackId === trackId);
    }
    return elements;
  }

  async getElement(elementId: string): Promise<ElementInfo | undefined> {
    return this.elements.get(elementId);
  }

  async addElement(trackId: string, element: ElementInput): Promise<string> {
    const id = `element-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newElement: ElementInfo = {
      id,
      trackId,
      type: element.type,
      startTime: element.startTime,
      endTime: element.startTime + element.duration,
      duration: element.duration,
      mediaId: element.mediaId,
      properties: element.properties || {},
    };
    this.elements.set(id, newElement);
    this.updateTimelineDuration();
    this.markDirty();
    this.emit({ type: 'element:added', data: newElement });
    return id;
  }

  async updateElement(elementId: string, updates: Partial<ElementInput>): Promise<void> {
    const element = this.elements.get(elementId);
    if (!element) {
      throw new Error(`Element ${elementId} not found`);
    }

    if (updates.startTime !== undefined) {
      element.startTime = updates.startTime;
      element.endTime = updates.startTime + element.duration;
    }
    if (updates.duration !== undefined) {
      element.duration = updates.duration;
      element.endTime = element.startTime + updates.duration;
    }
    if (updates.properties !== undefined) {
      element.properties = { ...element.properties, ...updates.properties };
    }

    this.updateTimelineDuration();
    this.markDirty();
    this.emit({ type: 'element:updated', data: element });
  }

  async deleteElement(elementId: string): Promise<void> {
    const element = this.elements.get(elementId);
    if (!element) return;

    this.elements.delete(elementId);
    this.updateTimelineDuration();
    this.markDirty();
    this.emit({ type: 'element:removed', data: { id: elementId } });
  }

  async addTrack(type: TrackInfo['type'], name?: string): Promise<string> {
    const id = `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const index = this.tracks.size;
    const track: TrackInfo = {
      id,
      name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${index + 1}`,
      type,
      index,
      locked: false,
      visible: true,
    };
    this.tracks.set(id, track);
    this.markDirty();
    this.emit({ type: 'track:added', data: track });
    return id;
  }

  async deleteTrack(trackId: string): Promise<void> {
    if (!this.tracks.has(trackId)) return;

    // Delete all elements on this track
    for (const [id, element] of this.elements) {
      if (element.trackId === trackId) {
        this.elements.delete(id);
      }
    }

    this.tracks.delete(trackId);
    this.markDirty();
    this.emit({ type: 'track:removed', data: { id: trackId } });
  }

  async setCurrentTime(time: number): Promise<void> {
    this.currentTime = Math.max(0, time);
    this.emit({ type: 'playhead:moved', data: { time: this.currentTime } });
  }

  async getCurrentTime(): Promise<number> {
    return this.currentTime;
  }

  // Media implementation
  async getMediaList(): Promise<MediaInfo[]> {
    return Array.from(this.media.values());
  }

  async getMedia(mediaId: string): Promise<MediaInfo | undefined> {
    return this.media.get(mediaId);
  }

  async importMedia(path: string): Promise<string> {
    const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = path.split('/').pop() || 'Untitled';
    const ext = name.split('.').pop()?.toLowerCase();

    let type: MediaInfo['type'] = 'video';
    if (['mp3', 'wav', 'aac', 'flac'].includes(ext || '')) {
      type = 'audio';
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      type = 'image';
    }

    const media: MediaInfo = {
      id,
      name,
      type,
      path,
      duration: type !== 'image' ? 10 : undefined, // Mock duration
      width: type !== 'audio' ? 1920 : undefined,
      height: type !== 'audio' ? 1080 : undefined,
    };

    this.media.set(id, media);
    this.emit({ type: 'media:imported', data: media });
    return id;
  }

  async deleteMedia(mediaId: string): Promise<void> {
    if (!this.media.has(mediaId)) return;
    this.media.delete(mediaId);
    this.emit({ type: 'media:removed', data: { id: mediaId } });
  }

  async getThumbnail(mediaId: string): Promise<string | undefined> {
    const media = this.media.get(mediaId);
    return media?.thumbnailUrl;
  }

  async searchMedia(query: string): Promise<MediaInfo[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.media.values()).filter((m) =>
      m.name.toLowerCase().includes(lowerQuery)
    );
  }

  // Selection implementation
  async getSelection(): Promise<SelectionInfo> {
    return { ...this.selection };
  }

  async selectElements(elementIds: string[]): Promise<void> {
    this.selection.elements = [...elementIds];
    this.emit({ type: 'selection:changed', data: this.selection });
  }

  async addToSelection(elementIds: string[]): Promise<void> {
    const newElements = elementIds.filter((id) => !this.selection.elements.includes(id));
    this.selection.elements.push(...newElements);
    this.emit({ type: 'selection:changed', data: this.selection });
  }

  async removeFromSelection(elementIds: string[]): Promise<void> {
    this.selection.elements = this.selection.elements.filter((id) => !elementIds.includes(id));
    this.emit({ type: 'selection:changed', data: this.selection });
  }

  async clearSelection(): Promise<void> {
    this.selection = { elements: [], tracks: [] };
    this.emit({ type: 'selection:changed', data: this.selection });
  }

  async selectTimeRange(start: number, end: number): Promise<void> {
    this.selection.timeRange = { start, end };
    this.emit({ type: 'selection:changed', data: this.selection });
  }

  // Project implementation
  async hasChanges(): Promise<boolean> {
    return this.dirty;
  }

  async save(): Promise<void> {
    this.dirty = false;
  }

  async undo(): Promise<void> {
    if (this.undoStack.length > 0) {
      const state = this.undoStack.pop()!;
      this.redoStack.push(state);
      this.emit({ type: 'timeline:changed' });
    }
  }

  async redo(): Promise<void> {
    if (this.redoStack.length > 0) {
      const state = this.redoStack.pop()!;
      this.undoStack.push(state);
      this.emit({ type: 'timeline:changed' });
    }
  }

  async canUndo(): Promise<boolean> {
    return this.undoStack.length > 0;
  }

  async canRedo(): Promise<boolean> {
    return this.redoStack.length > 0;
  }

  // Helper methods
  private updateTimelineDuration(): void {
    let maxEnd = 0;
    for (const element of this.elements.values()) {
      if (element.endTime > maxEnd) {
        maxEnd = element.endTime;
      }
    }
    this.timeline.duration = maxEnd;
  }

  private markDirty(): void {
    this.dirty = true;
    this.undoStack.push(JSON.stringify({ elements: [...this.elements] }));
    this.redoStack = [];
  }
}

/**
 * Create context summary for LLM prompts
 */
export async function createContextSummary(context: ProjectContext): Promise<string> {
  const [timeline, tracks, elements, media, selection] = await Promise.all([
    context.getTimelineInfo(),
    context.getTracks(),
    context.getElements(),
    context.getMediaList(),
    context.getSelection(),
  ]);

  const lines: string[] = [
    `## Project: ${context.projectName}`,
    '',
    `### Timeline`,
    `- Duration: ${timeline.duration.toFixed(2)}s`,
    `- Resolution: ${timeline.width}x${timeline.height}`,
    `- FPS: ${timeline.fps}`,
    `- Current Time: ${timeline.currentTime.toFixed(2)}s`,
    '',
    `### Tracks (${tracks.length})`,
  ];

  for (const track of tracks) {
    const trackElements = elements.filter((e) => e.trackId === track.id);
    lines.push(`- ${track.name} (${track.type}): ${trackElements.length} elements`);
  }

  lines.push('', `### Media Library (${media.length} assets)`);
  for (const m of media.slice(0, 5)) {
    lines.push(`- ${m.name} (${m.type})`);
  }
  if (media.length > 5) {
    lines.push(`- ... and ${media.length - 5} more`);
  }

  if (selection.elements.length > 0) {
    lines.push('', `### Selection`);
    lines.push(`- ${selection.elements.length} elements selected`);
  }

  return lines.join('\n');
}
