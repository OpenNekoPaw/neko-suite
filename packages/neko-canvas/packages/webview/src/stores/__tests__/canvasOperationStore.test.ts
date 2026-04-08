import { beforeEach, describe, expect, it } from 'vitest';
import type { EditOperation } from '@neko/shared';
import { useCanvasOperationStore } from '../canvasOperationStore';

function createOperation(source: EditOperation['meta']['source']): EditOperation {
  return {
    type: 'canvas.node.update',
    meta: {
      id: `op-${source}`,
      timestamp: Date.now(),
      source,
      description: 'Update node',
    },
    payload: {
      nodeId: 'node-1',
      updates: { position: { x: 240, y: 180 } },
    },
    before: {
      updates: { position: { x: 120, y: 90 } },
    },
  };
}

describe('canvasOperationStore', () => {
  beforeEach(() => {
    useCanvasOperationStore.setState({
      operationLog: [],
      maxLogSize: 500,
      operationSourceOverride: null,
    });
  });

  it('overrides operation source within a scoped mutation', () => {
    useCanvasOperationStore.getState().withOperationSource('ai', () => {
      useCanvasOperationStore.getState().recordOperation(createOperation('user'));
    });

    const [operation] = useCanvasOperationStore.getState().operationLog;
    expect(operation?.meta.source).toBe('ai');
    expect(useCanvasOperationStore.getState().operationSourceOverride).toBeNull();
  });

  it('restores previous source override after nested scoped mutations', () => {
    useCanvasOperationStore.getState().withOperationSource('system', () => {
      useCanvasOperationStore.getState().withOperationSource('ai', () => {
        useCanvasOperationStore.getState().recordOperation(createOperation('user'));
      });
      useCanvasOperationStore.getState().recordOperation(createOperation('user'));
    });

    expect(useCanvasOperationStore.getState().operationLog.map((op) => op.meta.source)).toEqual([
      'ai',
      'system',
    ]);
  });
});
