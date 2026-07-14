import { beforeEach, describe, expect, it } from 'vitest';
import { vscodeCommandState, vscodeWorkspaceState } from './vscode-test-double';
import {
  DASHBOARD_ACTIVITY_LIMIT,
  isTerminalPersistedStatus,
  normalizeActivityFile,
} from './activityFile';
import { ActivityStore } from './activityStore';

describe('dashboard activity store helpers', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
    vscodeWorkspaceState.reset();
  });

  it('recognizes terminal persisted statuses', () => {
    expect(isTerminalPersistedStatus('done')).toBe(true);
    expect(isTerminalPersistedStatus('error')).toBe(true);
    expect(isTerminalPersistedStatus('cancelled')).toBe(true);
    expect(isTerminalPersistedStatus('running')).toBe(false);
  });

  it('normalizes invalid files to an empty v1 file', () => {
    expect(normalizeActivityFile({ version: 2, entries: [] })).toEqual({
      version: 1,
      entries: [],
    });
  });

  it('filters malformed entries and enforces the activity cap', () => {
    const entries = Array.from({ length: DASHBOARD_ACTIVITY_LIMIT + 2 }, (_, index) => ({
      taskId: `task-${index}`,
      title: `Task ${index}`,
      source: 'neko-agent',
      status: 'done',
      outputs: [],
      completedAt: index,
    }));

    const normalized = normalizeActivityFile({
      version: 1,
      entries: [{ taskId: 'bad' }, ...entries],
    });

    expect(normalized.entries).toHaveLength(DASHBOARD_ACTIVITY_LIMIT);
    expect(normalized.entries[0]?.taskId).toBe('task-2');
  });

  it('poisons the retired workspace activity store without touching workspace files', () => {
    expect(() => new ActivityStore()).toThrowError(
      expect.objectContaining({ code: 'dashboard-retired-activity-store' }),
    );
    expect(vscodeWorkspaceState.fs.readFile).not.toHaveBeenCalled();
    expect(vscodeWorkspaceState.fs.createDirectory).not.toHaveBeenCalled();
    expect(vscodeWorkspaceState.fs.writeFile).not.toHaveBeenCalled();
  });
});
