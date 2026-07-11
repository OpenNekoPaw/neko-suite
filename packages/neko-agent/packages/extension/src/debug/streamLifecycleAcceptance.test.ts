import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@neko/agent';
import type { AgentTurnTimelineSnapshotRequest } from '@neko-agent/types';
import { createTableHeavyStreamFixture } from '../../../../test-utils/src/fixtures/table-heavy-stream';
import {
  createStreamLifecycleAcceptanceFixture,
  registerStreamLifecycleAcceptanceCommands,
  STREAM_LIFECYCLE_ACCEPTANCE_CHUNK_COUNT,
  STREAM_LIFECYCLE_ACCEPTANCE_COMMAND,
  STREAM_LIFECYCLE_ACCEPTANCE_CONTINUE_COMMAND,
  STREAM_LIFECYCLE_ACCEPTANCE_CONTEXT_KEY,
  StreamLifecycleAcceptanceController,
} from './streamLifecycleAcceptance';

const { executeCommand, registerCommand, showInformationMessage } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  registerCommand: vi.fn(),
  showInformationMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  commands: { executeCommand, registerCommand },
  window: { showInformationMessage },
}));

vi.mock('../base', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../chat/message/agentStreamProcessor', () => ({
  AgentStreamProcessor: class {},
}));

describe('StreamLifecycleAcceptanceController', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    executeCommand.mockResolvedValue(undefined);
    registerCommand.mockReset();
    registerCommand.mockImplementation((_command: string, callback: () => unknown) => ({
      callback,
      dispose: vi.fn(),
    }));
    showInformationMessage.mockReset();
  });

  it('keeps the Development Host fixture identical to the deterministic regression fixture', () => {
    const acceptance = createStreamLifecycleAcceptanceFixture();
    const regression = createTableHeavyStreamFixture();

    expect(acceptance.source).toBe(regression.source);
    expect(acceptance.chunks).toEqual(regression.chunks);
    expect(acceptance.chunks).toHaveLength(STREAM_LIFECYCLE_ACCEPTANCE_CHUNK_COUNT);
  });

  it('pauses an isolated 4,000-chunk replay, routes owned snapshots, then completes', async () => {
    const posted: unknown[] = [];
    const webview = {
      postMessage: vi.fn(async (message: unknown) => {
        posted.push(message);
        return true;
      }),
    };
    let accumulated = '';
    const processor = {
      async processStream(
        _webview: unknown,
        _conversationId: string,
        events: AsyncIterable<AgentEvent>,
      ) {
        for await (const event of events) {
          if (event.type === 'text_delta') accumulated += event.content ?? '';
        }
        return { ...completedResult(), accumulatedResponse: accumulated };
      },
      async requestTimelineSnapshot(_webview: unknown, request: AgentTurnTimelineSnapshotRequest) {
        return {
          type: 'agentTurnTimelineDiagnostic' as const,
          schemaVersion: 2 as const,
          connectionEpoch: request.connectionEpoch,
          conversationId: request.conversationId,
          turnId: request.turnId,
          messageId: request.messageId,
          code: 'turn-snapshot-unavailable' as const,
          message: 'fake snapshot response',
        };
      },
      getTimelineDeliveryMetrics: () => deliveryMetrics(),
      dispose: vi.fn(),
    };
    const controller = new StreamLifecycleAcceptanceController({
      createProcessor: () => processor,
      createRunId: () => 'fixed',
    });

    const identity = controller.start(webview as never, 'conversation-1');
    await controller.waitUntilPaused();

    const request = {
      type: 'requestAgentTurnTimelineSnapshot',
      schemaVersion: 2,
      connectionEpoch: 'acceptance-epoch',
      ...identity,
      reason: 'webview-reload',
      lastAppliedDeliveryRevision: 1,
    } as const;
    expect(controller.owns(request)).toBe(true);
    expect(controller.owns({ ...request, messageId: 'unrelated-message' })).toBe(false);

    await controller.requestSnapshot(webview as never, request);
    expect(posted).toHaveLength(1);

    await controller.continue();
    const report = await controller.waitForCompletion();
    const fixture = createStreamLifecycleAcceptanceFixture();

    expect(accumulated).toBe(fixture.source);
    expect(report).toMatchObject({
      state: 'completed',
      providerChunks: 4_000,
      persistenceWrites: 0,
      terminalStatus: 'completed',
      terminalDeliveryStatus: 'delivered',
      activeTurnResynchronizationStatus: 'available',
    });
    expect(report.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('registers commands only in the Extension Development Host', async () => {
    const controller = new StreamLifecycleAcceptanceController({
      createProcessor: () => fakeProcessor(),
    });
    const chatViewProvider = {
      webview: { postMessage: vi.fn() },
      getSelectedAgentConversationId: () => 'conversation-1',
    };
    const productionContext = { extensionMode: 1, subscriptions: [] };

    await registerStreamLifecycleAcceptanceCommands({
      context: productionContext as never,
      chatViewProvider: chatViewProvider as never,
      controller,
    });
    expect(registerCommand).not.toHaveBeenCalled();

    const developmentContext = { extensionMode: 2, subscriptions: [] };
    await registerStreamLifecycleAcceptanceCommands({
      context: developmentContext as never,
      chatViewProvider: chatViewProvider as never,
      controller,
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'setContext',
      STREAM_LIFECYCLE_ACCEPTANCE_CONTEXT_KEY,
      true,
    );
    expect(registerCommand).toHaveBeenCalledTimes(2);
    expect(registerCommand.mock.calls.map(([command]) => command)).toEqual([
      STREAM_LIFECYCLE_ACCEPTANCE_COMMAND,
      STREAM_LIFECYCLE_ACCEPTANCE_CONTINUE_COMMAND,
    ]);
    expect(developmentContext.subscriptions).toHaveLength(3);
  });
});

function completedResult() {
  return {
    accumulatedResponse: '',
    accumulatedThinking: '',
    hasError: false,
    terminalStatus: 'completed' as const,
    collectedToolCalls: [],
    contentBlocks: [],
    lifecycle: {
      terminalDelivery: {
        status: 'delivered' as const,
        deliveryRevision: 3,
        finalBlocksDelivered: true as const,
      },
      activeTurnResynchronization: {
        status: 'available' as const,
        deliveryRevision: 3,
      },
    },
  };
}

function deliveryMetrics() {
  return {
    inputBatches: 4_001,
    inputOperations: 4_001,
    deliveredBatches: 4,
    deliveredOperations: 6,
    deliveredBytes: 6_000,
    pendingBytesHighWaterMark: 2_000,
    pendingOperationsHighWaterMark: 2_000,
    flushCount: 4,
    maximumFlushLatencyMs: 32,
    failedDeliveries: 0,
    pendingOperations: 0,
    pendingTextBytes: 0,
    timerScheduled: false,
    accepting: false,
    disposed: false,
  };
}

function fakeProcessor() {
  return {
    processStream: vi.fn(async () => completedResult()),
    requestTimelineSnapshot: vi.fn(),
    getTimelineDeliveryMetrics: vi.fn(() => deliveryMetrics()),
    dispose: vi.fn(),
  };
}
