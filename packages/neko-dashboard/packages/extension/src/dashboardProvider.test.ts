import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { DashboardTask } from '@neko/shared/types/dashboard-task';
import { vscodeCommandState, vscodeWindowState } from './vscode-test-double';
import type { ActivityStore } from './activityStore';
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
