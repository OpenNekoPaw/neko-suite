import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntityRef,
} from '@neko/shared';
import { ENTITY_FACADE_COMMANDS } from '@neko/shared';
import { vscodeCommandState, vscodeL10nState, vscodeWorkspaceState } from './vscode-test-double';
import {
  EntityInspectorProvider,
  isInspectorEventRelated,
  toInspectorDashboardRef,
} from './entityInspectorProvider';
import type { CreativeEntitySourceAggregator } from './creativeEntitySourceAggregator';

describe('EntityInspectorProvider', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
    vscodeL10nState.reset();
    vscodeWorkspaceState.reset();
    vi.useRealTimers();
  });

  it('maps inspect requests to Dashboard refs and focuses the Inspector', async () => {
    const aggregator = createAggregator({ detail: entityDetail });
    const executeCommand = vi.fn(
      async (_command: string, ..._args: readonly unknown[]) => undefined,
    );
    const focus = vi.fn(async () => undefined);
    vscodeCommandState.commandHandlers.set('neko.entityInspector.focus', focus);
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: aggregator,
      executeCommand,
    });

    const result = await provider.inspect({
      projectRoot: '/workspace',
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character', source: 'neko-entity' },
    });

    expect(result).toEqual({ ok: true });
    expect(aggregator.refreshSources).toHaveBeenCalledWith({
      projectRoot: '/workspace',
      contextUri: undefined,
    });
    expect(aggregator.getDetail).toHaveBeenCalledWith({
      source: 'neko-entity',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
      projectRoot: '/workspace',
    });
    expect(focus).toHaveBeenCalled();
    expect(executeCommand).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('routes valid Inspector actions and rejects invalid Webview payloads', async () => {
    const executeCommand = vi.fn(async (_command: string, ..._args: readonly unknown[]) => ({
      ok: true,
    }));
    const postMessage = vi.fn(async () => true);
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: createAggregator({ detail: entityDetail }),
      executeCommand,
    });
    const view = createWebviewView(postMessage);
    provider.resolveWebviewView(view);
    await provider.inspect({
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character', projectRoot: '/workspace' },
      reveal: false,
    });

    const listener = view.webview.onDidReceiveMessage.mock.calls[0]?.[0];
    await listener?.({ type: 'entityInspector.action', action: 'rename-entity' });
    await listener?.({ type: 'entityInspector.action', action: 'write-directly' });

    expect(executeCommand).toHaveBeenCalledWith(
      ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction,
      expect.objectContaining({
        action: 'rename-entity',
        entityRef: expect.objectContaining({ entityId: 'char_xiaoju' }),
      }),
    );
    expect(postMessage).toHaveBeenCalledWith({
      type: 'entityInspector.error',
      message: 'Invalid Inspector action.',
    });
    provider.dispose();
  });

  it('posts orphaned binding projection text for Inspector rendering', async () => {
    const postMessage = vi.fn(async () => true);
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: createAggregator({ detail: entityDetail }),
    });
    const view = createWebviewView(postMessage);
    provider.resolveWebviewView(view);

    await provider.inspect({
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character', projectRoot: '/workspace' },
      reveal: false,
    });

    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'entityInspector.update',
      state: expect.objectContaining({
        detail: entityDetail,
        bindingTexts: [
          'portrait: project://assets/missing-portrait · confirmed · unavailable · default · orphaned at 2026-06-10T01:00:00.000Z',
        ],
      }),
    });
    expect(view.webview.html).toContain('state.bindingTexts || []');
    provider.dispose();
  });

  it('renders Inspector chrome through localized strings', () => {
    vscodeL10nState.setTranslate((message) => `zh:${message}`);
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: createAggregator({ detail: entityDetail }),
    });
    const view = createWebviewView(vi.fn(async () => true));

    provider.resolveWebviewView(view);

    expect(view.webview.html).toContain('<title>zh:Entity Inspector</title>');
    expect(view.webview.html).toContain('zh:No entity selected.');
    expect(view.webview.html).toContain('"rename":"zh:Rename"');
    expect(view.webview.html).toContain('"openDashboard":"zh:Open Dashboard"');
    provider.dispose();
  });

  it('detects related entity events for targeted refresh', () => {
    expect(
      isInspectorEventRelated(entityDetail.ref, {
        type: 'refreshed',
        source: 'neko-entity',
        ref: entityDetail.ref,
        freshness: 'fresh',
      }),
    ).toBe(true);
    expect(
      isInspectorEventRelated(entityDetail.ref, {
        type: 'refreshed',
        source: 'neko-entity',
        ref: { ...entityDetail.ref, sourceEntityId: 'entity:other', entityId: 'other' },
        freshness: 'fresh',
      }),
    ).toBe(false);
  });

  it('maps candidate inspect requests to candidate refs', () => {
    expect(
      toInspectorDashboardRef({ projectRoot: '/workspace', candidateId: 'candidate:1' }),
    ).toEqual({
      source: 'neko-entity',
      sourceEntityId: 'candidate:1',
      entityKind: 'character',
      projectRoot: '/workspace',
    });
  });

  it('refreshes inspected candidates to confirmed entity detail', async () => {
    let listener: ((event: DashboardCreativeEntityEvent) => void) | undefined;
    const postMessage = vi.fn(async () => true);
    const aggregator = createAggregator({
      detail: (ref) =>
        ref.sourceEntityId === 'candidate:character:char_xiaoju' ? candidateDetail : entityDetail,
      onChange: (next) => {
        listener = next;
      },
    });
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: aggregator,
    });
    provider.resolveWebviewView(createWebviewView(postMessage));
    await provider.inspect({ candidateId: 'candidate:character:char_xiaoju', reveal: false });

    listener?.({
      type: 'refreshed',
      source: 'neko-entity',
      ref: entityDetail.ref,
      changedRefs: [
        {
          kind: 'candidate',
          id: 'candidate:character:char_xiaoju',
          entityRef: { entityId: 'char_xiaoju', entityKind: 'character', source: 'neko-entity' },
        },
      ],
      freshness: 'fresh',
    });
    await Promise.resolve();

    expect(aggregator.getDetail).toHaveBeenLastCalledWith({
      source: 'neko-entity',
      sourceEntityId: 'entity:char_xiaoju',
      entityId: 'char_xiaoju',
      entityKind: 'character',
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'entityInspector.update',
        state: expect.objectContaining({
          detail: entityDetail,
          entityRef: expect.objectContaining({ entityId: 'char_xiaoju' }),
        }),
      }),
    );
    provider.dispose();
  });

  it('refreshes binding updates and ignores unrelated events', async () => {
    let listener: ((event: DashboardCreativeEntityEvent) => void) | undefined;
    const aggregator = createAggregator({
      detail: entityDetail,
      onChange: (next) => {
        listener = next;
      },
    });
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: aggregator,
    });
    await provider.inspect({
      entityRef: { entityId: 'char_xiaoju', entityKind: 'character', source: 'neko-entity' },
      reveal: false,
    });
    vi.mocked(aggregator.getDetail).mockClear();

    listener?.({
      type: 'refreshed',
      source: 'neko-entity',
      changedRefs: [{ kind: 'binding', id: 'other' }],
      freshness: 'fresh',
    });
    await Promise.resolve();
    expect(aggregator.getDetail).not.toHaveBeenCalled();

    listener?.({
      type: 'refreshed',
      source: 'neko-entity',
      changedRefs: [
        {
          kind: 'binding',
          id: 'binding:1',
          entityRef: { entityId: 'char_xiaoju', entityKind: 'character', source: 'neko-entity' },
        },
      ],
      freshness: 'fresh',
    });
    await Promise.resolve();
    expect(aggregator.getDetail).toHaveBeenCalledOnce();
    provider.dispose();
  });

  it('debounces auto-follow signals only when enabled', async () => {
    vi.useFakeTimers();
    const aggregator = createAggregator({ detail: entityDetail });
    const provider = new EntityInspectorProvider(createContext(), {
      creativeEntityAggregator: aggregator,
    });

    provider.follow(
      {
        entityRef: { entityId: 'first', entityKind: 'character', source: 'neko-entity' },
      },
      20,
    );
    await vi.advanceTimersByTimeAsync(25);
    expect(aggregator.getDetail).not.toHaveBeenCalled();

    vscodeWorkspaceState.setConfigurationValue('neko.entityInspector.autoFollow', true);
    provider.follow(
      {
        entityRef: { entityId: 'first', entityKind: 'character', source: 'neko-entity' },
      },
      20,
    );
    provider.follow(
      {
        entityRef: { entityId: 'second', entityKind: 'character', source: 'neko-entity' },
      },
      20,
    );
    await vi.advanceTimersByTimeAsync(25);

    expect(aggregator.getDetail).toHaveBeenCalledOnce();
    expect(aggregator.getDetail).toHaveBeenCalledWith(
      expect.objectContaining({ sourceEntityId: 'entity:second' }),
    );
    provider.dispose();
  });
});

const entityDetail: DashboardCreativeEntityDetail = {
  ref: {
    source: 'neko-entity',
    sourceEntityId: 'entity:char_xiaoju',
    entityId: 'char_xiaoju',
    entityKind: 'character',
    projectRoot: '/workspace',
  },
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  aliases: [],
  relationships: [],
  occurrences: [],
  bindings: [
    {
      id: 'binding:1',
      role: 'portrait',
      assetRef: 'project://assets/missing-portrait',
      status: 'confirmed',
      availability: 'orphaned',
      orphanedAt: '2026-06-10T01:00:00.000Z',
      source: 'user',
      isDefault: true,
      updatedAt: '2026-06-10T00:00:00.000Z',
    },
  ],
  defaults: [
    {
      id: 'binding:1',
      role: 'portrait',
      assetRef: 'project://assets/missing-portrait',
      status: 'confirmed',
      availability: 'orphaned',
      orphanedAt: '2026-06-10T01:00:00.000Z',
      source: 'user',
      isDefault: true,
      updatedAt: '2026-06-10T00:00:00.000Z',
    },
  ],
  requirements: [],
  visualDrafts: [],
  syncSuggestions: [],
  freshness: 'fresh',
  actions: [{ id: 'refresh', label: 'Refresh' }],
};

const candidateDetail: DashboardCreativeEntityDetail = {
  ...entityDetail,
  ref: {
    source: 'neko-entity',
    sourceEntityId: 'candidate:character:char_xiaoju',
    entityId: 'candidate:character:char_xiaoju',
    entityKind: 'character',
  },
  status: 'candidate',
};

function createAggregator(
  options: {
    readonly detail?:
      | DashboardCreativeEntityDetail
      | ((ref: DashboardCreativeEntityRef) => DashboardCreativeEntityDetail | undefined);
    readonly onChange?: (listener: (event: DashboardCreativeEntityEvent) => void) => void;
  } = {},
): CreativeEntitySourceAggregator {
  return {
    refreshSources: vi.fn(async () => {}),
    getDetail: vi.fn(async (ref: DashboardCreativeEntityRef) =>
      typeof options.detail === 'function' ? options.detail(ref) : options.detail,
    ),
    getState: vi.fn(() => ({ statuses: [], rows: [] })),
    executeAction: vi.fn(),
    onDidChangeEntity: vi.fn((listener: (event: DashboardCreativeEntityEvent) => void) => {
      options.onChange?.(listener);
      return { dispose() {} };
    }),
    dispose: vi.fn(),
  } as unknown as CreativeEntitySourceAggregator;
}

function createContext(): import('vscode').ExtensionContext {
  return {
    subscriptions: [],
    extensionUri: { fsPath: '/ext' },
  } as unknown as import('vscode').ExtensionContext;
}

function createWebviewView(postMessage: ReturnType<typeof vi.fn>) {
  const onDidReceiveMessage = vi.fn(() => ({ dispose() {} }));
  return {
    viewType: 'neko.entityInspector',
    onDidDispose: vi.fn(() => ({ dispose() {} })),
    visible: true,
    onDidChangeVisibility: vi.fn(() => ({ dispose() {} })),
    show: vi.fn(),
    webview: {
      options: {},
      html: '',
      cspSource: 'vscode-webview:',
      postMessage,
      onDidReceiveMessage,
    },
  } as unknown as {
    readonly viewType: string;
    readonly onDidDispose: ReturnType<typeof vi.fn>;
    readonly visible: boolean;
    readonly onDidChangeVisibility: ReturnType<typeof vi.fn>;
    readonly show: ReturnType<typeof vi.fn>;
    readonly webview: {
      options: Record<string, unknown>;
      html: string;
      cspSource: string;
      postMessage: typeof postMessage;
      onDidReceiveMessage: ReturnType<typeof vi.fn>;
    };
  };
}
