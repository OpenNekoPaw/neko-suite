import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../packages/agent/src/session/types';
import type { AgentTurnTimelineMessage } from '../../packages/agent-types/src/agent-turn-timeline';
import { ConversationPersistenceCoordinator } from '../../packages/agent/src/session/conversation-persistence-coordinator';
import type { ConversationRecord } from '../../packages/agent/src/session/conversation-record';
import { AgentStreamProcessor } from '../../packages/extension/src/chat/message/agentStreamProcessor';
import { createTimelineRenderCommitScheduler } from '../../packages/webview/src/handlers/timeline-render-commit-scheduler';
import {
  createAgentMarkdownSessionKey,
  createAgentMarkdownSessionRegistry,
} from '../../packages/webview/src/markdown/agent-markdown-session-registry';
import { createAgentPoisonPaths } from './poison-paths';
import { createTableHeavyStreamFixture } from './fixtures/table-heavy-stream';
import { createAgentStreamReplayHarness } from './stream-replay-harness';

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  window: { showInformationMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../packages/extension/src/base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Agent stream lifecycle performance regression', () => {
  it('keeps the 4,000-chunk Extension/Webview/persistence path linear and bounded', async () => {
    const fixture = createTableHeavyStreamFixture();
    const poisonPaths = createAgentPoisonPaths();
    const frame = createFrameHarness();
    const markdownSessions = createAgentMarkdownSessionRegistry();
    const renderScheduler = createTimelineRenderCommitScheduler(frame.port);
    const firstWriteGate = createDeferred<void>();
    let firstWrite = true;

    const replay = createAgentStreamReplayHarness({
      counters: fixture.counters,
      onPostMessage(message): void {
        if (message.type !== 'agentTurnTimeline') return;
        renderScheduler.enqueue(message as AgentTurnTimelineMessage, (deliveries) => {
          markdownSessions.applyTimelineDeliveries(deliveries);
          replay.recordWebviewCommit(markdownSessions.metrics().renderRevisions);
        });
      },
    });

    const persistence = new ConversationPersistenceCoordinator({
      storage: {
        async save(): Promise<void> {
          replay.recordPersistenceStart();
          try {
            if (firstWrite) {
              firstWrite = false;
              await firstWriteGate.promise;
            }
          } finally {
            replay.recordPersistenceComplete();
          }
        },
        async delete(): Promise<void> {},
      },
      onDiagnostic(diagnostic): void {
        if (diagnostic.code === 'external-conflict') replay.recordStaleWriteDiagnostic();
      },
    });

    let partialRevision = 0;
    const conversations = {
      upsertMessageToConversation(): void {
        partialRevision += 1;
        persistence.enqueuePartial(conversationRecord(partialRevision));
      },
    };
    const processor = new AgentStreamProcessor({
      conversations: conversations as never,
      createTimelineConnectionEpoch: () => 'regression-epoch',
    });

    const result = await processor.processStream(
      replay.webview as never,
      'conv-regression',
      replayEvents(fixture.chunks, replay.recordProviderChunk),
      { messageId: 'message-regression', onPhaseChange: vi.fn() },
    );
    const terminal = persistence.enqueueTerminal(conversationRecord(partialRevision + 1));
    firstWriteGate.resolve();
    await terminal.completion;
    await persistence.flush();
    renderScheduler.flushAll();

    const timelineMetrics = processor.getTimelineDeliveryMetrics({
      conversationId: 'conv-regression',
      turnId: 'turn-message-regression',
      messageId: 'message-regression',
    });
    const persistenceMetrics = persistence.metrics();
    const report = replay.report();
    const sourceBytes = new TextEncoder().encode(fixture.source).byteLength;
    const snapshot = markdownSessions.getSnapshot(
      createAgentMarkdownSessionKey({
        conversationId: 'conv-regression',
        messageId: 'message-regression',
        itemId: 'text-1',
      }),
    );

    expect(result.accumulatedResponse).toBe(fixture.source);
    expect(snapshot?.source).toBe(fixture.source);
    expect(report.counters.providerChunks).toBe(fixture.chunks.length);
    expect(timelineMetrics).toBeDefined();
    expect(timelineMetrics?.inputOperations).toBeLessThanOrEqual(fixture.chunks.length + 2);
    expect(timelineMetrics?.deliveredBatches).toBeLessThan(16);
    expect(report.counters.timelineMessages).toBe(timelineMetrics?.deliveredBatches);
    expect(report.counters.timelinePayloadBytes).toBeLessThan(sourceBytes * 8);
    expect(report.counters.webviewCommits).toBeLessThan(8);
    expect(report.counters.webviewRenderRevisions).toBeLessThan(8);
    expect(persistenceMetrics.enqueuedPartials).toBeGreaterThan(0);
    expect(persistenceMetrics.enqueuedPartials).toBeLessThan(8);
    expect(persistenceMetrics.maximumActiveMutations).toBe(1);
    expect(report.counters.persistenceMaxConcurrent).toBe(1);
    expect(report.counters.persistenceConcurrent).toBe(0);
    expect(report.counters.staleWriteDiagnostics).toBe(0);
    expect(result.terminalStatus).toBe('completed');
    expect(result.lifecycle.terminalDelivery.status).toBe('delivered');
    expect(frame.pending()).toBe(0);

    poisonPaths.cumulativeTimelineSnapshotPerDelta.assertNotHit();
    poisonPaths.timelineStringPrefixMerge.assertNotHit();
    poisonPaths.perChunkCompactionCheck.assertNotHit();
    poisonPaths.directLegacyMarkdownParse.assertNotHit();
    poisonPaths.concurrentConversationStorageWrite.assertNotHit();

    renderScheduler.dispose();
    markdownSessions.disposeAll();
    await persistence.dispose();
    processor.dispose();
  });
});

async function* replayEvents(
  chunks: readonly string[],
  onChunk: () => void,
): AsyncIterable<AgentEvent> {
  for (const content of chunks) {
    onChunk();
    yield { type: 'text_delta', content };
  }
  yield { type: 'done' };
}

function conversationRecord(revision: number): ConversationRecord {
  return {
    id: 'conv-regression',
    version: 2,
    title: 'Regression replay',
    workDir: '/workspace',
    messages: [],
    createdAt: 1,
    updatedAt: revision,
    source: 'extension',
  };
}

function createFrameHarness(): {
  readonly port: {
    request(callback: () => void): number;
    cancel(handle: number): void;
  };
  pending(): number;
} {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  return {
    port: {
      request(callback): number {
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
      cancel(handle): void {
        callbacks.delete(handle);
      },
    },
    pending(): number {
      return callbacks.size;
    },
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((outerResolve) => {
    resolve = outerResolve;
  });
  return { promise, resolve };
}
