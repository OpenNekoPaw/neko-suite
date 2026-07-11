import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData } from '@neko/shared';
import { CURRENT_NKA_VERSION, loadNka, saveNka } from '@neko/shared';
import { AudioProjectProvider } from './AudioProjectProvider';
import type { AudioProjectEditOperation } from '../services/audioProjectSessionGateway';

const vscodeMockState = vi.hoisted(() => {
  class EventEmitter<T> {
    private readonly listeners: Array<(event: T) => void> = [];

    readonly event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };

    fire(event: T): void {
      for (const listener of [...this.listeners]) listener(event);
    }

    dispose(): void {
      this.listeners.length = 0;
    }
  }

  class MockUri {
    private constructor(
      readonly fsPath: string,
      private readonly scheme = 'file',
    ) {}

    static file(filePath: string): MockUri {
      return new MockUri(filePath, 'file');
    }

    static parse(value: string): MockUri {
      if (value.startsWith('file://')) {
        return new MockUri(value.slice('file://'.length), 'file');
      }
      return new MockUri(value, 'file');
    }

    toString(): string {
      return this.scheme === 'file' ? `file://${this.fsPath}` : `${this.scheme}:${this.fsPath}`;
    }
  }

  const files = new Map<string, Uint8Array>();
  const readFile = vi.fn(async (uri: MockUri) => {
    const content = files.get(uri.fsPath);
    if (!content) throw new Error(`ENOENT: ${uri.fsPath}`);
    return content;
  });
  const writeFile = vi.fn(async (uri: MockUri, content: Uint8Array) => {
    files.set(uri.fsPath, content);
  });
  const stat = vi.fn(async (uri: MockUri) => {
    if (!files.has(uri.fsPath)) throw new Error(`ENOENT: ${uri.fsPath}`);
    return { type: 1 };
  });
  const rename = vi.fn(async (from: MockUri, to: MockUri) => {
    const content = files.get(from.fsPath);
    if (!content) throw new Error(`ENOENT: ${from.fsPath}`);
    files.set(to.fsPath, content);
    files.delete(from.fsPath);
  });
  const deleteFile = vi.fn(async (uri: MockUri) => {
    files.delete(uri.fsPath);
  });
  const createDirectory = vi.fn(async () => undefined);
  const executeCommand = vi.fn(async () => undefined);
  const showWarningMessage = vi.fn(async () => undefined);

  return {
    EventEmitter,
    MockUri,
    files,
    readFile,
    writeFile,
    stat,
    rename,
    deleteFile,
    createDirectory,
    executeCommand,
    showWarningMessage,
  };
});

vi.mock('vscode', () => ({
  EventEmitter: vscodeMockState.EventEmitter,
  Uri: vscodeMockState.MockUri,
  workspace: {
    workspaceFolders: [
      {
        uri: vscodeMockState.MockUri.file('/workspace/project'),
        name: 'project',
        index: 0,
      },
    ],
    fs: {
      readFile: vscodeMockState.readFile,
      writeFile: vscodeMockState.writeFile,
      stat: vscodeMockState.stat,
      rename: vscodeMockState.rename,
      delete: vscodeMockState.deleteFile,
      createDirectory: vscodeMockState.createDirectory,
    },
  },
  commands: {
    executeCommand: vscodeMockState.executeCommand,
  },
  window: {
    showWarningMessage: vscodeMockState.showWarningMessage,
  },
  l10n: {
    t: (message: string, ...args: readonly unknown[]) =>
      args.reduce((current, arg, index) => current.replace(`{${index}}`, String(arg)), message),
  },
  extensions: {
    getExtension: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('AudioProjectProvider headless authoring gateway', () => {
  beforeEach(() => {
    vscodeMockState.files.clear();
    vscodeMockState.readFile.mockClear();
    vscodeMockState.writeFile.mockClear();
    vscodeMockState.stat.mockClear();
    vscodeMockState.rename.mockClear();
    vscodeMockState.deleteFile.mockClear();
    vscodeMockState.createDirectory.mockClear();
    vscodeMockState.executeCommand.mockClear();
    vscodeMockState.showWarningMessage.mockClear();
  });

  it('loads, edits, saves, and reopens an unopened explicit documentUri without a Webview', async () => {
    const documentUri = seedProject('/workspace/project/audio-edit.nka', createProject());
    const provider = createProvider();

    const session = await provider.resolveSession(documentUri);
    expect(session?.documentUri).toBe(documentUri);

    await provider.applyOperation(session!, createSetVolumeOperation(0.42));

    expect(vscodeMockState.executeCommand).not.toHaveBeenCalled();
    const saved = readSavedProject('/workspace/project/audio-edit.nka');
    expect(saved.trackMix?.['track-1']?.volume).toBe(0.42);

    const reopened = await createProvider().resolveSession(documentUri);
    expect(reopened?.projectData.trackMix?.['track-1']?.volume).toBe(0.42);
  });

  it('syncs the matching open panel after a host-side write', async () => {
    const documentUri = seedProject('/workspace/project/open-audio.nka', createProject());
    const provider = createProvider();
    const postMessage = vi.fn(async () => undefined);
    setActivePanel(provider, documentUri, postMessage);

    const session = await provider.resolveSession(documentUri);
    await provider.applyOperation(session!, createSetVolumeOperation(0.25));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:sync',
        documentUri,
        reason: 'agent-edit',
        operation: expect.objectContaining({ type: 'track.mix.setVolume' }),
        projectData: expect.objectContaining({
          trackMix: expect.objectContaining({
            'track-1': expect.objectContaining({ volume: 0.25 }),
          }),
        }),
      }),
    );
  });

  it('writes an explicit file target instead of falling back to the active panel cache', async () => {
    const activeUri = seedProject('/workspace/project/active.nka', createProject({ volume: 0.9 }));
    const targetUri = seedProject('/workspace/project/target.nka', createProject({ volume: 0.7 }));
    const provider = createProvider();
    setActivePanel(
      provider,
      activeUri,
      vi.fn(async () => undefined),
    );
    getProviderCache(provider).set(activeUri, createProject({ volume: 0.9 }));

    const session = await provider.resolveSession(targetUri);
    await provider.applyOperation(session!, createSetVolumeOperation(0.1));

    expect(getProviderCache(provider).get(activeUri)?.trackMix?.['track-1']?.volume).toBe(0.9);
    expect(readSavedProject('/workspace/project/active.nka').trackMix?.['track-1']?.volume).toBe(
      0.9,
    );
    expect(readSavedProject('/workspace/project/target.nka').trackMix?.['track-1']?.volume).toBe(
      0.1,
    );
  });

  it('reads live project state only for the explicitly requested document URI', () => {
    const firstUri = 'file:///workspace/project/first.nka';
    const secondUri = 'file:///workspace/project/second.nka';
    const first = createProject({ volume: 0.2 });
    const second = createProject({ volume: 0.8 });
    const provider = createProvider();
    getProviderCache(provider).set(firstUri, first);
    getProviderCache(provider).set(secondUri, second);
    setActivePanel(
      provider,
      firstUri,
      vi.fn(async () => undefined),
    );

    expect(provider.getProjectDataForDocument(secondUri)).toBe(second);
    expect(
      provider.getProjectDataForDocument('file:///workspace/project/missing.nka'),
    ).toBeUndefined();
  });

  it('links audio sources for unopened documentUri sessions through the durable source path policy', async () => {
    const documentUri = seedProject('/workspace/project/link-source.nka', createProject());
    vscodeMockState.files.set('/workspace/project/audio/voice.wav', new Uint8Array([1, 2, 3]));
    const provider = createProvider();

    const session = await provider.resolveSession(documentUri);
    const durablePath = await provider.linkAudioSource(
      session!,
      '/workspace/project/audio/voice.wav',
    );

    expect(durablePath).toBe('audio/voice.wav');
    expect(vscodeMockState.executeCommand).not.toHaveBeenCalled();
  });
});

function createProvider(): AudioProjectProvider {
  return new AudioProjectProvider(
    vscodeMockState.MockUri.file('/workspace/extensions/neko-audio'),
    {
      register: vi.fn(() => ({ dispose: vi.fn() })),
      markActive: vi.fn(),
      markInactive: vi.fn(),
      markVisible: vi.fn(),
      markKeyboardFocused: vi.fn(),
      markKeyboardEditable: vi.fn(),
      hasKeyboardEditable: vi.fn(() => false),
      syncFocus: vi.fn(),
      unregister: vi.fn(),
      resolve: vi.fn(() => undefined),
      postKeyboardAction: vi.fn(async () => false),
    } as never,
  );
}

function setActivePanel(
  provider: AudioProjectProvider,
  documentUri: string,
  postMessage: (message: unknown) => Promise<unknown>,
): void {
  (
    provider as unknown as {
      _activePanels: Map<string, { active: boolean; visible: boolean; webview: unknown }>;
    }
  )._activePanels.set(documentUri, {
    active: true,
    visible: true,
    webview: { postMessage },
  });
}

function getProviderCache(provider: AudioProjectProvider): Map<string, AudioProjectData> {
  return (provider as unknown as { _projectDataCache: Map<string, AudioProjectData> })
    ._projectDataCache;
}

function seedProject(filePath: string, project: AudioProjectData): string {
  vscodeMockState.files.set(filePath, new TextEncoder().encode(saveNka(project)));
  return `file://${filePath}`;
}

function readSavedProject(filePath: string): AudioProjectData {
  const content = vscodeMockState.files.get(filePath);
  if (!content) throw new Error(`Missing saved project ${filePath}`);
  const loaded = loadNka(new TextDecoder().decode(content));
  if (!loaded.data) throw new Error(`Invalid saved project ${filePath}`);
  return loaded.data;
}

function createProject(options: { readonly volume?: number } = {}): AudioProjectData {
  return {
    version: CURRENT_NKA_VERSION,
    name: 'Headless Audio',
    sampleRate: 48000,
    channels: 2,
    bpm: 120,
    masterVolume: 1,
    masterEffectsChain: [],
    markers: [],
    tracks: [
      {
        id: 'track-1',
        name: 'Voice',
        type: 'audio',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    trackMix: {
      'track-1': {
        volume: options.volume ?? 1,
        pan: 0,
        solo: false,
        effectChain: [],
      },
    },
  };
}

function createSetVolumeOperation(volume: number): AudioProjectEditOperation {
  return {
    type: 'track.mix.setVolume',
    meta: {
      id: `op-${volume}`,
      timestamp: 1,
      source: 'ai',
      description: 'Set track volume',
    },
    payload: { trackId: 'track-1', volume },
    before: { volume: 1 },
  };
}
