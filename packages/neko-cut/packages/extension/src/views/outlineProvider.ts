import * as vscode from 'vscode';
import { createServiceId } from '../base';
import type { ProjectData, TimelineTrack, TimelineElement } from '@uniedit/shared';

// =============================================================================
// 服务标识符
// =============================================================================

export const IVideoProjectOutlineProvider = createServiceId<IVideoProjectOutlineProvider>('videoProjectOutlineProvider');

// =============================================================================
// 接口定义
// =============================================================================

export interface IVideoProjectOutlineProvider extends vscode.TreeDataProvider<OutlineItem> {
  updateProject(data: ProjectData | null): void;
  hasData(): boolean;
  refresh(): void;
}

// =============================================================================
// Tree Item
// =============================================================================

/**
 * Tree item representing a project, track, or element in the outline
 */
class OutlineItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: 'project' | 'track' | 'element',
    public readonly data?: ProjectData | TimelineTrack | TimelineElement,
    public readonly trackId?: string
  ) {
    super(label, collapsibleState);
  }
}

// =============================================================================
// 实现
// =============================================================================

/**
 * Provides a tree view for the video project outline
 * Works with custom editors by receiving updates via messages
 */
export class VideoProjectOutlineProvider implements IVideoProjectOutlineProvider {
  private _onDidChangeTreeData = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projectData: ProjectData | null = null;

  /**
   * Update the outline with new project data
   */
  updateProject(data: ProjectData | null): void {
    this.projectData = data;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Check if the provider has data to display
   */
  hasData(): boolean {
    return this.projectData !== null;
  }

  /**
   * Refresh the outline view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: OutlineItem): vscode.TreeItem {
    return element;
  }

  getParent(element: OutlineItem): OutlineItem | null {
    if (!this.projectData) return null;

    // Element's parent is its track
    if (element.itemType === 'element' && element.trackId) {
      const track = this.projectData.tracks.find(t => t.id === element.trackId);
      if (track) {
        return new OutlineItem(
          this.translateTrackName(track.name),
          track.elements.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          'track',
          track,
          track.id
        );
      }
    }

    // Track's parent is the project
    if (element.itemType === 'track') {
      return new OutlineItem(
        this.projectData.name || vscode.l10n.t('Project'),
        vscode.TreeItemCollapsibleState.Expanded,
        'project',
        this.projectData
      );
    }

    // Project has no parent
    return null;
  }

  /**
   * Translate default track names to localized versions
   * This helps display built-in track names in the user's language
   */
  private translateTrackName(trackName: string): string {
    const defaultTrackNames: Record<string, string> = {
      'Main Track': vscode.l10n.t('Main Track'),
      'Media Track': vscode.l10n.t('Media Track'),
      'Audio Track': vscode.l10n.t('Audio Track'),
      'Text Track': vscode.l10n.t('Text Track'),
      'Subtitle Track': vscode.l10n.t('Subtitle Track'),
      'Shape Track': vscode.l10n.t('Shape Track'),
    };

    // If it matches a default name, return the translated version
    if (defaultTrackNames[trackName]) {
      return defaultTrackNames[trackName];
    }

    // Otherwise, return the original name (user-customized)
    return trackName;
  }

  getChildren(element?: OutlineItem): Thenable<OutlineItem[]> {
    if (!this.projectData) {
      return Promise.resolve([]);
    }

    if (!element) {
      // Root level: show project
      const projectItem = new OutlineItem(
        this.projectData.name || vscode.l10n.t('Project'),
        vscode.TreeItemCollapsibleState.Expanded,
        'project',
        this.projectData
      );
      projectItem.description = `${this.projectData.resolution.width}x${this.projectData.resolution.height} @ ${this.projectData.fps}fps`;
      projectItem.iconPath = new vscode.ThemeIcon('file-media');
      projectItem.contextValue = 'project';
      return Promise.resolve([projectItem]);
    }

    if (element.itemType === 'project') {
      // Project level: show tracks
      const project = element.data as ProjectData;
      const trackItems = project.tracks.map(track => {
        const item = new OutlineItem(
          this.translateTrackName(track.name),
          track.elements.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          'track',
          track,
          track.id
        );

        const elementCount = track.elements.length;
        const mutedIndicator = track.muted ? ` ${vscode.l10n.t('(muted)')}` : '';
        const elementText = elementCount === 1
          ? vscode.l10n.t('{count} element', { count: elementCount })
          : vscode.l10n.t('{count} elements', { count: elementCount });
        item.description = `${elementText}${mutedIndicator}`;
        item.iconPath = this.getTrackIcon(track.type);
        item.contextValue = `track-${track.type}`;

        return item;
      });

      return Promise.resolve(trackItems);
    }

    if (element.itemType === 'track') {
      // Track level: show elements
      const track = element.data as TimelineTrack;
      const elementItems = track.elements.map(el => {
        const effectiveDuration = el.duration - el.trimStart - el.trimEnd;
        const startTime = this.formatTime(el.startTime);
        const endTime = this.formatTime(el.startTime + effectiveDuration);

        const item = new OutlineItem(
          el.name,
          vscode.TreeItemCollapsibleState.None,
          'element',
          el,
          track.id
        );

        // Build description
        let description = `${startTime} → ${endTime}`;
        if (el.hidden) {
          description += ` ${vscode.l10n.t('(hidden)')}`;
        }
        if (el.type === 'text') {
          const preview = el.content.length > 15
            ? el.content.substring(0, 15) + '...'
            : el.content;
          description = `"${preview}" | ${description}`;
        } else if (el.type === 'media') {
          const fileName = el.src.split('/').pop() || el.src;
          description = `${fileName} | ${description}`;
        }

        item.description = description;
        item.iconPath = this.getElementIcon(el.type);
        item.contextValue = `element-${el.type}`;

        // Add command to select element when clicked
        item.command = {
          command: 'uniedit.selectElement',
          title: vscode.l10n.t('Select Element'),
          arguments: [track.id, el.id]
        };

        return item;
      });

      return Promise.resolve(elementItems);
    }

    return Promise.resolve([]);
  }

  private getTrackIcon(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'media': return new vscode.ThemeIcon('device-camera-video');
      case 'audio': return new vscode.ThemeIcon('unmute');
      case 'text': return new vscode.ThemeIcon('symbol-string');
      default: return new vscode.ThemeIcon('folder');
    }
  }

  private getElementIcon(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'media': return new vscode.ThemeIcon('file-media');
      case 'audio': return new vscode.ThemeIcon('music');
      case 'text': return new vscode.ThemeIcon('text-size');
      default: return new vscode.ThemeIcon('file');
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
}
