/**
 * Document preview message types (shared across all document webviews).
 * Mirrors the Extension-side types in types/document-messages.ts.
 */

// Extension → Webview
export interface DocumentDataMessage {
  type: 'document:data';
  payload: {
    data: string;
    fileName: string;
    fileSize: number;
  };
}

// Generic type for all extension messages to document webviews
export type DocumentExtensionMessage = DocumentDataMessage;
