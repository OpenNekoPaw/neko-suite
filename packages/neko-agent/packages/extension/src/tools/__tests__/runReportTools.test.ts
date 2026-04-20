import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRunReportTools } from '../runReportTools';
import type { WorkflowRunReport } from '@neko/agent/workflow';

// =============================================================================
// Mock pipelineTools (in-memory storage)
// =============================================================================

let mockReports: WorkflowRunReport[] = [];

vi.mock('../pipelineTools', () => ({
  getPipelineReport: vi.fn((id: string) => mockReports.find((r) => r.id === id)),
  listPipelineReports: vi.fn((limit: number) => mockReports.slice(0, limit)),
}));

vi.mock('../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// =============================================================================
// Helpers
// =============================================================================

function createMockReport(overrides?: Partial<WorkflowRunReport>): WorkflowRunReport {
  return {
    id: 'pipe-1',
    flowId: 'flowF',
    startedAt: '2026-03-26T10:00:00Z',
    completedAt: '2026-03-26T10:01:00Z',
    status: 'completed',
    stages: [
      { name: 'readDocument', status: 'success', durationMs: 1500 },
      { name: 'batchGenerate', status: 'success', durationMs: 45000 },
    ],
    finalContext: { generatedPaths: ['/out/0.mp4'] },
    sceneSummary: {
      total: 1,
      generated: 1,
      failed: 0,
      failedIndices: [],
    },
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('RunReportTools', () => {
  beforeEach(() => {
    mockReports = [];
  });

  describe('GetPipelineReport', () => {
    it('should return report data when found', async () => {
      mockReports = [createMockReport()];
      const tools = createRunReportTools();
      const getTool = tools.find((t) => t.name === 'GetPipelineReport');

      const result = (await getTool!.execute({ pipelineId: 'pipe-1' })) as Record<string, unknown>;

      expect(result['success']).toBe(true);
      const data = result['data'] as Record<string, unknown>;
      expect(data['id']).toBe('pipe-1');
      expect(data['status']).toBe('completed');
      expect(data['totalDurationMs']).toBe(46500);
      expect((data['stages'] as unknown[]).length).toBe(2);
    });

    it('should return error when report not found', async () => {
      const tools = createRunReportTools();
      const getTool = tools.find((t) => t.name === 'GetPipelineReport');

      const result = (await getTool!.execute({ pipelineId: 'nonexistent' })) as Record<
        string,
        unknown
      >;

      expect(result['success']).toBe(false);
      expect(result['error']).toContain('No report found');
    });

    it('should return error when pipelineId is missing', async () => {
      const tools = createRunReportTools();
      const getTool = tools.find((t) => t.name === 'GetPipelineReport');

      const result = (await getTool!.execute({})) as Record<string, unknown>;

      expect(result['success']).toBe(false);
      expect(result['error']).toContain('pipelineId is required');
    });
  });

  describe('ListPipelineReports', () => {
    it('should return report summaries', async () => {
      mockReports = [
        createMockReport({ id: 'pipe-1' }),
        createMockReport({
          id: 'pipe-2',
          status: 'failed',
          failedStageIndex: 1,
          stages: [
            { name: 'readDocument', status: 'success', durationMs: 1000 },
            {
              name: 'batchGenerate',
              status: 'failed',
              durationMs: 5000,
              error: 'Provider timeout',
            },
          ],
        }),
      ];
      const tools = createRunReportTools();
      const listTool = tools.find((t) => t.name === 'ListPipelineReports');

      const result = (await listTool!.execute({})) as Record<string, unknown>;

      expect(result['success']).toBe(true);
      const data = result['data'] as Record<string, unknown>;
      expect(data['total']).toBe(2);
      const items = data['reports'] as Record<string, unknown>[];
      expect(items[1]?.['failedStage']).toBe('batchGenerate');
    });

    it('should return empty when no reports', async () => {
      const tools = createRunReportTools();
      const listTool = tools.find((t) => t.name === 'ListPipelineReports');

      const result = (await listTool!.execute({})) as Record<string, unknown>;

      expect(result['success']).toBe(true);
      const data = result['data'] as Record<string, unknown>;
      expect(data['total']).toBe(0);
    });
  });
});
