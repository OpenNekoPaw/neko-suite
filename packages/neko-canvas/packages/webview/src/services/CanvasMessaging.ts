/**
 * CanvasMessaging - Cross-editor communication service
 * Handles messaging between canvas webview and extension host,
 * and facilitates communication with other editors (video editor)
 */

import { getLogger } from '../utils/logger';

const logger = getLogger('CanvasMessaging');

// =============================================================================
// Types
// =============================================================================

export type MessageType =
  // Canvas -> Extension
  | 'ready'
  | 'save'
  | 'requestAssetThumbnail'
  | 'openAsset'
  | 'linkToTimeline'
  // Extension -> Canvas
  | 'update'
  | 'assetThumbnail'
  | 'timelineSelection'
  | 'projectLinked';

export interface CanvasMessage<T = unknown> {
  type: MessageType;
  data?: T;
  requestId?: string;
}

export interface AssetThumbnailRequest {
  assetPath: string;
  nodeId: string;
}

export interface AssetThumbnailResponse {
  nodeId: string;
  thumbnailPath: string;
}

export interface LinkToTimelineRequest {
  nodeId: string;
  assetPath: string;
  startTime?: number;
  duration?: number;
}

export interface TimelineSelectionUpdate {
  selectedAssetPaths: string[];
}

export interface ProjectLinkedUpdate {
  projectPath: string;
  projectName: string;
}

// =============================================================================
// VSCode API
// =============================================================================

interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

declare const acquireVsCodeApi: () => VSCodeAPI;

// =============================================================================
// Service
// =============================================================================

export class CanvasMessaging {
  private vscode: VSCodeAPI | null = null;
  private messageHandlers: Map<MessageType, Set<(data: unknown) => void>> = new Map();
  private pendingRequests: Map<string, (data: unknown) => void> = new Map();
  private requestIdCounter = 0;

  constructor() {
    this.initVSCode();
    this.setupMessageListener();
  }

  private initVSCode(): void {
    if (typeof acquireVsCodeApi !== 'undefined') {
      this.vscode = acquireVsCodeApi();
    }
  }

  private setupMessageListener(): void {
    window.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as CanvasMessage;

      // Handle pending request responses
      if (message.requestId && this.pendingRequests.has(message.requestId)) {
        const resolver = this.pendingRequests.get(message.requestId);
        this.pendingRequests.delete(message.requestId);
        resolver?.(message.data);
        return;
      }

      // Handle registered message handlers
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => handler(message.data));
      }
    });
  }

  /**
   * Send a message to the extension host
   */
  send<T>(type: MessageType, data?: T): void {
    if (!this.vscode) {
      logger.warn('VSCode API not available');
      return;
    }

    this.vscode.postMessage({ type, data });
  }

  /**
   * Send a request and wait for response
   */
  request<TRequest, TResponse>(type: MessageType, data: TRequest): Promise<TResponse> {
    return new Promise((resolve) => {
      const requestId = `req-${++this.requestIdCounter}`;
      this.pendingRequests.set(requestId, resolve as (data: unknown) => void);

      if (this.vscode) {
        this.vscode.postMessage({ type, data, requestId });
      } else {
        // Timeout for non-VSCode environment
        setTimeout(() => {
          this.pendingRequests.delete(requestId);
          resolve(undefined as TResponse);
        }, 1000);
      }
    });
  }

  /**
   * Register a message handler
   */
  on<T>(type: MessageType, handler: (data: T) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }

    const handlers = this.messageHandlers.get(type)!;
    handlers.add(handler as (data: unknown) => void);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler as (data: unknown) => void);
    };
  }

  /**
   * Signal that the canvas is ready
   */
  signalReady(): void {
    this.send('ready');
  }

  /**
   * Save canvas data
   */
  saveCanvas<T>(data: T): void {
    this.send('save', data);
  }

  /**
   * Request thumbnail for an asset
   */
  async requestAssetThumbnail(assetPath: string, nodeId: string): Promise<string | undefined> {
    const response = await this.request<AssetThumbnailRequest, AssetThumbnailResponse>(
      'requestAssetThumbnail',
      { assetPath, nodeId }
    );
    return response?.thumbnailPath;
  }

  /**
   * Open an asset in the appropriate editor
   */
  openAsset(assetPath: string): void {
    this.send('openAsset', { assetPath });
  }

  /**
   * Link a canvas node to the timeline
   */
  linkToTimeline(request: LinkToTimelineRequest): void {
    this.send('linkToTimeline', request);
  }

  /**
   * Get persisted state
   */
  getState<T>(): T | undefined {
    return this.vscode?.getState() as T | undefined;
  }

  /**
   * Set persisted state
   */
  setState<T>(state: T): void {
    this.vscode?.setState(state);
  }

  /**
   * Check if running in VSCode context
   */
  isVSCodeContext(): boolean {
    return this.vscode !== null;
  }
}

// Singleton instance
let messagingInstance: CanvasMessaging | null = null;

export function getCanvasMessaging(): CanvasMessaging {
  if (!messagingInstance) {
    messagingInstance = new CanvasMessaging();
  }
  return messagingInstance;
}
