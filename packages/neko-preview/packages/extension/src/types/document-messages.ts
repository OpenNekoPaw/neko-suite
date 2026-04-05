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
    /** File name for display */
    fileName: string;
    /** File size in bytes */
    fileSize: number;
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
    /** Selected text content (PDF/EPUB/DOCX) */
    selectedText?: string;
    /** Page number where selection occurred */
    pageNumber?: number;
    /** Chapter title (EPUB) */
    chapterTitle?: string;
    /** CBZ region selection (coordinates on the page image) */
    region?: DocumentRegion;
    /**
     * Characterises the content being sent so the agent helper can
     * choose the right intent prompt.
     */
    contentKind?: 'text' | 'image' | 'mixed';
  };
}

export type DocumentWebviewMessage = DocumentReadyMessage | DocumentSendToAiMessage;
