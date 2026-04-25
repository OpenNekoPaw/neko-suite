import { describe, expect, it } from 'vitest';
import {
  getIdcProjectedTaskRunBinding,
  getIdcProjectedTaskRunId,
  isIdcProjectedTaskPayload,
  toSerializableIdcProjectedTask,
  toIdcProjectedTaskPayload,
} from '../idc-projected-task';

describe('idc-projected-task', () => {
  it('serializes explicit IDC projected task bindings into shared task payloads', () => {
    const task = toSerializableIdcProjectedTask({
      id: 'idc:run-1:item-1',
      status: 'running',
      progress: 50,
      createdAt: 10,
      updatedAt: 20,
      content: 'Export teaser',
      activeForm: 'Exporting teaser',
      binding: {
        source: 'idc',
        runId: 'run-1',
        runStartedAt: 101,
        checklistId: 'task-1',
        itemId: 'item-1',
        artifact: {
          kind: 'task',
          artifactId: 'task-1',
          path: '/tmp/proj/.neko/tasks/task-run-1.md',
          updatedAt: 20,
        },
      },
    });

    expect(task).toEqual(
      expect.objectContaining({
        type: 'workflow',
        status: 'running',
        input: {
          type: 'workflow',
          payload: {
            source: 'idc',
            name: 'Export teaser',
            content: 'Export teaser',
            runId: 'run-1',
            runStartedAt: 101,
            checklistId: 'task-1',
            itemId: 'item-1',
            activeForm: 'Exporting teaser',
            artifact: {
              kind: 'task',
              artifactId: 'task-1',
              path: '/tmp/proj/.neko/tasks/task-run-1.md',
              updatedAt: 20,
            },
          },
        },
      }),
    );
  });

  it('guards IDC projected task payload shape', () => {
    const validPayload = toIdcProjectedTaskPayload({
      id: 'idc:run-1:item-1',
      status: 'completed',
      progress: 100,
      createdAt: 10,
      updatedAt: 30,
      content: 'Export teaser',
      binding: {
        source: 'idc',
        runId: 'run-1',
        runStartedAt: 101,
        checklistId: 'task-1',
        itemId: 'item-1',
      },
    });

    expect(isIdcProjectedTaskPayload(validPayload)).toBe(true);
    expect(isIdcProjectedTaskPayload({ source: 'idc', runId: 'run-1' })).toBe(false);
  });

  it('extracts run id only from IDC projected tasks with the explicit payload contract', () => {
    const workflowTask = toSerializableIdcProjectedTask({
      id: 'idc:run-1:item-1',
      status: 'completed',
      progress: 100,
      createdAt: 10,
      updatedAt: 30,
      content: 'Export teaser',
      binding: {
        source: 'idc',
        runId: 'run-1',
        runStartedAt: 101,
        checklistId: 'task-1',
        itemId: 'item-1',
      },
    });

    expect(getIdcProjectedTaskRunBinding(workflowTask)).toEqual({
      runId: 'run-1',
      runStartedAt: 101,
    });
    expect(getIdcProjectedTaskRunId(workflowTask)).toBe('run-1');
    expect(
      getIdcProjectedTaskRunId({
        type: 'custom',
        input: { type: 'custom', payload: {} },
      }),
    ).toBeNull();
  });
});
