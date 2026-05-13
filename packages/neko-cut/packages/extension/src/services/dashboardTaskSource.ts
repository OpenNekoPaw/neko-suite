import * as path from 'path';
import * as vscode from 'vscode';
import {
  DASHBOARD_TASK_CONTRACT_VERSION,
  clampDashboardTaskProgress,
  normalizeDashboardLocalRef,
  toDashboardTaskId,
  type DashboardTask,
  type DashboardTaskEvent,
  type DashboardTaskOutputRef,
  type DashboardTaskRef,
  type DashboardTaskSource,
} from '@neko/shared/types/dashboard-task';
import type { ExportConfig, ExportProgress } from './ExportService';

const SOURCE_ID = 'neko-cut';
const SOURCE_NAME = 'Neko Cut';

export interface DashboardExportJobSnapshot {
  readonly jobId: string;
  readonly config: ExportConfig;
  readonly startedAt: number;
}

export interface DashboardExportService {
  readonly onDidProgress: vscode.Event<ExportProgress>;
  getActiveExportJobs(): DashboardExportJobSnapshot[];
  getProgress(jobId?: string): Promise<ExportProgress | null>;
  cancelJob(jobId: string): Promise<void>;
}

export interface DashboardExportServiceEntry {
  readonly documentUri: string;
  readonly service: DashboardExportService;
}

export interface DashboardExportServiceRegistry {
  readonly onDidRegisterExportService: vscode.Event<DashboardExportServiceEntry>;
  getExportServices(): DashboardExportServiceEntry[];
}

export class NekoCutDashboardTaskSource implements DashboardTaskSource, vscode.Disposable {
  readonly contractVersion = DASHBOARD_TASK_CONTRACT_VERSION;
  readonly source = SOURCE_ID;
  readonly sourceDisplayName = SOURCE_NAME;
  readonly capabilities = {
    cancel: true,
    revealOutput: true,
  };

  private readonly emitter = new vscode.EventEmitter<DashboardTaskEvent>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly serviceDisposables = new Map<DashboardExportService, vscode.Disposable>();
  private readonly servicesByTask = new Map<string, DashboardExportService>();
  private readonly tasks = new Map<string, DashboardTask>();

  constructor(private readonly registry: DashboardExportServiceRegistry) {
    this.disposables.push(
      registry.onDidRegisterExportService((entry) => {
        this.observeService(entry.service);
      }),
    );

    for (const entry of registry.getExportServices()) {
      this.observeService(entry.service);
    }
  }

  async getSnapshot(): Promise<DashboardTask[]> {
    for (const entry of this.registry.getExportServices()) {
      this.observeService(entry.service);
      await this.refreshServiceSnapshot(entry.service);
    }

    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  onDidChangeTask(listener: (event: DashboardTaskEvent) => void): vscode.Disposable {
    return this.emitter.event(listener);
  }

  async cancel(task: DashboardTaskRef): Promise<void> {
    if (task.source !== SOURCE_ID) {
      throw new Error(`Unsupported dashboard task source: ${task.source}`);
    }

    const service = this.servicesByTask.get(task.sourceTaskId);
    if (!service) {
      throw new Error(`Unknown Neko Cut export task: ${task.sourceTaskId}`);
    }

    await service.cancelJob(task.sourceTaskId);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    for (const disposable of this.serviceDisposables.values()) {
      disposable.dispose();
    }
    this.serviceDisposables.clear();
    this.servicesByTask.clear();
    this.tasks.clear();
    this.emitter.dispose();
  }

  private observeService(service: DashboardExportService): void {
    if (this.serviceDisposables.has(service)) {
      return;
    }

    this.serviceDisposables.set(
      service,
      service.onDidProgress((progress) => {
        this.applyProgress(service, progress);
      }),
    );
  }

  private async refreshServiceSnapshot(service: DashboardExportService): Promise<void> {
    for (const job of service.getActiveExportJobs()) {
      this.servicesByTask.set(job.jobId, service);

      const progress = await service.getProgress(job.jobId);
      const task = progress
        ? this.toTask(service, progress, job)
        : this.toTaskFromJob(job, 'running');
      this.tasks.set(task.taskId, task);
    }
  }

  private applyProgress(service: DashboardExportService, progress: ExportProgress): void {
    const existing = this.tasks.get(
      toDashboardTaskId({ source: SOURCE_ID, sourceTaskId: progress.jobId }),
    );
    const job = service
      .getActiveExportJobs()
      .find((candidate) => candidate.jobId === progress.jobId);
    const task = this.toTask(service, progress, job, existing);

    this.servicesByTask.set(progress.jobId, service);
    this.tasks.set(task.taskId, task);
    this.emitter.fire({ type: existing ? 'updated' : 'added', task });
  }

  private toTask(
    service: DashboardExportService,
    progress: ExportProgress,
    job?: DashboardExportJobSnapshot,
    previous?: DashboardTask,
  ): DashboardTask {
    const sourceTaskId = progress.jobId;
    const taskId = toDashboardTaskId({ source: SOURCE_ID, sourceTaskId });
    const outputs = job ? toOutputRefs(job.config.outputPath) : previous?.outputs;

    return {
      taskId,
      source: SOURCE_ID,
      sourceDisplayName: SOURCE_NAME,
      sourceTaskId,
      kind: 'video-export',
      title: outputTitle(job?.config.outputPath),
      status: mapExportStatus(progress.state),
      progress: clampDashboardTaskProgress(progress.progress),
      actions: buildActions(progress.state, outputs),
      startedAt: job?.startedAt ?? previous?.startedAt ?? Date.now(),
      ...(isTerminalExportState(progress.state) ? { completedAt: Date.now() } : {}),
      ...(outputs && outputs.length > 0 ? { outputs } : {}),
      currentStep: progress.state,
      ...(progress.error ? { error: progress.error } : {}),
    };
  }

  private toTaskFromJob(
    job: DashboardExportJobSnapshot,
    status: DashboardTask['status'],
  ): DashboardTask {
    const sourceTaskId = job.jobId;
    const outputs = toOutputRefs(job.config.outputPath);

    return {
      taskId: toDashboardTaskId({ source: SOURCE_ID, sourceTaskId }),
      source: SOURCE_ID,
      sourceDisplayName: SOURCE_NAME,
      sourceTaskId,
      kind: 'video-export',
      title: outputTitle(job.config.outputPath),
      status,
      progress: 0,
      actions: status === 'queued' || status === 'running' ? ['cancel'] : [],
      startedAt: job.startedAt,
      ...(outputs.length > 0 ? { outputs } : {}),
    };
  }
}

function mapExportStatus(state: string): DashboardTask['status'] {
  switch (state) {
    case 'completed':
      return 'done';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'error';
    case 'pending':
    case 'queued':
      return 'queued';
    default:
      return 'running';
  }
}

function buildActions(
  state: string,
  outputs: readonly DashboardTaskOutputRef[] | undefined,
): DashboardTask['actions'] {
  if (state === 'completed') {
    return outputs && outputs.length > 0 ? ['reveal-output'] : [];
  }
  if (isTerminalExportState(state)) {
    return [];
  }
  return ['cancel'];
}

function isTerminalExportState(state: string): boolean {
  return state === 'completed' || state === 'cancelled' || state === 'error';
}

function outputTitle(outputPath: string | undefined): string {
  if (!outputPath) return 'Export video';
  return `Export ${path.basename(outputPath)}`;
}

function toOutputRefs(outputPath: string | undefined): DashboardTaskOutputRef[] {
  const ref = toWorkspaceRelativeRef(outputPath);
  if (!ref) return [];

  return [
    {
      kind: 'file',
      ref,
      label: path.basename(ref),
    },
  ];
}

function toWorkspaceRelativeRef(outputPath: string | undefined): string | undefined {
  if (!outputPath) return undefined;
  if (!path.isAbsolute(outputPath)) {
    return normalizeDashboardLocalRef(outputPath);
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const relative = path.relative(folder.uri.fsPath, outputPath);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return normalizeDashboardLocalRef(relative);
    }
  }

  return undefined;
}
