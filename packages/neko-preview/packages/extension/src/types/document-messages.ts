/**
 * Document Preview message protocol types
 *
 * Defines the postMessage contract between Extension and Webview
 * for document preview providers (PDF, CBZ, EPUB, DOCX).
 */

// =============================================================================
// Extension → Webview Messages
// =============================================================================

export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    /** Base64-encoded file content (legacy / non-EPUB) */
    data?: string;
    /** Direct webview URI — preferred for large files (EPUB).
     *  When present, the webview should load via URL instead of decoding base64. */
    url?: string;
    /** File name for display (optional — not sent by all providers) */
    fileName?: string;
    /** File size in bytes (optional — not sent by all providers) */
    fileSize?: number;
  };
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export type DocumentExtensionMessage = DocumentDataMessage | EpubNavigateMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface DocumentReadyMessage {
  type: 'ready';
}

/** Region selection for CBZ image-based documents */
export interface DocumentRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentSendToAiMessage {
  type: 'document:sendToAi';
  payload: {
    /** Selected text content (inline) */
    text?: string;
    /** Image base64 data (inline) */
    imageData?: string;
    /** Content type — drives agent intent prompt */
    contentKind: 'text' | 'image' | 'mixed';
    /** Location context within the document */
    context?: {
      page?: number;
      chapter?: string;
      region?: DocumentRegion;
    };
  };
}

export type DocumentWebviewMessage = DocumentReadyMessage | DocumentSendToAiMessage;
