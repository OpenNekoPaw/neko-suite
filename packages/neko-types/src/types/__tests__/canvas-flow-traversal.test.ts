import { describe, expect, it } from 'vitest';
import type { CanvasConnection, RegisteredCanvasNode } from '../canvas';
import { traverseNarrativeFlow } from '../canvas-flow-traversal';

function node(id: string, type: RegisteredCanvasNode['type']): RegisteredCanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: {},
  };
}

function edge(
  id: string,
  sourceId: string,
  targetId: string,
  priority = 0,
): CanvasConnection {
  return {
    id,
    sourceId,
    sourceAnchor: 'right',
    targetId,
    targetAnchor: 'left',
    type: 'choice',
    choiceText: id,
    priority,
  };
}

describe('narrative flow traversal', () => {
  it('walks narrative nodes and ignores unrelated subsystem nodes', () => {
    const result = traverseNarrativeFlow(
      [
        node('start', 'narrative-scene'),
        node('choice', 'choice'),
        node('end', 'merge'),
        node('state', 'state'),
      ],
      [edge('a', 'start', 'choice'), edge('b', 'choice', 'end'), edge('ignored', 'state', 'end')],
      'start',
    );

    expect(result.successors).toMatchObject({
      start: ['choice'],
      choice: ['end'],
      end: [],
    });
    expect(result.defaultPath).toEqual(['start', 'choice', 'end']);
    expect(result.deadEndNodeIds).toEqual(['end']);
    expect(result.choices.choice).toEqual([
      expect.objectContaining({ connectionId: 'b', targetNodeId: 'end' }),
    ]);
  });

  it('reports cycles in narrative flow', () => {
    const result = traverseNarrativeFlow(
      [node('a', 'choice'), node('b', 'choice')],
      [edge('a-b', 'a', 'b'), edge('b-a', 'b', 'a')],
      'a',
    );

    expect(result.cycles).toEqual([['a', 'b', 'a']]);
  });
});
