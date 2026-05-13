import { vi } from 'vitest';

type CommandHandler = (...args: unknown[]) => unknown;

const commandHandlers = new Map<string, CommandHandler>();
const createWebviewPanel = vi.fn();
const vscodeWorkspaceFs = {
  stat: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  createDirectory: vi.fn(),
};

export const vscodeCommandState = {
  commandHandlers,
  reset() {
    commandHandlers.clear();
  },
};

export const vscodeWindowState = {
  createWebviewPanel,
  reset() {
    createWebviewPanel.mockReset();
  },
};

export const vscodeWorkspaceState = {
  fs: vscodeWorkspaceFs,
  reset() {
    vscodeWorkspaceFs.stat.mockReset();
    vscodeWorkspaceFs.readFile.mockReset();
    vscodeWorkspaceFs.writeFile.mockReset();
    vscodeWorkspaceFs.createDirectory.mockReset();
  },
};

export function registerCommandHandler(command: string, handler: CommandHandler): void {
  commandHandlers.set(command, handler);
}

const vscode = {
  commands: {
    getCommands: vi.fn(async () => [...commandHandlers.keys()]),
    executeCommand: vi.fn(async (command: string, ...args: unknown[]) => {
      const handler = commandHandlers.get(command);
      if (!handler) {
        throw new Error(`Command not found: ${command}`);
      }
      return handler(...args);
    }),
    registerCommand: vi.fn((command: string, handler: CommandHandler) => {
      commandHandlers.set(command, handler);
      return {
        dispose() {
          commandHandlers.delete(command);
        },
      };
    }),
  },
  EventEmitter: class EventEmitter<TEvent> {
    private listeners = new Set<(event: TEvent) => void>();

    readonly event = (listener: (event: TEvent) => void) => {
      this.listeners.add(listener);
      return {
        dispose: () => this.listeners.delete(listener),
      };
    };

    fire(event: TEvent) {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    dispose() {
      this.listeners.clear();
    }
  },
  workspace: {
    findFiles: vi.fn(),
    getWorkspaceFolder: vi.fn(),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    fs: vscodeWorkspaceFs,
    workspaceFolders: undefined,
  },
  Uri: {
    joinPath: vi.fn((base: { fsPath?: string; path?: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath ?? base.path ?? '', ...segments].join('/'),
    })),
  },
  ViewColumn: { One: 1 },
  env: {
    language: 'en',
  },
  window: {
    createWebviewPanel,
  },
};

vi.mock('vscode', () => vscode);
