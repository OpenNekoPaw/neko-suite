import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const commands = new Map<string, (...args: unknown[]) => unknown>();

  const outputChannel = {
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  };

  const statusBarItem = {
    text: '',
    tooltip: '',
    command: undefined as string | undefined,
    backgroundColor: undefined as unknown,
    show: vi.fn(),
    dispose: vi.fn(),
  };

  const nativeEngine = {
    hasGpu: vi.fn(() => true),
    groups: vi.fn(() => ['nodes', 'videos']),
    getFrameServerPort: vi.fn(() => null as number | null),
    startFrameServer: vi.fn(async () => 0),
    stopFrameServer: vi.fn(async () => undefined),
    dispatchAction: vi.fn(async () => '{"status":"ok"}'),
  };

  const engineWrapper = {
    engine: nativeEngine,
    state: 'ready',
    capabilities: { hardwareAcceleration: true },
    probeMedia: vi.fn(),
  };

  const manager = {
    getCompatibleEngine: vi.fn(async () => engineWrapper),
    disposeEngines: vi.fn(async () => undefined),
    dispose: vi.fn(),
  };

  const exportService = {
    cancel: vi.fn(async () => undefined),
    dispose: vi.fn(),
    initializeWithEngine: vi.fn(),
    export: vi.fn(),
  };

  const showInformationMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const executeCommand = vi.fn(async (id: string, ...args: unknown[]) => {
    const handler = commands.get(id);
    if (!handler) return undefined;
    return await handler(...args);
  });

  const fetch = vi.fn();

  return {
    commands,
    outputChannel,
    statusBarItem,
    nativeEngine,
    engineWrapper,
    manager,
    exportService,
    showInformationMessage,
    showErrorMessage,
    executeCommand,
    fetch,
  };
});

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => createLogger()),
  };
}

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => mockState.outputChannel,
    createStatusBarItem: () => mockState.statusBarItem,
    showInformationMessage: mockState.showInformationMessage,
    showErrorMessage: mockState.showErrorMessage,
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    withProgress: vi.fn(),
  },
  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      mockState.commands.set(id, handler);
      return { dispose: () => mockState.commands.delete(id) };
    },
    executeCommand: mockState.executeCommand,
  },
  env: {
    openExternal: vi.fn(),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: vi.fn(),
  },
  StatusBarAlignment: {
    Right: 1,
  },
  ProgressLocation: {
    Notification: 1,
  },
  ThemeColor: class {
    constructor(public readonly id: string) {}
  },
}));

vi.mock('./mediaEngine', () => ({
  MediaEngineManager: class {},
  NativeMediaEngine: class {},
  createMediaEngineManager: vi.fn(() => mockState.manager),
}));

vi.mock('./mediaEngine/export', () => ({
  ExportService: class {
    _isInitialized = false;
    cancel = mockState.exportService.cancel;
    dispose = mockState.exportService.dispose;
    initializeWithEngine = mockState.exportService.initializeWithEngine;
    export = mockState.exportService.export;
  },
  JviProjectLoader: class {},
  VideoFrameProvider: class {},
  createVideoFrameProvider: vi.fn(),
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  createVSCodeLogger: vi.fn(() => createLogger()),
  VSCodeErrorHandler: class {
    handleError = vi.fn(async () => undefined);
  },
}));

vi.mock('./mediaEngine/OrtInitializer', () => ({
  initOrtDylib: vi.fn(),
}));

async function activateExtension() {
  vi.resetModules();
  mockState.commands.clear();

  const extension = await import('./extension');
  const context = {
    subscriptions: [] as { dispose?: () => void }[],
    extensionUri: { fsPath: '/tmp/extension' },
    globalStorageUri: { fsPath: '/tmp/storage' },
  };

  extension.activate(context as never);

  return { extension, context };
}

describe('neko-engine extension command bridge', () => {
  beforeEach(() => {
    mockState.outputChannel.appendLine.mockClear();
    mockState.outputChannel.show.mockClear();
    mockState.statusBarItem.show.mockClear();
    mockState.showInformationMessage.mockClear();
    mockState.showErrorMessage.mockClear();
    mockState.executeCommand.mockClear();
    mockState.manager.getCompatibleEngine.mockClear();
    mockState.manager.disposeEngines.mockClear();
    mockState.exportService.cancel.mockClear();
    mockState.exportService.dispose.mockClear();
    mockState.exportService.initializeWithEngine.mockClear();
    mockState.nativeEngine.getFrameServerPort.mockReset();
    mockState.nativeEngine.getFrameServerPort.mockReturnValue(null);
    mockState.nativeEngine.startFrameServer.mockReset();
    mockState.nativeEngine.startFrameServer.mockResolvedValue(1234);
    mockState.nativeEngine.stopFrameServer.mockReset();
    mockState.nativeEngine.stopFrameServer.mockResolvedValue(undefined);
    mockState.nativeEngine.dispatchAction.mockReset();
    mockState.nativeEngine.dispatchAction.mockResolvedValue('{"status":"ok"}');
    mockState.fetch.mockReset();
    vi.stubGlobal('fetch', mockState.fetch);
  });

  it('reuses an already running frame server reported by the native engine', async () => {
    mockState.nativeEngine.getFrameServerPort.mockReturnValue(4321);
    mockState.fetch.mockResolvedValue({ ok: true });

    await activateExtension();

    const result = await mockState.executeCommand('neko.engine.ensureFrameServer');

    expect(result).toEqual({ port: 4321 });
    expect(mockState.nativeEngine.startFrameServer).not.toHaveBeenCalled();
    expect(mockState.fetch).toHaveBeenCalledWith('http://127.0.0.1:4321/health', {
      signal: expect.any(AbortSignal),
    });
  });

  it('restarts the embedded frame server when the cached port is stale', async () => {
    mockState.nativeEngine.startFrameServer.mockResolvedValueOnce(1234).mockResolvedValueOnce(5678);
    mockState.fetch.mockResolvedValue({ ok: false });

    await activateExtension();

    const first = await mockState.executeCommand('neko.engine.ensureFrameServer');
    const second = await mockState.executeCommand('neko.engine.ensureFrameServer');

    expect(first).toEqual({ port: 1234 });
    expect(second).toEqual({ port: 5678 });
    expect(mockState.nativeEngine.stopFrameServer).toHaveBeenCalledTimes(1);
    expect(mockState.nativeEngine.startFrameServer).toHaveBeenCalledTimes(2);
  });

  it('forwards generic dispatch commands through NativeEngine.dispatchAction', async () => {
    mockState.nativeEngine.dispatchAction.mockResolvedValue('{"status":"ok","data":{"pong":true}}');

    await activateExtension();

    const result = await mockState.executeCommand('neko.engine.dispatch', 'nodes', 'health', {
      verbose: true,
    });

    expect(result).toBe('{"status":"ok","data":{"pong":true}}');
    expect(mockState.nativeEngine.dispatchAction).toHaveBeenCalledWith(
      'nodes',
      'health',
      null,
      JSON.stringify({ verbose: true }),
      null,
      null,
      null,
      null,
    );
  });
});
