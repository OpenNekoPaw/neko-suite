/**
 * Document preview message types (shared across all document webviews).
 * Mirrors the Extension-side types in types/document-messages.ts.
 *
 * New protocol (postMessage-only, no direct HTTP from webview):
 *   Extension → Webview:
 *     document:metadata  — probe result + token
 *     document:rangeData — byte range response (base64)
 *     document:entryData — ZIP entry response (base64)
 *   Webview → Extension:
 *     document:readRange — request byte range
 *     document:readEntry — request ZIP entry
 */

// ── Extension → Webview ─────────────────────────────────────────────────────

/** Legacy: sends data or url. Kept for backward compatibility. */
export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    data?: string;
    url?: string;
    fileName: string;
    fileSize: number;
  };
}

/** New: sends probe metadata after engine connection. */
export interface DocumentMetadataMessage {
  type: 'document:metadata';
  payload: {
    format: string;
    fileSize: number;
    mimeType: string;
    entryCount?: number;
    title?: string;
    author?: string;
    token: string;
    fileName: string;
  };
}

/** Response to document:readRange */
export interface DocumentRangeDataMessage {
  type: 'document:rangeData';
  payload: {
    start: number;
    end: number;
    data: string; // base64
  };
}

/** Response to document:readEntry */
export interface DocumentEntryDataMessage {
  type: 'document:entryData';
  payload: {
    entryPath: string;
    data: string; // base64
    contentType: string;
  };
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export type DocumentExtensionMessage =
  | DocumentDataMessage
  | DocumentMetadataMessage
  | DocumentRangeDataMessage
  | DocumentEntryDataMessage
  | EpubNavigateMessage;

// Webview → Extension
export interface CapturedImagePayload {
  role: 'page' | 'figure' | 'region';
  dataUrl: string;
}

export interface DocumentSendToAiPayload {
  selectedText?: string;
  pageNumber?: number;
  chapterTitle?: string;
  imageDataUrl?: string;
  images?: CapturedImagePayload[];
  contentKind?: 'text' | 'image' | 'mixed';
}

export function postDocumentSendToAi(payload: DocumentSendToAiPayload): void {
  // postMessage is typed loosely in webview context; cast required.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).vscodeApi?.postMessage({ type: 'document:sendToAi', payload });
}
