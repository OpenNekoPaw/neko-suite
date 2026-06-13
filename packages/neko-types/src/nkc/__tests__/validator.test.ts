import { describe, expect, it } from 'vitest';
import { validateNkc } from '../index';

function createValidCanvas(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '2.1',
    name: 'Validator Fixture',
    nodes: [],
    connections: [],
    ...overrides,
  };
}

function createCompleteNode(type: string): Record<string, unknown> {
  return {
    id: `${type}-1`,
    type,
    position: { x: 10, y: 20 },
    size: { width: 200, height: 100 },
    zIndex: 1,
    data: {},
  };
}

describe('NKC validator v2.1', () => {
  it('accepts optional projected flag and subsystem metadata objects', () => {
    const result = validateNkc(
      createValidCanvas({
        projected: true,
        narrative: { entryNodeId: 'choice-1', variables: [] },
        behavior: { blackboard: [] },
        entityGraph: { entityScope: ['character'], bindingSource: 'entities.json' },
        memoryGraph: { queryContext: 'session' },
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-boolean projected flag', () => {
    const result = validateNkc(createValidCanvas({ projected: 'yes' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'projected', message: 'must be a boolean' }),
    );
  });

  it('accepts registered subsystem node and connection types', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [createCompleteNode('choice'), createCompleteNode('memory')],
        connections: [
          {
            id: 'association-1',
            sourceId: 'memory-1',
            targetId: 'memory-1',
            sourceEndpoint: { nodeId: 'memory-1', scope: 'node' },
            targetEndpoint: { nodeId: 'memory-1', scope: 'node' },
            type: 'association',
            weight: 0.7,
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('reports structurally complete unknown nodes as warnings in normal mode', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [createCompleteNode('future-node')],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].type',
        message: 'unknown node type: "future-node"',
        severity: 'warning',
      }),
    );
  });

  it('promotes unknown node warnings to errors in strict mode', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [createCompleteNode('future-node')],
      }),
      { strict: true },
    );

    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].type',
        message: 'unknown node type: "future-node"',
        severity: 'error',
      }),
    );
  });

  it('keeps structurally incomplete unknown nodes as errors in normal mode', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            id: 'future-1',
            type: 'future-node',
            size: { width: 200, height: 100 },
            zIndex: 1,
            data: {},
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'nodes[0].position', message: 'must be an object' }),
    );
    expect(result.warnings).toEqual([]);
  });

  it('reports unknown connection types as warnings in normal mode and errors in strict mode', () => {
    const canvas = createValidCanvas({
      connections: [
        {
          id: 'future-edge',
          sourceId: 'a',
          targetId: 'b',
          sourceEndpoint: { nodeId: 'a', scope: 'node' },
          targetEndpoint: { nodeId: 'b', scope: 'node' },
          type: 'future-edge',
        },
      ],
    });

    const normal = validateNkc(canvas);
    expect(normal.valid).toBe(true);
    expect(normal.warnings).toContainEqual(
      expect.objectContaining({
        field: 'connections[0].type',
        message: 'unknown connection type: "future-edge"',
        severity: 'warning',
      }),
    );

    const strict = validateNkc(canvas, { strict: true });
    expect(strict.valid).toBe(false);
    expect(strict.errors).toContainEqual(
      expect.objectContaining({
        field: 'connections[0].type',
        message: 'unknown connection type: "future-edge"',
        severity: 'error',
      }),
    );
  });
});
