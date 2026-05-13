import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
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

  it('accepts an injected workspace URI provider for isolated persistence tests', async () => {
    vscodeWorkspaceState.fs.readFile.mockRejectedValue(new Error('missing'));

    const store = new ActivityStore({
      workspaceUriProvider: () => ({ fsPath: '/workspace' }) as vscode.Uri,
    });

    await store.append({
      taskId: 'neko-agent:task-1',
      source: 'neko-agent',
      sourceTaskId: 'task-1',
      kind: 'generate-image',
      title: 'Generate image',
      status: 'done',
      actions: ['reveal-output'],
      startedAt: 1,
      completedAt: 2,
      outputs: [{ kind: 'file', ref: 'renders/output.png' }],
    });

    expect(vscodeWorkspaceState.fs.createDirectory).toHaveBeenCalledWith({
      fsPath: '/workspace/.neko',
    });
    expect(vscodeWorkspaceState.fs.writeFile).toHaveBeenCalledOnce();
    const [uri, bytes] = vscodeWorkspaceState.fs.writeFile.mock.calls[0] ?? [];
    expect(uri).toEqual({ fsPath: '/workspace/.neko/dashboard-activity.json' });
    expect(JSON.parse(new TextDecoder().decode(bytes as Uint8Array))).toEqual({
      version: 1,
      entries: [
        expect.objectContaining({
          taskId: 'neko-agent:task-1',
          outputs: [{ kind: 'file', ref: 'renders/output.png' }],
        }),
      ],
    });
  });
});
