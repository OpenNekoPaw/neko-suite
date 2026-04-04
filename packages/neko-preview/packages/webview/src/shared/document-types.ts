/**
 * Document preview message types (shared across all document webviews).
 * Mirrors the Extension-side types in types/document-messages.ts.
 */

// Extension → Webview
export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    data?: string;
    url?: string;
    fileName: string;
    fileSize: number;
  };
}

export interface EpubNavigateMessage {
  type: 'epub:navigate';
  payload: { href: string };
}

export type DocumentExtensionMessage = DocumentDataMessage | EpubNavigateMessage;

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
