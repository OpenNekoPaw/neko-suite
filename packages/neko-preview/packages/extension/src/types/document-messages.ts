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

/** A single captured image attached to a sendToAi payload. */
export interface CapturedImagePayload {
  /** Semantic role of the image in the document */
  role: 'page' | 'figure' | 'region';
  /** Base64 JPEG data URL, compressed to ≤280 KB */
  dataUrl: string;
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
    /** Single image — legacy field for CBZ region selection */
    imageDataUrl?: string;
    /** Multiple images — EPUB page/figure capture, CBZ multi-page */
    images?: CapturedImagePayload[];
    /**
     * Characterises the content being sent so the agent helper can
     * choose the right intent prompt.
     */
    contentKind?: 'text' | 'image' | 'mixed';
  };
}

export type DocumentWebviewMessage = DocumentReadyMessage | DocumentSendToAiMessage;
