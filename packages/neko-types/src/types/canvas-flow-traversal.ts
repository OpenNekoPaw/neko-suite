import type { CanvasConnection, CanvasNode } from './canvas';

export interface NarrativeChoiceEdge {
  readonly connectionId: string;
  readonly targetNodeId: string;
  readonly choiceText?: string;
  readonly condition?: string;
  readonly priority: number;
}

export interface NarrativeFlowTraversalResult {
  readonly startNodeId?: string;
  readonly successors: Readonly<Record<string, readonly string[]>>;
  readonly predecessors: Readonly<Record<string, readonly string[]>>;
  readonly defaultPath: readonly string[];
  readonly choices: Readonly<Record<string, readonly NarrativeChoiceEdge[]>>;
  readonly deadEndNodeIds: readonly string[];
  readonly cycles: readonly (readonly string[])[];
}

const NARRATIVE_NODE_TYPES = new Set(['choice', 'merge', 'narrative-scene', 'narrative-note']);

export function traverseNarrativeFlow(
  nodes: readonly CanvasNode[],
  connections: readonly CanvasConnection[],
  startNodeId?: string,
): NarrativeFlowTraversalResult {
  const narrativeNodeIds = new Set(
    nodes.filter((node) => NARRATIVE_NODE_TYPES.has(node.type)).map((node) => node.id),
  );
  const narrativeConnections = connections.filter(
    (connection) =>
      narrativeNodeIds.has(connection.sourceId) &&
      narrativeNodeIds.has(connection.targetId) &&
      (connection.type === 'choice' || connection.type === 'default' || connection.type === undefined),
  );

  const successors: Record<string, string[]> = {};
  const predecessors: Record<string, string[]> = {};
  const choices: Record<string, NarrativeChoiceEdge[]> = {};

  for (const nodeId of narrativeNodeIds) {
    successors[nodeId] = [];
    predecessors[nodeId] = [];
    choices[nodeId] = [];
  }

  for (const connection of narrativeConnections) {
    successors[connection.sourceId]?.push(connection.targetId);
    predecessors[connection.targetId]?.push(connection.sourceId);
    choices[connection.sourceId]?.push({
      connectionId: connection.id,
      targetNodeId: connection.targetId,
      choiceText: connection.choiceText,
      condition: connection.condition,
      priority: connection.priority ?? 0,
    });
  }

  for (const edges of Object.values(choices)) {
    edges.sort((left, right) => left.priority - right.priority);
  }

  const resolvedStartNodeId =
    startNodeId && narrativeNodeIds.has(startNodeId)
      ? startNodeId
      : nodes.find((node) => narrativeNodeIds.has(node.id))?.id;

  return {
    startNodeId: resolvedStartNodeId,
    successors,
    predecessors,
    defaultPath: resolvedStartNodeId
      ? buildDefaultPath(resolvedStartNodeId, choices, narrativeNodeIds.size)
      : [],
    choices,
    deadEndNodeIds: Array.from(narrativeNodeIds).filter(
      (nodeId) => (successors[nodeId]?.length ?? 0) === 0,
    ),
    cycles: detectCycles(successors),
  };
}

function buildDefaultPath(
  startNodeId: string,
  choices: Readonly<Record<string, readonly NarrativeChoiceEdge[]>>,
  nodeLimit: number,
): readonly string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = startNodeId;

  while (current && !visited.has(current) && path.length <= nodeLimit) {
    path.push(current);
    visited.add(current);
    current = choices[current]?.[0]?.targetNodeId;
  }

  return path;
}

function detectCycles(successors: Readonly<Record<string, readonly string[]>>): readonly string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      const cycleStart = stack.indexOf(nodeId);
      if (cycleStart >= 0) {
        cycles.push([...stack.slice(cycleStart), nodeId]);
      }
      return;
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    stack.push(nodeId);
    for (const successor of successors[nodeId] ?? []) {
      visit(successor);
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of Object.keys(successors)) {
    visit(nodeId);
  }

  return cycles;
}
