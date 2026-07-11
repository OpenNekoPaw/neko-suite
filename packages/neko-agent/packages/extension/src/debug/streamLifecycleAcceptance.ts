import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import type { AgentEvent } from '@neko/agent';
import type {
  AgentTurnTimelineDiagnostic,
  AgentTurnTimelineMessage,
  AgentTurnTimelineSnapshotRequest,
} from '@neko-agent/types';
import { getLogger } from '../base';
import type { AgentTurnTimelineSnapshotRouter } from '../chat/message/agentTurnTimelineSnapshotRouter';
import {
  AgentStreamProcessor,
  type StreamProcessingResult,
} from '../chat/message/agentStreamProcessor';
import type { AgentTimelineDeliveryMetrics } from '../chat/message/agentTimelineDeliveryScheduler';

export const STREAM_LIFECYCLE_ACCEPTANCE_COMMAND = 'neko.agent.debug.startStreamLifecycleReplay';
export const STREAM_LIFECYCLE_ACCEPTANCE_CONTINUE_COMMAND =
  'neko.agent.debug.continueStreamLifecycleReplay';
export const STREAM_LIFECYCLE_ACCEPTANCE_CONTEXT_KEY =
  'neko.agent.streamLifecycleAcceptanceEnabled';
export const STREAM_LIFECYCLE_ACCEPTANCE_SOURCE_LENGTH = 5_057;
export const STREAM_LIFECYCLE_ACCEPTANCE_CHUNK_COUNT = 4_000;
const STREAM_LIFECYCLE_ACCEPTANCE_PAUSE_AFTER_CHUNKS = 2_000;

const logger = getLogger('StreamLifecycleAcceptance');

export interface StreamLifecycleAcceptanceIdentity {
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
}

export interface StreamLifecycleAcceptanceReport extends StreamLifecycleAcceptanceIdentity {
  readonly state: 'completed' | 'failed';
  readonly sourceLength: number;
  readonly sourceSha256: string;
  readonly providerChunks: number;
  readonly persistenceWrites: 0;
  readonly timelineMetrics: AgentTimelineDeliveryMetrics | null;
  readonly terminalStatus?: StreamProcessingResult['terminalStatus'];
  readonly terminalDeliveryStatus?: StreamProcessingResult['lifecycle']['terminalDelivery']['status'];
  readonly activeTurnResynchronizationStatus?: StreamProcessingResult['lifecycle']['activeTurnResynchronization']['status'];
  readonly error?: string;
}

interface StreamLifecycleAcceptanceProcessor {
  processStream(
    webview: vscode.Webview,
    conversationId: string,
    events: AsyncIterable<AgentEvent>,
    callbacks: { readonly messageId: string; readonly onPhaseChange: () => void },
  ): Promise<StreamProcessingResult>;
  requestTimelineSnapshot(
    webview: vscode.Webview,
    request: AgentTurnTimelineSnapshotRequest,
  ): Promise<AgentTurnTimelineMessage | AgentTurnTimelineDiagnostic>;
  getTimelineDeliveryMetrics(
    identity: StreamLifecycleAcceptanceIdentity,
  ): AgentTimelineDeliveryMetrics | undefined;
  dispose(): void;
}

export interface StreamLifecycleAcceptanceControllerOptions {
  readonly createProcessor?: () => StreamLifecycleAcceptanceProcessor;
  readonly createRunId?: () => string;
}

interface ActiveAcceptanceRun {
  readonly identity: StreamLifecycleAcceptanceIdentity;
  readonly processor: StreamLifecycleAcceptanceProcessor;
  readonly continuation: Deferred<void>;
  readonly paused: Deferred<void>;
  completion: Promise<StreamLifecycleAcceptanceReport>;
  phase: 'running' | 'paused' | 'completed' | 'failed';
  providerChunks: number;
  stopRequested: boolean;
}

/**
 * Development-only controller that drives the canonical Extension -> Webview
 * stream boundary. It owns no conversation persistence and never registers an
 * Agent capability, so acceptance traffic cannot mutate user conversation data.
 */
export class StreamLifecycleAcceptanceController
  implements AgentTurnTimelineSnapshotRouter, vscode.Disposable
{
  private readonly createProcessor: () => StreamLifecycleAcceptanceProcessor;
  private readonly createRunId: () => string;
  private activeRun: ActiveAcceptanceRun | undefined;
  private disposed = false;

  constructor(options: StreamLifecycleAcceptanceControllerOptions = {}) {
    this.createProcessor = options.createProcessor ?? (() => new AgentStreamProcessor({}));
    this.createRunId = options.createRunId ?? (() => Date.now().toString(36));
  }

  start(webview: vscode.Webview, conversationId: string): StreamLifecycleAcceptanceIdentity {
    if (this.disposed) {
      throw new Error('Stream lifecycle acceptance controller is disposed.');
    }
    if (this.activeRun?.phase === 'running' || this.activeRun?.phase === 'paused') {
      throw new Error('A stream lifecycle acceptance replay is already active.');
    }

    this.activeRun?.processor.dispose();
    const runId = this.createRunId();
    const messageId = `stream-lifecycle-acceptance-${runId}`;
    const identity: StreamLifecycleAcceptanceIdentity = {
      conversationId,
      turnId: `turn-${messageId}`,
      messageId,
    };
    const run: ActiveAcceptanceRun = {
      identity,
      processor: this.createProcessor(),
      continuation: createDeferred<void>(),
      paused: createDeferred<void>(),
      completion: Promise.resolve(undefined as never),
      phase: 'running',
      providerChunks: 0,
      stopRequested: false,
    };
    run.completion = this.executeRun(webview, run);
    this.activeRun = run;
    return identity;
  }

  async continue(): Promise<void> {
    const run = this.requireActiveRun();
    await run.paused.promise;
    if (run.phase !== 'paused') {
      throw new Error(`Cannot continue a replay in phase ${run.phase}.`);
    }
    run.phase = 'running';
    run.continuation.resolve();
  }

  async waitUntilPaused(): Promise<StreamLifecycleAcceptanceIdentity> {
    const run = this.requireActiveRun();
    await run.paused.promise;
    return run.identity;
  }

  async waitForCompletion(): Promise<StreamLifecycleAcceptanceReport> {
    return this.requireActiveRun().completion;
  }

  owns(request: AgentTurnTimelineSnapshotRequest): boolean {
    const identity = this.activeRun?.identity;
    return Boolean(
      identity &&
      request.conversationId === identity.conversationId &&
      request.turnId === identity.turnId &&
      request.messageId === identity.messageId,
    );
  }

  async requestSnapshot(
    webview: vscode.Webview,
    request: AgentTurnTimelineSnapshotRequest,
  ): Promise<void> {
    const run = this.requireOwnedRun(request);
    const message = await run.processor.requestTimelineSnapshot(webview, request);
    await webview.postMessage(message);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const run = this.activeRun;
    if (!run) return;
    run.stopRequested = true;
    run.continuation.resolve();
    if (run.phase === 'completed' || run.phase === 'failed') {
      run.processor.dispose();
      return;
    }
    void run.completion.finally(() => run.processor.dispose());
  }

  private async executeRun(
    webview: vscode.Webview,
    run: ActiveAcceptanceRun,
  ): Promise<StreamLifecycleAcceptanceReport> {
    const fixture = createStreamLifecycleAcceptanceFixture();
    try {
      const result = await run.processor.processStream(
        webview,
        run.identity.conversationId,
        this.replayEvents(fixture.chunks, run),
        { messageId: run.identity.messageId, onPhaseChange: () => undefined },
      );
      if (!run.stopRequested && result.accumulatedResponse !== fixture.source) {
        throw new Error(
          `Acceptance replay source mismatch: expected ${fixture.source.length} characters, received ${result.accumulatedResponse.length}.`,
        );
      }
      run.phase = 'completed';
      const report: StreamLifecycleAcceptanceReport = {
        ...run.identity,
        state: 'completed',
        sourceLength: fixture.source.length,
        sourceSha256: sha256(fixture.source),
        providerChunks: run.providerChunks,
        persistenceWrites: 0,
        timelineMetrics: run.processor.getTimelineDeliveryMetrics(run.identity) ?? null,
        terminalStatus: result.terminalStatus,
        terminalDeliveryStatus: result.lifecycle.terminalDelivery.status,
        activeTurnResynchronizationStatus: result.lifecycle.activeTurnResynchronization.status,
      };
      logger.info('Development stream lifecycle replay completed', report);
      return report;
    } catch (error) {
      run.phase = 'failed';
      const report: StreamLifecycleAcceptanceReport = {
        ...run.identity,
        state: 'failed',
        sourceLength: fixture.source.length,
        sourceSha256: sha256(fixture.source),
        providerChunks: run.providerChunks,
        persistenceWrites: 0,
        timelineMetrics: run.processor.getTimelineDeliveryMetrics(run.identity) ?? null,
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error('Development stream lifecycle replay failed', report);
      return report;
    }
  }

  private async *replayEvents(
    chunks: readonly string[],
    run: ActiveAcceptanceRun,
  ): AsyncIterable<AgentEvent> {
    for (const content of chunks) {
      if (run.stopRequested) break;
      run.providerChunks += 1;
      yield { type: 'text_delta', content };
      if (run.providerChunks === STREAM_LIFECYCLE_ACCEPTANCE_PAUSE_AFTER_CHUNKS) {
        run.phase = 'paused';
        run.paused.resolve();
        logger.info('Development stream lifecycle replay paused for Webview reload', {
          ...run.identity,
          providerChunks: run.providerChunks,
        });
        await run.continuation.promise;
      }
    }
    yield { type: 'done' };
  }

  private requireActiveRun(): ActiveAcceptanceRun {
    if (!this.activeRun) {
      throw new Error('No stream lifecycle acceptance replay has been started.');
    }
    return this.activeRun;
  }

  private requireOwnedRun(request: AgentTurnTimelineSnapshotRequest): ActiveAcceptanceRun {
    const run = this.requireActiveRun();
    if (!this.owns(request)) {
      throw new Error('Snapshot request is not owned by the active acceptance replay.');
    }
    return run;
  }
}

export interface StreamLifecycleAcceptanceChatView {
  readonly webview: vscode.Webview | undefined;
  getSelectedAgentConversationId(): string | null;
}

export async function registerStreamLifecycleAcceptanceCommands(input: {
  readonly context: vscode.ExtensionContext;
  readonly chatViewProvider: StreamLifecycleAcceptanceChatView;
  readonly controller: StreamLifecycleAcceptanceController;
}): Promise<void> {
  if (input.context.extensionMode !== vscode.ExtensionMode.Development) return;

  await vscode.commands.executeCommand('setContext', STREAM_LIFECYCLE_ACCEPTANCE_CONTEXT_KEY, true);
  input.context.subscriptions.push(
    input.controller,
    vscode.commands.registerCommand(STREAM_LIFECYCLE_ACCEPTANCE_COMMAND, () => {
      const webview = input.chatViewProvider.webview;
      const conversationId = input.chatViewProvider.getSelectedAgentConversationId();
      if (!webview || !conversationId) {
        throw new Error(
          'Open the Neko Agent Webview and select a conversation before starting the replay.',
        );
      }
      const identity = input.controller.start(webview, conversationId);
      logger.info('Development stream lifecycle replay started', identity);
      return identity;
    }),
    vscode.commands.registerCommand(STREAM_LIFECYCLE_ACCEPTANCE_CONTINUE_COMMAND, async () => {
      await input.controller.continue();
      const report = await input.controller.waitForCompletion();
      if (report.state === 'failed') {
        throw new Error(report.error ?? 'Stream lifecycle acceptance replay failed.');
      }
      void vscode.window.showInformationMessage(
        `Neko Agent stream replay completed: ${report.providerChunks} chunks, ${report.timelineMetrics?.deliveredBatches ?? 0} Timeline batches.`,
      );
      return report;
    }),
  );
}

export function createStreamLifecycleAcceptanceFixture(): {
  readonly source: string;
  readonly chunks: readonly string[];
} {
  const source = buildTableHeavySource(STREAM_LIFECYCLE_ACCEPTANCE_SOURCE_LENGTH);
  const chunks = splitIntoDeterministicChunks(source, STREAM_LIFECYCLE_ACCEPTANCE_CHUNK_COUNT);
  return { source, chunks };
}

function buildTableHeavySource(targetLength: number): string {
  const header = [
    '# 动画化企划回归样本',
    '',
    '## 镜头规划',
    '',
    '| 镜号 | 时长 | 景别 | 画面 | 动作 | 声音 |',
    '| --- | ---: | --- | --- | --- | --- |',
  ].join('\n');
  const rows: string[] = [];
  let rowIndex = 1;

  while (true) {
    const row = `| ${rowIndex} | ${2 + (rowIndex % 5)}s | ${rowIndex % 2 === 0 ? '中景' : '特写'} | 场景层次与光影变化 ${rowIndex} | 角色动作节拍 ${rowIndex} | 环境声与配乐提示 ${rowIndex} |`;
    const candidate = `${header}\n${rows.concat(row).join('\n')}\n`;
    if (candidate.length > targetLength - 64) break;
    rows.push(row);
    rowIndex += 1;
  }

  const body = `${header}\n${rows.join('\n')}\n\n## 制作备注\n\n`;
  const remaining = targetLength - body.length;
  if (remaining < 0) {
    throw new Error(
      `Table-heavy acceptance fixture exceeded target length by ${Math.abs(remaining)} characters.`,
    );
  }
  return `${body}${'节奏与连续性检查。'.repeat(Math.ceil(remaining / 9)).slice(0, remaining)}`;
}

function splitIntoDeterministicChunks(source: string, chunkCount: number): readonly string[] {
  if (chunkCount <= 0 || chunkCount > source.length) {
    throw new Error(`Invalid chunk count ${chunkCount} for source length ${source.length}.`);
  }
  const chunks: string[] = [];
  for (let index = 0; index < chunkCount - 1; index += 1) {
    chunks.push(source.slice(index, index + 1));
  }
  chunks.push(source.slice(chunkCount - 1));
  return chunks;
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((outerResolve) => {
    resolve = outerResolve;
  });
  return {
    promise,
    resolve(value) {
      resolve(value as T | PromiseLike<T>);
    },
  };
}
