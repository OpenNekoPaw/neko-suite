import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collectRunReport, createReportCollector } from '../run-report-collector';
import type { PipelineEvent, PipelineContext } from '../types';

// =============================================================================
// Helpers
// =============================================================================

async function* eventStream(events: PipelineEvent[]): AsyncIterable<PipelineEvent> {
  for (const e of events) {
    yield e;
  }
}

// =============================================================================
// collectRunReport (from event stream)
// =============================================================================

describe('collectRunReport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should produce a completed report for a successful 2-stage pipeline', async () => {
    vi.setSystemTime(new Date('2026-03-26T10:00:00Z'));

    const ctx: PipelineContext = {
      scenes: [
        {
          index: 0,
          heading: 'S1',
          description: '',
          dialogue: [],
          estimatedDuration: 5,
          suggestedPrompt: 'p1',
        },
      ],
      generatedPaths: ['/out/0.mp4'],
    };

    const events: PipelineEvent[] = [
      { type: 'pipeline_start', flowId: 'flowF', stages: ['readDocument', 'batchGenerate'] },
      { type: 'stage_start', stage: 'readDocument', index: 0, total: 2 },
      { type: 'stage_complete', stage: 'readDocument' },
      { type: 'stage_start', stage: 'batchGenerate', index: 1, total: 2 },
      { type: 'stage_complete', stage: 'batchGenerate' },
      { type: 'pipeline_complete', result: ctx },
    ];

    const report = await collectRunReport(eventStream(events), 'pipe-1', 'flowF');

    expect(report.id).toBe('pipe-1');
    expect(report.flowId).toBe('flowF');
    expect(report.status).toBe('completed');
    expect(report.stages).toHaveLength(2);
    expect(report.stages[0]?.status).toBe('success');
    expect(report.stages[1]?.status).toBe('success');
    expect(report.failedStageIndex).toBeUndefined();
    expect(report.sceneSummary).toEqual({
      total: 1,
      generated: 1,
      failed: 0,
      failedIndices: [],
    });
    expect(report.finalContext).toBe(ctx);
  });

  it('should produce a failed report when a stage errors', async () => {
    vi.setSystemTime(new Date('2026-03-26T10:00:00Z'));

    const events: PipelineEvent[] = [
      { type: 'pipeline_start', flowId: 'flowA', stages: ['readDocument', 'batchGenerate'] },
      { type: 'stage_start', stage: 'readDocument', index: 0, total: 2 },
      { type: 'pipeline_error', error: 'File not found', stage: 'readDocument' },
    ];

    const report = await collectRunReport(eventStream(events), 'pipe-2', 'flowA');

    expect(report.status).toBe('failed');
    expect(report.stages).toHaveLength(1);
    expect(report.stages[0]?.status).toBe('failed');
    expect(report.stages[0]?.error).toBe('File not found');
    expect(report.failedStageIndex).toBe(0);
    expect(report.sceneSummary).toBeUndefined();
  });

  it('should record skipped stages', async () => {
    const events: PipelineEvent[] = [
      { type: 'pipeline_start', flowId: 'flowC', stages: ['readDocument', 'parseStoryboard'] },
      { type: 'stage_skipped', stage: 'readDocument', reason: 'skipStages config' },
      { type: 'stage_start', stage: 'parseStoryboard', index: 1, total: 2 },
      { type: 'stage_complete', stage: 'parseStoryboard' },
      { type: 'pipeline_complete', result: {} },
    ];

    const report = await collectRunReport(eventStream(events), 'pipe-3', 'flowC');

    expect(report.status).toBe('completed');
    expect(report.stages).toHaveLength(2);
    expect(report.stages[0]?.status).toBe('skipped');
    expect(report.stages[0]?.skipReason).toBe('skipStages config');
    expect(report.stages[0]?.durationMs).toBe(0);
    expect(report.stages[1]?.status).toBe('success');
  });

  it('should handle gate cancellation', async () => {
    const events: PipelineEvent[] = [
      { type: 'pipeline_start', flowId: 'flowF', stages: ['parseStoryboard'] },
      { type: 'stage_start', stage: 'parseStoryboard', index: 0, total: 1 },
      { type: 'gate_cancelled', stage: 'parseStoryboard' },
    ];

    const report = await collectRunReport(eventStream(events), 'pipe-4', 'flowF');

    expect(report.status).toBe('cancelled');
    expect(report.stages).toHaveLength(1);
    expect(report.stages[0]?.status).toBe('failed');
    expect(report.stages[0]?.error).toBe('Cancelled by user at gate');
    expect(report.failedStageIndex).toBe(0);
  });

  it('should build scene summary from context with failed scenes', async () => {
    const ctx: PipelineContext = {
      scenes: [
        {
          index: 0,
          heading: 'S1',
          description: '',
          dialogue: [],
          estimatedDuration: 5,
          suggestedPrompt: '',
        },
        {
          index: 1,
          heading: 'S2',
          description: '',
          dialogue: [],
          estimatedDuration: 5,
          suggestedPrompt: '',
        },
        {
          index: 2,
          heading: 'S3',
          description: '',
          dialogue: [],
          estimatedDuration: 5,
          suggestedPrompt: '',
        },
      ],
      generatedPaths: ['/out/0.mp4', '/out/2.mp4'],
      failedScenes: [1],
    };

    const events: PipelineEvent[] = [
      { type: 'pipeline_start', flowId: 'flowF', stages: ['batchGenerate'] },
      { type: 'stage_start', stage: 'batchGenerate', index: 0, total: 1 },
      { type: 'stage_complete', stage: 'batchGenerate' },
      { type: 'pipeline_complete', result: ctx },
    ];

    const report = await collectRunReport(eventStream(events), 'pipe-5', 'flowF');

    expect(report.sceneSummary).toEqual({
      total: 3,
      generated: 2,
      failed: 1,
      failedIndices: [1],
    });
  });

  it('should handle empty event stream', async () => {
    const report = await collectRunReport(eventStream([]), 'pipe-empty', 'flowB');

    expect(report.id).toBe('pipe-empty');
    expect(report.status).toBe('completed');
    expect(report.stages).toHaveLength(0);
    expect(report.sceneSummary).toBeUndefined();
  });
});

// =============================================================================
// createReportCollector (stateful, event-by-event)
// =============================================================================

describe('createReportCollector', () => {
  it('should produce same result as collectRunReport for identical events', async () => {
    const ctx: PipelineContext = { generatedPaths: ['/a.mp4'] };

    const events: PipelineEvent[] = [
      { type: 'pipeline_start', flowId: 'flowB', stages: ['batchGenerate'] },
      { type: 'stage_start', stage: 'batchGenerate', index: 0, total: 1 },
      { type: 'stage_complete', stage: 'batchGenerate' },
      { type: 'pipeline_complete', result: ctx },
    ];

    const collector = createReportCollector('pipe-c', 'flowB');
    for (const event of events) {
      collector.processEvent(event);
    }
    const report = collector.finalize();

    expect(report.id).toBe('pipe-c');
    expect(report.flowId).toBe('flowB');
    expect(report.status).toBe('completed');
    expect(report.stages).toHaveLength(1);
    expect(report.stages[0]?.status).toBe('success');
  });
});
