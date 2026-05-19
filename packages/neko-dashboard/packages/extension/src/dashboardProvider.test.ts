import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { DashboardTask } from '@neko/shared/types/dashboard-task';
import type {
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityEvent,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRow,
} from '@neko/shared/types/dashboard-creative-entity';
import { DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND } from '@neko/shared/types/dashboard-creative-entity';
import { vscodeCommandState, vscodeWindowState } from './vscode-test-double';
import type { ActivityStore } from './activityStore';
import type { CreativeEntitySourceAggregator } from './creativeEntitySourceAggregator';
import { DashboardProvider } from './dashboardProvider';
import type { ProjectScanner } from './projectScanner';
import type { SkillReader } from './skillReader';
import type { StatusReader } from './statusReader';
import type { TaskAggregator } from './taskAggregator';

type DashboardMessageListener = (message: unknown) => unknown;
type WebviewMessageRegistration = (
  listener: DashboardMessageListener,
  thisArgs?: unknown,
  disposables?: unknown[],
) => { dispose(): void };

describe('DashboardProvider', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
    vscodeWindowState.reset();
  });

  it('coalesces concurrent refreshes from rapid show calls', async () => {
    const refreshGate = createDeferred<void>();
    const postMessage = vi.fn(async () => true);
    const panel = createPanel(postMessage);
    vscodeWindowState.createWebviewPanel.mockReturnValue(panel);

    const taskAggregator = createTaskAggregator({
      refreshSources: vi.fn(() => refreshGate.promise),
    });
    const scanner = createScanner();
    const statusReader = createStatusReader();
    const skillReader = createSkillReader();

    const provider = new DashboardProvider(createContext(), {
      scanner,
      statusReader,
      skillReader,
      taskAggregator,
      creativeEntityAggregator: createCreativeEntityAggregator(),
      activityStore: createActivityStore(),
    });

    const firstShow = provider.show();
    const secondShow = provider.show();

    expect(taskAggregator.refreshSources).toHaveBeenCalledTimes(1);
    refreshGate.resolve();
    await Promise.all([firstShow, secondShow]);

    expect(taskAggregator.refreshSources).toHaveBeenCalledTimes(1);
    expect(scanner.scan).toHaveBeenCalledTimes(1);
    expect(statusReader.read).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('forwards skill context when executing a dashboard skill command', async () => {
    const postMessage = vi.fn(async () => true);
    const panel = createPanel(postMessage);
    vscodeWindowState.createWebviewPanel.mockReturnValue(panel);

    const provider = new DashboardProvider(createContext(), {
      scanner: createScanner(),
      statusReader: createStatusReader(),
      skillReader: createSkillReader(),
      taskAggregator: createTaskAggregator(),
      creativeEntityAggregator: createCreativeEntityAggregator(),
      activityStore: createActivityStore(),
    });
    await provider.show();

    const receiveMessage = getRegisteredMessageListener(panel);

    const handler = vi.fn(async () => undefined);
    vscodeCommandState.commandHandlers.set('neko.agent.invokeSkill', handler);

    await receiveMessage?.({
      type: 'executeCommand',
      command: 'neko.agent.invokeSkill',
      intent: 'Generate a clip',
      skill: {
        id: 'ai-generate',
        extensionId: 'neko.neko-agent',
        name: 'AI Generate',
        description: 'Generate media',
        locale: 'en',
      },
    });

    expect(handler).toHaveBeenCalledWith({
      intent: 'Generate a clip',
      skill: {
        id: 'ai-generate',
        extensionId: 'neko.neko-agent',
        name: 'AI Generate',
        description: 'Generate media',
        locale: 'en',
      },
    });
    provider.dispose();
  });

  it('refreshes entity state and delegates entity messages', async () => {
    const postMessage = vi.fn(async () => true);
    const panel = createPanel(postMessage);
    vscodeWindowState.createWebviewPanel.mockReturnValue(panel);
    const creativeEntityAggregator = createCreativeEntityAggregator({
      state: { statuses: [], rows: [entityRow] },
      detail: entityDetail,
      actionResult: { ok: true, refresh: true, ref: entityRef },
    });

    const provider = new DashboardProvider(createContext(), {
      scanner: createScanner(),
      statusReader: createStatusReader(),
      skillReader: createSkillReader(),
      taskAggregator: createTaskAggregator(),
      creativeEntityAggregator,
      activityStore: createActivityStore(),
    });
    await provider.show();

    const receiveMessage = getRegisteredMessageListener(panel);
    await receiveMessage?.({ type: 'selectCreativeEntity', ref: entityRef });
    await receiveMessage?.({
      type: 'creativeEntityAction',
      request: { source: 'neko-story', ref: entityRef, action: 'bind-existing', role: 'portrait' },
    });
    await receiveMessage?.({ type: 'refreshCreativeEntities' });

    expect(creativeEntityAggregator.getDetail).toHaveBeenCalledWith(entityRef);
    expect(creativeEntityAggregator.executeAction).toHaveBeenCalledWith({
      source: 'neko-story',
      ref: entityRef,
      action: 'bind-existing',
      role: 'portrait',
    });
    expect(creativeEntityAggregator.refreshSources).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'creativeEntityActionResult',
      result: { ok: true, refresh: true, ref: entityRef },
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'creativeEntitiesChanged',
      state: { statuses: [], rows: [entityRow] },
    });
    provider.dispose();
  });

  it('exposes aggregated creative entity state for agent search', async () => {
    const creativeEntityAggregator = createCreativeEntityAggregator({
      state: { statuses: [], rows: [entityRow] },
    });
    const provider = new DashboardProvider(createContext(), {
      scanner: createScanner(),
      statusReader: createStatusReader(),
      skillReader: createSkillReader(),
      taskAggregator: createTaskAggregator(),
      creativeEntityAggregator,
      activityStore: createActivityStore(),
    });

    const state = await vscodeCommandState.commandHandlers.get(
      DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND,
    )?.({ projectRoot: '/workspace/neko-test' });

    expect(creativeEntityAggregator.refreshSources).toHaveBeenCalledWith({
      projectRoot: '/workspace/neko-test',
    });
    expect(state).toEqual({ statuses: [], rows: [entityRow] });
    provider.dispose();
  });
});

function createTaskAggregator(
  overrides: {
    readonly refreshSources?: ReturnType<typeof vi.fn>;
  } = {},
): TaskAggregator {
  return {
    refreshSources: overrides.refreshSources ?? vi.fn(async () => {}),
    getSnapshot: vi.fn((): DashboardTask[] => []),
    getTask: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    onDidChangeTask: vi.fn(() => ({ dispose() {} })),
    dispose: vi.fn(),
  } as unknown as TaskAggregator;
}

const entityRef: DashboardCreativeEntityRef = {
  source: 'neko-story',
  sourceEntityId: 'entity:char_xiaoju',
  entityId: 'char_xiaoju',
  entityKind: 'character',
  workspaceFolder: 'neko-test',
};

const entityRow: DashboardCreativeEntityRow = {
  ref: entityRef,
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  freshness: 'fresh',
  actions: [{ id: 'show-detail', label: 'Show detail' }],
  searchText: '小橘',
};

const entityDetail: DashboardCreativeEntityDetail = {
  ref: entityRef,
  label: '小橘',
  kind: 'character',
  status: 'confirmed',
  sourceKind: 'registry',
  aliases: [],
  relationships: [],
  occurrences: [],
  bindings: [],
  defaults: [],
  requirements: [],
  visualDrafts: [],
  syncSuggestions: [],
  freshness: 'fresh',
  actions: [{ id: 'refresh', label: 'Refresh' }],
};

function createCreativeEntityAggregator(
  overrides: {
    readonly state?: ReturnType<CreativeEntitySourceAggregator['getState']>;
    readonly detail?: DashboardCreativeEntityDetail;
    readonly actionResult?: Awaited<ReturnType<CreativeEntitySourceAggregator['executeAction']>>;
  } = {},
): CreativeEntitySourceAggregator {
  return {
    refreshSources: vi.fn(async () => {}),
    getState: vi.fn(() => overrides.state ?? { statuses: [], rows: [] }),
    getDetail: vi.fn(async () => overrides.detail),
    executeAction: vi.fn(async () => overrides.actionResult ?? { ok: true }),
    onDidChangeEntity: vi.fn((_listener: (event: DashboardCreativeEntityEvent) => void) => ({
      dispose() {},
    })),
    dispose: vi.fn(),
  } as unknown as CreativeEntitySourceAggregator;
}

function createScanner(): ProjectScanner {
  return {
    scan: vi.fn(async () => []),
    hasWorkspaceEvidence: vi.fn(async () => false),
  } as unknown as ProjectScanner;
}

function createStatusReader(): StatusReader {
  return {
    read: vi.fn(async () => ({})),
    readWorkflows: vi.fn(async () => []),
  } as unknown as StatusReader;
}

function createSkillReader(): SkillReader {
  return {
    read: vi.fn(async () => []),
  } as unknown as SkillReader;
}

function createActivityStore(): ActivityStore {
  return {
    append: vi.fn(async () => {}),
    list: vi.fn(async () => []),
  } as unknown as ActivityStore;
}

function createPanel(postMessage: ReturnType<typeof vi.fn>) {
  const onDidReceiveMessage = vi.fn<WebviewMessageRegistration>(() => ({ dispose() {} }));

  return {
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn(() => ({ dispose() {} })),
    webview: {
      html: '',
      cspSource: 'vscode-resource:',
      asWebviewUri: vi.fn((uri: unknown) => uri),
      postMessage,
      onDidReceiveMessage,
    },
  };
}

function getRegisteredMessageListener(
  panel: ReturnType<typeof createPanel>,
): DashboardMessageListener {
  const [call] = panel.webview.onDidReceiveMessage.mock.calls;
  const [listener] = call ?? [];
  if (!listener) {
    throw new Error('Expected dashboard message listener to be registered');
  }
  return listener;
}

function createContext() {
  return {
    extensionUri: { fsPath: '/extension' },
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
