import type { DashboardTask, DashboardTaskOutputRef } from '@neko/shared/types/dashboard-task';

export const DASHBOARD_ACTIVITY_LIMIT = 50;

export interface DashboardActivityEntry {
  readonly taskId: string;
  readonly title: string;
  readonly source: string;
  readonly status: 'done' | 'error' | 'cancelled';
  readonly outputs: readonly DashboardTaskOutputRef[];
  readonly completedAt: number;
}

export interface ActivityFile {
  readonly version: 1;
  readonly entries: readonly DashboardActivityEntry[];
}

export function isTerminalPersistedStatus(
  status: DashboardTask['status'],
): status is DashboardActivityEntry['status'] {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

export function normalizeActivityFile(value: unknown): ActivityFile {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    return { version: 1, entries: [] };
  }

  return {
    version: 1,
    entries: value.entries.filter(isActivityEntry).slice(-DASHBOARD_ACTIVITY_LIMIT),
  };
}

function isActivityEntry(value: unknown): value is DashboardActivityEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.taskId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.source === 'string' &&
    isTerminalPersistedStatus(value.status as DashboardTask['status']) &&
    Array.isArray(value.outputs) &&
    typeof value.completedAt === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
