import { describe, expect, it } from 'vitest';
import {
  getCreationProjectedTaskRunBinding,
  getCreationProjectedTaskRunId,
  isCreationProjectedTaskPayload,
  toSerializableCreationProjectedTask,
  toCreationProjectedTaskPayload,
} from '../creation-projected-task';

describe('creation-projected-task', () => {
  it('serializes Agent creation projected task bindings into shared task payloads', () => {
    const task = toSerializableCreationProjectedTask({
      id: 'creation:run-1:item-1',
      status: 'running',
      progress: 50,
      createdAt: 10,
      updatedAt: 20,
      content: 'Export teaser',
      activeForm: 'Exporting teaser',
      binding: {
        source: 'creation',
        runId: 'run-1',
        runStartedAt: 101,
        checklistId: 'task-1',
        itemId: 'item-1',
        artifact: {
          kind: 'task',
          artifactId: 'task-1',
          path: '/tmp/proj/neko/creations/cut-launch-teaser-draft-1/checklist.md',
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
            source: 'creation',
            name: 'Export teaser',
            legacyTrace: {
              runId: 'run-1',
              runStartedAt: 101,
            },
            checklistId: 'task-1',
            itemId: 'item-1',
            activeForm: 'Exporting teaser',
            artifact: {
              kind: 'task',
              artifactId: 'task-1',
              path: '/tmp/proj/neko/creations/cut-launch-teaser-draft-1/checklist.md',
              updatedAt: 20,
            },
          },
        },
      }),
    );
  });

  it('guards Agent creation projected task payload shape', () => {
    const validPayload = toCreationProjectedTaskPayload({
      id: 'creation:run-1:item-1',
      status: 'completed',
      progress: 100,
      createdAt: 10,
      updatedAt: 30,
      content: 'Export teaser',
      binding: {
        source: 'creation',
        runId: 'run-1',
        runStartedAt: 101,
        checklistId: 'task-1',
        itemId: 'item-1',
      },
    });

    expect(isCreationProjectedTaskPayload(validPayload)).toBe(true);
    expect(isCreationProjectedTaskPayload({ ...validPayload, content: 'Export teaser' })).toBe(
      false,
    );
    expect(isCreationProjectedTaskPayload({ ...validPayload, runId: 'run-1' })).toBe(false);
    expect(isCreationProjectedTaskPayload({ ...validPayload, source: 'idc' })).toBe(false);
    expect(isCreationProjectedTaskPayload({ source: 'creation', runId: 'run-1' })).toBe(false);
  });

  it('extracts legacy trace run id only from Agent creation projected task payloads', () => {
    const workflowTask = toSerializableCreationProjectedTask({
      id: 'creation:run-1:item-1',
      status: 'completed',
      progress: 100,
      createdAt: 10,
      updatedAt: 30,
      content: 'Export teaser',
      binding: {
        source: 'creation',
        runId: 'run-1',
        runStartedAt: 101,
        checklistId: 'task-1',
        itemId: 'item-1',
      },
    });

    expect(getCreationProjectedTaskRunBinding(workflowTask)).toEqual({
      runId: 'run-1',
      runStartedAt: 101,
    });
    expect(getCreationProjectedTaskRunId(workflowTask)).toBe('run-1');
    expect(
      getCreationProjectedTaskRunId({
        type: 'custom',
        input: { type: 'custom', payload: {} },
      }),
    ).toBeNull();
  });
});
