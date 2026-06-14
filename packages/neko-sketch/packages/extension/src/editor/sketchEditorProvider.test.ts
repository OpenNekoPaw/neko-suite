import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { PsdImportIssue, SketchSelectionData } from '@neko/shared';
import {
  SketchEditorProvider,
  formatPsdImportIssueSummary,
  summarizePsdImportIssues,
} from './sketchEditorProvider';

const mockState = vi.hoisted(() => {
  class MockUri {
    readonly fsPath: string;

    constructor(readonly path: string) {
      this.fsPath = path;
    }

    toString(): string {
      return `file://${this.path}`;
    }

    static file(path: string): MockUri {
      return new MockUri(path);
    }

    static parse(value: string): MockUri {
      return new MockUri(value.replace(/^file:\/\//, ''));
    }

    static joinPath(base: MockUri, ...paths: string[]): MockUri {
      return new MockUri([base.path, ...paths].join('/').replace(/\/+/g, '/'));
    }
  }

  return {
    MockUri,
    fsWrites: new Map<string, Uint8Array>(),
    createdDirs: new Set<string>(),
    deletedUris: new Set<string>(),
    executeCommand: vi.fn(async () => undefined),
    readFile: vi.fn(),
  };
});

vi.mock('vscode', () => ({
  Uri: mockState.MockUri,
  EventEmitter: class {
    readonly event = vi.fn();
    fire = vi.fn();
  },
  workspace: {
    fs: {
      createDirectory: vi.fn(async (uri: InstanceType<typeof mockState.MockUri>) => {
        mockState.createdDirs.add(uri.toString());
      }),
      writeFile: vi.fn(async (uri: InstanceType<typeof mockState.MockUri>, data: Uint8Array) => {
        mockState.fsWrites.set(uri.toString(), data);
      }),
      delete: vi.fn(async (uri: InstanceType<typeof mockState.MockUri>) => {
        mockState.deletedUris.add(uri.toString());
      }),
      readFile: mockState.readFile,
    },
    getConfiguration: () => ({
      get: (_key: string, defaultValue: boolean) => defaultValue,
    }),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      show: vi.fn(),
    })),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  l10n: {
    t: (value: string) => value,
  },
  commands: {
    executeCommand: mockState.executeCommand,
  },
}));

vi.mock('@neko/shared/vscode/extension', () => ({
  injectLocaleAttribute: () => '',
  createFocusedWebviewRegistry: () => ({
    createController: vi.fn(() => ({
      dispose: vi.fn(),
      markReady: vi.fn(),
      markDisposed: vi.fn(),
      updateVisibility: vi.fn(),
    })),
    getFocused: vi.fn(() => undefined),
    syncFocus: vi.fn(),
    clearFocus: vi.fn(),
    dispose: vi.fn(),
  }),
}));

describe('SketchEditorProvider AI context snapshot', () => {
  beforeEach(() => {
    mockState.fsWrites.clear();
    mockState.createdDirs.clear();
    mockState.deletedUris.clear();
    mockState.executeCommand.mockClear();
    mockState.readFile.mockReset();
  });

  it('caches canvas and selection assets as fileUri refs', async () => {
    const selection: SketchSelectionData = {
      x: 4,
      y: 8,
      width: 16,
      height: 32,
      mask: Buffer.from('mask').toString('base64'),
      layerImageData: Buffer.from('layer').toString('base64'),
    };
    const provider = createProvider({
      canvas: Buffer.from('canvas').toString('base64'),
      selection,
    });

    const snapshot = await provider.createAIContextSnapshot({
      runId: 'run-1',
      operation: 'inpaint',
      scope: 'canvas',
      includeSelection: true,
    });

    expect(snapshot).toEqual({
      runId: 'run-1',
      operation: 'inpaint',
      scope: 'canvas',
      compositeImage: {
        kind: 'fileUri',
        ref: 'file:///tmp/neko-sketch/sketch-ai/run-1/context/composite.png',
        mimeType: 'image/png',
      },
      maskImage: {
        kind: 'fileUri',
        ref: 'file:///tmp/neko-sketch/sketch-ai/run-1/context/selection-mask.png',
        mimeType: 'image/png',
      },
      selectionBounds: {
        x: 4,
        y: 8,
        width: 16,
        height: 32,
      },
    });
    expect(
      Buffer.from(
        mockState.fsWrites.get('file:///tmp/neko-sketch/sketch-ai/run-1/context/composite.png') ??
          [],
      ),
    ).toEqual(Buffer.from('canvas'));
    expect(
      Buffer.from(
        mockState.fsWrites.get(
          'file:///tmp/neko-sketch/sketch-ai/run-1/context/selection-mask.png',
        ) ?? [],
      ),
    ).toEqual(Buffer.from('mask'));
  });

  it('caches layer snapshots separately from canvas snapshots', async () => {
    const provider = createProvider({
      layer: Buffer.from('layer').toString('base64'),
    });

    const snapshot = await provider.createAIContextSnapshot({
      runId: 'layer-run',
      operation: 'upscale',
      scope: 'layer',
      layerId: 'layer-1',
    });

    expect(snapshot?.layerImage).toEqual({
      kind: 'fileUri',
      ref: 'file:///tmp/neko-sketch/sketch-ai/layer-run/context/layer.png',
      mimeType: 'image/png',
    });
    expect(snapshot?.compositeImage).toBeUndefined();
    expect(
      Buffer.from(
        mockState.fsWrites.get('file:///tmp/neko-sketch/sketch-ai/layer-run/context/layer.png') ??
          [],
      ),
    ).toEqual(Buffer.from('layer'));
  });

  it('cleans cached AI artifacts by run id', async () => {
    const provider = createProvider({});

    await provider.cleanupAIArtifacts('run-1');

    expect(mockState.deletedUris).toContain('file:///tmp/neko-sketch/sketch-ai/run-1');
  });

  it('cleans AI result cache after webview applies the result', async () => {
    const provider = createProvider({});

    await (
      provider as unknown as {
        handleWebviewMessage(
          message: { type: string; [key: string]: unknown },
          webviewPanel: unknown,
          document: unknown,
        ): Promise<void>;
      }
    ).handleWebviewMessage(
      { type: 'ai:resultApplied', runId: 'run-2', success: true },
      {},
      { uri: mockState.MockUri.file('/tmp/doc.nks') },
    );

    expect(mockState.deletedUris).toContain('file:///tmp/neko-sketch/sketch-ai/run-2');
  });

  it('cancels a registered AI run from a webview cancel request', async () => {
    const provider = createProvider({});
    const cancel = vi.fn(async () => {});
    const postMessage = vi.fn(async () => true);
    provider.registerAIRun('run-3', cancel);

    await (
      provider as unknown as {
        handleWebviewMessage(
          message: { type: string; [key: string]: unknown },
          webviewPanel: unknown,
          document: unknown,
        ): Promise<void>;
      }
    ).handleWebviewMessage(
      { type: 'ai:cancel', runId: 'run-3' },
      { webview: { postMessage } },
      { uri: mockState.MockUri.file('/tmp/doc.nks') },
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'ai:cancel', runId: 'run-3' });
    expect(mockState.deletedUris).toContain('file:///tmp/neko-sketch/sketch-ai/run-3');
    await expect(provider.cancelAIRun('run-3')).resolves.toBe(false);
  });

  it('reports an AI error when cancelling an unknown run', async () => {
    const provider = createProvider({});
    const postMessage = vi.fn(async () => true);

    await (
      provider as unknown as {
        handleWebviewMessage(
          message: { type: string; [key: string]: unknown },
          webviewPanel: unknown,
          document: unknown,
        ): Promise<void>;
      }
    ).handleWebviewMessage(
      { type: 'ai:cancel', runId: 'missing-run' },
      { webview: { postMessage } },
      { uri: mockState.MockUri.file('/tmp/doc.nks') },
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'ai:error',
      runId: 'missing-run',
      message: 'No cancellable AI run is registered for missing-run.',
    });
  });

  it('sends sketch AI intent to Neko Agent', async () => {
    const provider = createProvider({});

    await (
      provider as unknown as {
        handleWebviewMessage(
          message: { type: string; [key: string]: unknown },
          webviewPanel: unknown,
          document: unknown,
        ): Promise<void>;
      }
    ).handleWebviewMessage(
      {
        type: 'ai:openAgent',
        operation: 'inpaint',
        prompt: 'replace the sky',
        params: {
          negativePrompt: 'low detail',
          strength: 1.5,
          layerName: 'Sky fix',
        },
      },
      {},
      { uri: mockState.MockUri.file('/tmp/doc.nks') },
    );

    expect(mockState.executeCommand).toHaveBeenCalledWith(
      'neko.agent.sendContext',
      expect.objectContaining({
        type: 'sketch-layer',
        id: 'file:///tmp/doc.nks',
        label: 'doc.nks',
        data: expect.objectContaining({
          operation: 'inpaint',
          params: {
            negativePrompt: 'low detail',
            strength: 1,
            layerName: 'Sky fix',
          },
        }),
        summary:
          'Neko Sketch document: doc.nks. Requested AI operation: inpaint. Parameters: negativePrompt=low detail; strength=1; layerName=Sky fix.',
        intent:
          'Use Neko Sketch inpaint on the active sketch. Prompt: replace the sky Parameters: negativePrompt=low detail; strength=1; layerName=Sky fix',
      }),
    );
  });

  it('imports an image file asset into the active sketch webview', async () => {
    const provider = createProvider({});
    const postMessage = vi.fn(async () => true);
    mockState.readFile.mockImplementationOnce(async () => Buffer.from('image-bytes'));
    (provider as unknown as { activeWebviewPanel: unknown }).activeWebviewPanel = {
      webview: { postMessage },
    };

    await provider.importFileAsset(
      mockState.MockUri.file('/tmp/frame.png') as unknown as vscode.Uri,
      {
        name: 'Generated Frame',
      },
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'file:imported',
      name: 'Generated Frame',
      data: Buffer.from('image-bytes').toString('base64'),
      path: '/tmp/frame.png',
    });
  });

  it('imports a queued file asset after the next sketch document loads', async () => {
    const provider = createProvider({});
    const postMessage = vi.fn(async () => true);
    mockState.readFile
      .mockImplementationOnce(async () => Buffer.from('{"layers":[]}'))
      .mockImplementationOnce(async () => Buffer.from('queued-image'));
    provider.queueFileImport(mockState.MockUri.file('/tmp/queued.png') as unknown as vscode.Uri, {
      name: 'Queued',
    });

    await (
      provider as unknown as {
        handleWebviewMessage(
          message: { type: string; [key: string]: unknown },
          webviewPanel: unknown,
          document: unknown,
        ): Promise<void>;
      }
    ).handleWebviewMessage(
      { type: 'ready' },
      { webview: { postMessage } },
      { uri: mockState.MockUri.file('/tmp/doc.nks') },
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'file:imported',
      name: 'Queued',
      data: Buffer.from('queued-image').toString('base64'),
      path: '/tmp/queued.png',
    });
  });
});

describe('PSD import report formatting', () => {
  it('groups compatibility issues by code while preserving sample layer paths', () => {
    const issues: PsdImportIssue[] = [
      createPsdIssue('unsupported-layer-kind', ['Title']),
      createPsdIssue('unsupported-layer-kind', ['Logo Smart Object']),
      createPsdIssue('unsupported-layer-kind', ['Logo Smart Object']),
      createPsdIssue('unsupported-blend-mode', ['Glow']),
      createPsdIssue('parse-failed', undefined, 'error'),
    ];

    expect(summarizePsdImportIssues(issues)).toEqual([
      {
        code: 'unsupported-layer-kind',
        severity: 'warning',
        count: 3,
        sampleLayerPaths: ['Title', 'Logo Smart Object'],
      },
      {
        code: 'unsupported-blend-mode',
        severity: 'warning',
        count: 1,
        sampleLayerPaths: ['Glow'],
      },
      {
        code: 'parse-failed',
        severity: 'error',
        count: 1,
        sampleLayerPaths: ['(document)'],
      },
    ]);
  });

  it('formats a compact summary before detailed PSD issue rows', () => {
    const text = formatPsdImportIssueSummary([
      createPsdIssue('group-isolation-mismatch', ['Folder']),
      createPsdIssue('group-isolation-mismatch', ['Nested', 'Folder']),
      createPsdIssue('missing-pixel-data', ['Empty']),
    ]);

    expect(text).toBe(
      [
        'Summary by issue type:',
        '- [warning] group-isolation-mismatch: 2 (examples: Folder; Nested > Folder)',
        '- [warning] missing-pixel-data: 1 (examples: Empty)',
      ].join('\n'),
    );
  });
});

function createProvider(data: {
  readonly canvas?: string | null;
  readonly layer?: string | null;
  readonly selection?: SketchSelectionData | null;
}): TestSketchEditorProvider {
  const provider = new TestSketchEditorProvider(createContext(), data);
  (provider as unknown as { activeWebviewPanel: unknown }).activeWebviewPanel = {};
  return provider;
}

function createContext(): ConstructorParameters<typeof SketchEditorProvider>[0] {
  return {
    extensionUri: mockState.MockUri.file('/extension'),
    globalStorageUri: mockState.MockUri.file('/tmp/neko-sketch'),
    subscriptions: [],
  } as unknown as ConstructorParameters<typeof SketchEditorProvider>[0];
}

class TestSketchEditorProvider extends SketchEditorProvider {
  constructor(
    context: ConstructorParameters<typeof SketchEditorProvider>[0],
    private readonly data: {
      readonly canvas?: string | null;
      readonly layer?: string | null;
      readonly selection?: SketchSelectionData | null;
    },
  ) {
    super(context);
  }

  override async getCanvasImageData(): Promise<string | null> {
    return this.data.canvas ?? null;
  }

  override async getLayerImageData(): Promise<string | null> {
    return this.data.layer ?? null;
  }

  override async getSelectionMask(): Promise<SketchSelectionData | null> {
    return this.data.selection ?? null;
  }
}

function createPsdIssue(
  code: PsdImportIssue['code'],
  layerPath?: readonly string[],
  severity: PsdImportIssue['severity'] = 'warning',
): PsdImportIssue {
  return {
    code,
    severity,
    message: `${code} message`,
    layerPath,
  };
}
