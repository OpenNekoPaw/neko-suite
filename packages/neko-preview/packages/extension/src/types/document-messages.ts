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
    /** Base64-encoded file content */
    data: string;
    /** File name for display */
    fileName: string;
    /** File size in bytes */
    fileSize: number;
  };
}

export type DocumentExtensionMessage = DocumentDataMessage;

// =============================================================================
// Webview → Extension Messages
// =============================================================================

export interface DocumentReadyMessage {
  type: 'ready';
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
    /** Base64 image data URL for region selection (CBZ) */
    imageDataUrl?: string;
  };
}

export type DocumentWebviewMessage = DocumentReadyMessage | DocumentSendToAiMessage;
