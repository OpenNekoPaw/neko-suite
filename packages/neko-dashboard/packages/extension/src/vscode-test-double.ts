import { vi } from 'vitest';

type CommandHandler = (...args: unknown[]) => unknown;

const commandHandlers = new Map<string, CommandHandler>();
interface InstalledExtension {
  isActive: boolean;
  exports: unknown;
  activate: () => Promise<unknown>;
}

const installedExtensions = new Map<string, InstalledExtension>();
const createWebviewPanel = vi.fn();
const registerWebviewViewProvider = vi.fn(
  (_viewType: string, _provider: unknown, _options?: unknown) => ({ dispose: vi.fn() }),
);
const showInformationMessage = vi.fn();
const showWarningMessage = vi.fn();
const showQuickPick = vi.fn();
const configurationValues = new Map<string, unknown>();
let l10nTranslate = (message: string, ...args: readonly unknown[]) =>
  args.reduce((text, arg, index) => text.replace(`{${index}}`, String(arg)), message);
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

export const vscodeExtensionState = {
  installedExtensions,
  reset() {
    installedExtensions.clear();
  },
};

export const vscodeEnvState = {
  setLanguage(language: string) {
    vscode.env.language = language;
  },
  reset() {
    vscode.env.language = 'en';
  },
};

export function installExtension(
  id: string,
  options: {
    isActive?: boolean;
    exports?: unknown;
    activate?: () => unknown | Promise<unknown>;
  } = {},
): void {
  const extension: InstalledExtension = {
    isActive: options.isActive ?? true,
    exports: options.exports ?? {},
    async activate() {
      const exports = options.activate ? await options.activate() : extension.exports;
      extension.exports = exports ?? {};
      extension.isActive = true;
      return extension.exports;
    },
  };
  installedExtensions.set(id, extension);
}

export const vscodeWindowState = {
  createWebviewPanel,
  registerWebviewViewProvider,
  showInformationMessage,
  showWarningMessage,
  showQuickPick,
  reset() {
    createWebviewPanel.mockReset();
    registerWebviewViewProvider.mockReset();
    showInformationMessage.mockReset();
    showWarningMessage.mockReset();
    showQuickPick.mockReset();
  },
};

export const vscodeWorkspaceState = {
  fs: vscodeWorkspaceFs,
  setConfigurationValue(key: string, value: unknown): void {
    configurationValues.set(key, value);
  },
  reset() {
    configurationValues.clear();
    vscodeWorkspaceFs.stat.mockReset();
    vscodeWorkspaceFs.readFile.mockReset();
    vscodeWorkspaceFs.writeFile.mockReset();
    vscodeWorkspaceFs.createDirectory.mockReset();
  },
};

export const vscodeL10nState = {
  setTranslate(translate: typeof l10nTranslate): void {
    l10nTranslate = translate;
  },
  reset(): void {
    l10nTranslate = (message: string, ...args: readonly unknown[]) =>
      args.reduce((text, arg, index) => text.replace(`{${index}}`, String(arg)), message);
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
    getConfiguration: vi.fn((section?: string) => ({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        const fullKey = section ? `${section}.${key}` : key;
        return configurationValues.has(fullKey) ? configurationValues.get(fullKey) : defaultValue;
      }),
    })),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
    fs: vscodeWorkspaceFs,
    workspaceFolders: undefined,
  },
  Uri: {
    joinPath: vi.fn((base: { fsPath?: string; path?: string }, ...segments: string[]) => ({
      fsPath: [base.fsPath ?? base.path ?? '', ...segments].join('/'),
    })),
  },
  ViewColumn: { One: 1 },
  extensions: {
    getExtension: vi.fn((id: string) => installedExtensions.get(id)),
    onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
  },
  env: {
    language: 'en',
  },
  l10n: {
    t: vi.fn((message: string, ...args: readonly unknown[]) => l10nTranslate(message, ...args)),
  },
  window: {
    createWebviewPanel,
    registerWebviewViewProvider,
    showInformationMessage,
    showWarningMessage,
    showQuickPick,
  },
};

vi.mock('vscode', () => vscode);
