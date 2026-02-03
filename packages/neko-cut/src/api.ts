/**
 * NekoCut API - Exported interface for other extensions
 */
import * as vscode from 'vscode';

// Types
export interface TimelineInfo {
  id: string;
  name: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  trackCount: number;
  elementCount: number;
}

export interface ElementConfig {
  type: 'video' | 'audio' | 'image' | 'text' | 'shape';
  trackId: string;
  startTime: number;
  duration: number;
  source?: string;
  properties?: Record<string, unknown>;
}

export interface TimelineChangeEvent {
  type: 'add' | 'update' | 'delete';
  elementId?: string;
  trackId?: string;
}

export interface ElementSelectedEvent {
  elementId: string | null;
  element: ElementConfig | null;
}

export interface PlaybackChangeEvent {
  playing: boolean;
  currentTime: number;
}

/**
 * NekoCut API interface exported to other extensions
 */
export interface NekoCutAPI {
  /**
   * Timeline operations
   */
  timeline: {
    /**
     * Get current timeline information
     */
    getInfo(): Promise<TimelineInfo | null>;

    /**
     * Add element to timeline
     * @returns Element ID
     */
    addElement(config: ElementConfig): Promise<string>;

    /**
     * Update element properties
     */
    updateElement(id: string, updates: Partial<ElementConfig>): Promise<void>;

    /**
     * Delete element from timeline
     */
    deleteElement(id: string): Promise<void>;

    /**
     * List all elements
     */
    listElements(): Promise<ElementConfig[]>;
  };

  /**
   * Event subscriptions
   */
  events: {
    /**
     * Fired when timeline changes
     */
    onDidChangeTimeline: vscode.Event<TimelineChangeEvent>;

    /**
     * Fired when element selection changes
     */
    onDidSelectElement: vscode.Event<ElementSelectedEvent>;

    /**
     * Fired when playback state changes
     */
    onDidChangePlayback: vscode.Event<PlaybackChangeEvent>;
  };

  /**
   * Check if NekoCutPro features are available
   */
  hasProFeatures(): boolean;

  /**
   * Prompt user to install NekoCutPro if not installed
   */
  promptProInstall(feature: string): Promise<boolean>;
}
