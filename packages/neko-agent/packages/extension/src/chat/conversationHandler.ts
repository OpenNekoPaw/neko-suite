/**
 * Conversation Handler
 * Thin WebView communication layer for conversation management
 */

import * as vscode from 'vscode';
import {
  ConversationManager,
  type ConversationMessage,
  type ConversationStorage,
  type ContentBlock,
} from './conversationManager';

/**
 * Check if a string looks like a local file path
 * Note: We don't check if file exists - let the webview handle loading errors
 */
function isLocalFilePath(str: string): boolean {
  if (typeof str !== 'string') return false;
  // Check for absolute paths (Unix or Windows)
  if (str.startsWith('/') || /^[A-Za-z]:[\\/]/.test(str)) {
    // Check if it looks like a media file path
    const mediaExtensions = [
      // Images
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg',
      // Videos
      '.mp4', '.webm', '.mov', '.avi', '.mkv',
      // Audio
      '.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a',
    ];
    const lowerStr = str.toLowerCase();
    return mediaExtensions.some(ext => lowerStr.endsWith(ext));
  }
  return false;
}

/**
 * Convert local file path to webview URI
 */
function toWebviewUri(webview: vscode.Webview, filePath: string): string {
  try {
    return webview.asWebviewUri(vscode.Uri.file(filePath)).toString();
  } catch {
    console.warn('[UniEdit] Failed to convert path to webview URI:', filePath);
    return filePath;
  }
}

/**
 * Recursively convert local file paths in an object to webview URIs
 */
function convertLocalPathsInObject(
  webview: vscode.Webview,
  obj: unknown,
  visited = new WeakSet<object>()
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle strings - check if it's a local file path
  if (typeof obj === 'string') {
    if (isLocalFilePath(obj)) {
      return toWebviewUri(webview, obj);
    }
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertLocalPathsInObject(webview, item, visited));
  }

  // Handle objects
  if (typeof obj === 'object') {
    // Prevent circular reference issues
    if (visited.has(obj)) {
      return obj;
    }
    visited.add(obj);

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip localPath - keep it as original local path for file opening
      if (key === 'localPath' || key === 'localPaths') {
        result[key] = value;
        continue;
      }

      // Special handling for single URL keys - convert to webview URI
      const singleUrlKeys = ['url', 'thumbnailUrl', 'imageUrl', 'videoUrl', 'audioUrl'];
      if (
        singleUrlKeys.includes(key) &&
        typeof value === 'string' &&
        isLocalFilePath(value)
      ) {
        result[key] = toWebviewUri(webview, value);
        // Also store original path for file opening (if not already set)
        if (!result['localPath']) {
          result['localPath'] = value;
        }
        continue;
      }

      // Special handling for urls array - convert each and preserve localPaths
      if (key === 'urls' && Array.isArray(value)) {
        const localPaths: string[] = [];
        const convertedUrls = value.map(url => {
          if (typeof url === 'string' && isLocalFilePath(url)) {
            localPaths.push(url);
            return toWebviewUri(webview, url);
          }
          return url;
        });
        result[key] = convertedUrls;
        // Store original paths for file opening (if not already set)
        if (localPaths.length > 0 && !result['localPaths']) {
          result['localPaths'] = localPaths;
        }
        continue;
      }

      // Default: recursively convert
      result[key] = convertLocalPathsInObject(webview, value, visited);
    }
    return result;
  }

  // Return primitives as-is
  return obj;
}

/**
 * Convert all local file paths in messages to webview URIs
 * Handles both legacy toolCalls array and new contentBlocks structure
 */
function convertMessagesForWebview(
  webview: vscode.Webview,
  messages: ConversationMessage[]
): ConversationMessage[] {
  return messages.map(message => {
    let convertedMessage = { ...message };

    // Convert URLs in legacy toolCalls array
    if (message.toolCalls && message.toolCalls.length > 0) {
      convertedMessage.toolCalls = message.toolCalls.map(toolCall => {
        if (!toolCall.result?.data) {
          return toolCall;
        }

        return {
          ...toolCall,
          result: {
            ...toolCall.result,
            data: convertLocalPathsInObject(webview, toolCall.result.data),
          },
        };
      });
    }

    // Convert URLs in contentBlocks (for tool_call blocks)
    if (message.contentBlocks && message.contentBlocks.length > 0) {
      convertedMessage.contentBlocks = message.contentBlocks.map(block => {
        if (block.type !== 'tool_call' || !block.toolCall?.result?.data) {
          return block;
        }

        return {
          ...block,
          toolCall: {
            ...block.toolCall,
            result: {
              ...block.toolCall.result,
              data: convertLocalPathsInObject(webview, block.toolCall.result.data),
            },
          },
        };
      });
    }

    return convertedMessage;
  });
}

/**
 * VSCode Memento storage adapter for ConversationManager
 */
class VscodeConversationStorage implements ConversationStorage {
  constructor(private readonly state: vscode.Memento) {}

  get<T>(key: string): T | undefined {
    return this.state.get(key);
  }

  update(key: string, value: unknown): void {
    this.state.update(key, value);
  }
}

export class ConversationHandler {
  private _conversationManager: ConversationManager;

  constructor(context: vscode.ExtensionContext) {
    const storage = new VscodeConversationStorage(context.workspaceState);
    this._conversationManager = new ConversationManager(storage);

    // Clean up empty conversations from previous sessions
    const cleaned = this._conversationManager.cleanupEmpty();
    if (cleaned > 0) {
      console.log(`[UniEdit] Cleaned up ${cleaned} empty conversation(s)`);
    }
  }

  /**
   * Get underlying conversation manager
   */
  get manager(): ConversationManager {
    return this._conversationManager;
  }

  /**
   * Create new conversation
   */
  create(): string {
    return this._conversationManager.create();
  }

  /**
   * Get active conversation
   */
  getActive() {
    return this._conversationManager.getActive();
  }

  /**
   * Get active conversation ID
   */
  getActiveId(): string | null {
    return this._conversationManager.getActiveId();
  }

  /**
   * Get conversation by ID
   */
  get(conversationId: string) {
    return this._conversationManager.get(conversationId);
  }

  /**
   * Switch to a different conversation
   */
  switchTo(conversationId: string): boolean {
    return this._conversationManager.setActive(conversationId);
  }

  /**
   * Delete a conversation
   */
  delete(conversationId: string): void {
    this._conversationManager.delete(conversationId);
  }

  /**
   * Clear current conversation messages
   */
  clearCurrent(): void {
    const conversationId = this._conversationManager.getActiveId();
    if (conversationId) {
      this._conversationManager.updateMessages(conversationId, []);
    }
  }

  /**
   * List all conversations
   */
  list() {
    return this._conversationManager.list();
  }

  /**
   * Add message to active conversation
   */
  addMessage(message: ConversationMessage): void {
    const conversationId = this._conversationManager.getActiveId();
    if (!conversationId) return;
    this.addMessageToConversation(conversationId, message);
  }

  /**
   * Add message to a specific conversation (for background execution)
   */
  addMessageToConversation(conversationId: string, message: ConversationMessage): void {
    const conversation = this._conversationManager.get(conversationId);
    if (!conversation) return;

    this._conversationManager.updateMessages(conversationId, [
      ...conversation.messages,
      message,
    ]);
  }

  /**
   * Ensure there's an active conversation (create if needed)
   */
  ensureActive(): string {
    let conversation = this._conversationManager.getActive();
    if (!conversation) {
      return this._conversationManager.create();
    }
    return conversation.id;
  }

  /**
   * Send conversation list to webview
   */
  sendConversationList(webview: vscode.Webview): void {
    const conversations = this._conversationManager.list();
    webview.postMessage({
      type: 'conversationList',
      conversations: conversations.map(c => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      })),
    });
  }

  /**
   * Send active conversation to webview
   */
  sendActiveConversation(webview: vscode.Webview): void {
    const active = this._conversationManager.getActive();
    if (active) {
      // Convert local file paths in messages to webview URIs
      const convertedMessages = convertMessagesForWebview(webview, active.messages);

      webview.postMessage({
        type: 'activeConversation',
        conversation: {
          id: active.id,
          title: active.title,
          messages: convertedMessages,
        },
      });
    } else {
      webview.postMessage({
        type: 'activeConversation',
        conversation: null,
      });
    }
  }
}
