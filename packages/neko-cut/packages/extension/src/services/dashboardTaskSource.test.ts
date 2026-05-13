import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardTaskEvent } from '@neko/shared/types/dashboard-task';
import type { ExportConfig, ExportProgress } from './ExportService';
import {
  NekoCutDashboardTaskSource,
  type DashboardExportService,
  type DashboardExportServiceEntry,
} from './dashboardTaskSource';

vi.mock('vscode', () => {
  class Disposable {
    constructor(private readonly onDispose: () => void) {}

    dispose(): void {
      this.onDispose();
    }
  }

  class EventEmitter<T> {
    private readonly listeners = new Set<(event: T) => void>();

    readonly event = (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return new Disposable(() => {
        this.listeners.delete(listener);
      });
    };

    fire(event: T): void {
      for (const listener of this.listeners) {
        listener(event);
      }
    }

    dispose(): void {
      this.listeners.clear();
    }
  }

  return {
    EventEmitter,
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' }, name: 'workspace', index: 0 }],
    },
  };
});

describe('NekoCutDashboardTaskSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps active export progress to dashboard tasks with safe output refs', async () => {
    const service = new FakeExportService([
      {
        jobId: 'export-1',
        config: createExportConfig('/workspace/renders/output.mp4'),
        startedAt: 100,
      },
    ]);
    service.setProgress({
      jobId: 'export-1',
      state: 'encoding',
      progress: 42,
      currentFrame: 42,
      totalFrames: 100,
      elapsedMs: 1000,
      estimatedRemainingMs: 1000,
    });

    const source = new NekoCutDashboardTaskSource(
      createRegistry([{ documentUri: 'file:///a.nkv', service }]),
    );
    const snapshot = await source.getSnapshot();

    expect(snapshot).toEqual([
      expect.objectContaining({
        taskId: 'neko-cut:export-1',
        source: 'neko-cut',
        sourceTaskId: 'export-1',
        status: 'running',
        progress: 42,
        actions: ['cancel'],
        outputs: [{ kind: 'file', ref: 'renders/output.mp4', label: 'output.mp4' }],
      }),
    ]);
    source.dispose();
  });

  it('clamps progress and drops unsafe relative output refs', async () => {
    const service = new FakeExportService([
      {
        jobId: 'export-unsafe',
        config: createExportConfig('../outside.mp4'),
        startedAt: 100,
      },
    ]);
    service.setProgress({
      jobId: 'export-unsafe',
      state: 'encoding',
      progress: Number.POSITIVE_INFINITY,
      currentFrame: 1,
      totalFrames: 100,
      elapsedMs: 1000,
      estimatedRemainingMs: 1000,
    });

    const source = new NekoCutDashboardTaskSource(
      createRegistry([{ documentUri: 'file:///unsafe.nkv', service }]),
    );
    const snapshot = await source.getSnapshot();

    expect(snapshot[0]).toEqual(
      expect.objectContaining({
        progress: 0,
      }),
    );
    expect(snapshot[0]?.outputs).toBeUndefined();
    source.dispose();
  });

  it('emits updates and exposes reveal output only for completed workspace exports', async () => {
    const service = new FakeExportService([
      {
        jobId: 'export-2',
        config: createExportConfig('/workspace/out/final.webm'),
        startedAt: 200,
      },
    ]);
    const source = new NekoCutDashboardTaskSource(
      createRegistry([{ documentUri: 'file:///b.nkv', service }]),
    );
    const events: DashboardTaskEvent[] = [];
    source.onDidChangeTask((event) => events.push(event));

    service.fireProgress({
      jobId: 'export-2',
      state: 'completed',
      progress: 100,
      currentFrame: 100,
      totalFrames: 100,
      elapsedMs: 2000,
      estimatedRemainingMs: 0,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.task).toEqual(
      expect.objectContaining({
        status: 'done',
        actions: ['reveal-output'],
        outputs: [{ kind: 'file', ref: 'out/final.webm', label: 'final.webm' }],
      }),
    );
    source.dispose();
  });

  it('delegates cancel to the owning export service', async () => {
    const service = new FakeExportService([
      {
        jobId: 'export-3',
        config: createExportConfig('/workspace/out/final.mp4'),
        startedAt: 300,
      },
    ]);
    const source = new NekoCutDashboardTaskSource(
      createRegistry([{ documentUri: 'file:///c.nkv', service }]),
    );
    await source.getSnapshot();

    await source.cancel({ source: 'neko-cut', sourceTaskId: 'export-3' });

    expect(service.cancelJob).toHaveBeenCalledWith('export-3');
    source.dispose();
  });
});

function createRegistry(entries: DashboardExportServiceEntry[]) {
  return {
    onDidRegisterExportService: (_listener: (entry: DashboardExportServiceEntry) => void) => ({
      dispose: vi.fn(),
    }),
    getExportServices: () => entries,
  };
}

function createExportConfig(outputPath: string): ExportConfig {
  return {
    outputPath,
    format: 'mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    quality: 'high',
    audioBitrate: 192,
  };
}

class FakeExportService implements DashboardExportService {
  private readonly progressListeners = new Set<(progress: ExportProgress) => void>();
  private readonly progress = new Map<string, ExportProgress>();

  readonly cancelJob = vi.fn(async () => undefined);

  readonly onDidProgress = (listener: (progress: ExportProgress) => void) => {
    this.progressListeners.add(listener);
    return {
      dispose: () => {
        this.progressListeners.delete(listener);
      },
    };
  };

  constructor(private readonly jobs: ReturnType<DashboardExportService['getActiveExportJobs']>) {}

  getActiveExportJobs(): ReturnType<DashboardExportService['getActiveExportJobs']> {
    return this.jobs;
  }

  async getProgress(jobId?: string): Promise<ExportProgress | null> {
    if (!jobId) return null;
    return this.progress.get(jobId) ?? null;
  }

  setProgress(progress: ExportProgress): void {
    this.progress.set(progress.jobId, progress);
  }

  fireProgress(progress: ExportProgress): void {
    this.setProgress(progress);
    for (const listener of this.progressListeners) {
      listener(progress);
    }
  }
}
