/**
 * Document preview message types shared by document webviews.
 * Mirrors the extension-side protocol in extension/src/types/document-messages.ts.
 */

// =============================================================================
// Extension → Webview
// =============================================================================

export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    data?: string;
    url?: string;
    fileName?: string;
    fileSize?: number;
  };
}

export interface DocumentRestoreStateMessage {
  type: 'document:restoreState';
  payload: Record<string, unknown>;
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export type DocumentExtensionMessage =
  | DocumentDataMessage
  | DocumentRestoreStateMessage
  | EpubNavigateMessage;

// =============================================================================
// Webview → Extension
// =============================================================================

export interface DocumentReadyMessage {
  type: 'ready';
}

export interface DocumentSaveStateMessage {
  type: 'document:saveState';
  payload: Record<string, unknown>;
}

export interface DocumentStatusPayload {
  pageCount?: number;
  currentPage?: number;
  chapterHref?: string;
  chapterTitle?: string;
  fileSize?: number;
  zoom?: number;
}

export interface DocumentStatusUpdateMessage {
  type: 'document:statusUpdate';
  payload: DocumentStatusPayload;
}

export interface DocumentRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentSendToAiMessage {
  type: 'document:sendToAi';
  payload: {
    text?: string;
    imageData?: string;
    contentKind: 'text' | 'image' | 'mixed';
    context?: {
      page?: number;
      chapter?: string;
      region?: DocumentRegion;
    };
  };
}

export type DocumentWebviewMessage =
  | DocumentReadyMessage
  | DocumentSaveStateMessage
  | DocumentStatusUpdateMessage
  | DocumentSendToAiMessage;
