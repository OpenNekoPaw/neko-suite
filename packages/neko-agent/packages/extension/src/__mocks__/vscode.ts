/**
 * Mock vscode module for unit testing handlers.
 *
 * Provides minimal stubs for vscode APIs used by chat handlers.
 * Only the APIs actually called in handler code are mocked.
 */

import { vi } from 'vitest';

// Uri mock
export const Uri = {
  file: (path: string) => ({
    scheme: 'file',
    fsPath: path,
    path,
    toString: () => `file://${path}`,
  }),
  parse: (value: string) => ({ scheme: 'https', path: value, toString: () => value }),
  joinPath: (base: any, ...segments: string[]) => {
    const joined = [base.fsPath || base.path, ...segments].join('/');
    return { scheme: 'file', fsPath: joined, path: joined, toString: () => `file://${joined}` };
  },
};

// commands mock
export const commands = {
  registerCommand: vi.fn((_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: vi.fn(),
  })),
  executeCommand: vi.fn().mockResolvedValue(undefined),
};

// extensions mock
export const extensions = {
  getExtension: vi.fn(),
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
  showSaveDialog: vi.fn().mockResolvedValue(undefined),
};

// workspace mock
export const workspace = {
  getConfiguration: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  })),
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'mock', index: 0 }],
  fs: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(new Uint8Array()),
    stat: vi.fn().mockResolvedValue({ type: 1 }),
  },
  findFiles: vi.fn().mockResolvedValue([]),
  asRelativePath: vi.fn((uri: { fsPath: string } | string) =>
    typeof uri === 'string' ? uri : uri.fsPath,
  ),
};

// FileType enum
export const FileType = { File: 1, Directory: 2, SymbolicLink: 64, Unknown: 0 };

// RelativePattern mock
export const RelativePattern = vi.fn();

// LogLevel enum
export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

// Disposable mock
export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose() {
    this.callOnDispose();
  }
}

// EventEmitter mock
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return new Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  };
  fire(data: T) {
    for (const listener of this.listeners) listener(data);
  }
  dispose() {
    this.listeners = [];
  }
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
