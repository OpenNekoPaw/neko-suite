import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchTimelineOpsTool } from '../project-tools';

function createMockContext() {
  return {
    getTimelineInfo: vi.fn().mockResolvedValue({ duration: 60, fps: 30, width: 1920, height: 1080, trackCount: 2 }),
    getTracks: vi.fn().mockResolvedValue([]),
    getElements: vi.fn().mockResolvedValue([]),
    addElement: vi.fn().mockResolvedValue('new-el-id'),
    updateElement: vi.fn().mockResolvedValue(undefined),
    deleteElement: vi.fn().mockResolvedValue(undefined),
    getMediaInfo: vi.fn().mockResolvedValue(null),
  };
}

describe('BatchTimelineOpsTool', () => {
  let tool: BatchTimelineOpsTool;
  let context: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    context = createMockContext();
    tool = new BatchTimelineOpsTool(context as any);
  });

  it('should execute all ops and return summary', async () => {
    const result = await tool.execute({
      operations: [
        { type: 'AddElement', trackId: 't1', elementType: 'video', startTime: 0, duration: 5, src: '/a.mp4' },
        { type: 'UpdateElement', id: 'el-1', updates: { startTime: 2 } },
        { type: 'DeleteElement', id: 'el-2' },
      ],
    });

    expect(result.success).toBe(true);
    const data = result.data as { succeeded: number; failed: number; results: unknown[] };
    expect(data.succeeded).toBe(3);
    expect(data.failed).toBe(0);
    expect(data.results).toHaveLength(3);
  });

  it('should continue after a failed op and report error', async () => {
    context.updateElement.mockRejectedValueOnce(new Error('Element not found'));

    const result = await tool.execute({
      operations: [
        { type: 'UpdateElement', id: 'missing-el', updates: { startTime: 1 } },
        { type: 'DeleteElement', id: 'el-3' },
      ],
    });

    expect(result.success).toBe(true);
    const data = result.data as { succeeded: number; failed: number };
    expect(data.succeeded).toBe(1);
    expect(data.failed).toBe(1);
  });

  it('should return error when operations is missing', async () => {
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/operations/i);
  });

  it('should return error for unknown operation type', async () => {
    const result = await tool.execute({
      operations: [{ type: 'UnknownOp', id: 'el-1' }],
    });
    expect(result.success).toBe(true);
    const data = result.data as { failed: number; results: Array<{ error: string }> };
    expect(data.failed).toBe(1);
    expect(data.results[0]?.error).toMatch(/Unknown/i);
  });

  it('should handle empty operations array', async () => {
    const result = await tool.execute({ operations: [] });
    expect(result.success).toBe(true);
    const data = result.data as { succeeded: number; failed: number };
    expect(data.succeeded).toBe(0);
    expect(data.failed).toBe(0);
  });
});
