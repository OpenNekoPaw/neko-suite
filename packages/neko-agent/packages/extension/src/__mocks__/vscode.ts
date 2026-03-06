/**
 * Mock vscode module for unit testing handlers.
 *
 * Provides minimal stubs for vscode APIs used by chat handlers.
 * Only the APIs actually called in handler code are mocked.
 */

import { vi } from 'vitest';

// Uri mock
export const Uri = {
  file: (path: string) => ({ scheme: 'file', fsPath: path, path, toString: () => `file://${path}` }),
  parse: (value: string) => ({ scheme: 'https', path: value, toString: () => value }),
};

// commands mock
export const commands = {
  executeCommand: vi.fn().mockResolvedValue(undefined),
};

// env mock
export const env = {
  openExternal: vi.fn().mockResolvedValue(true),
};

// window mock
export const window = {
  showInputBox: vi.fn().mockResolvedValue(undefined),
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showQuickPick: vi.fn().mockResolvedValue(undefined),
};

// workspace mock
export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  }),
  workspaceFolders: [],
};

// Disposable mock
export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose() { this.callOnDispose(); }
}

// EventEmitter mock
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return new Disposable(() => {
      this.listeners = this.listeners.filter(l => l !== listener);
    });
  };
  fire(data: T) {
    for (const listener of this.listeners) listener(data);
  }
  dispose() { this.listeners = []; }
}

/**
 * Create a mock vscode.Webview for testing handlers
 */
export function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    html: '',
    options: {},
    cspSource: 'mock-csp',
    asWebviewUri: vi.fn((uri: any) => uri),
    onDidReceiveMessage: vi.fn(),
  };
}
