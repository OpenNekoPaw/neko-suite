import React from 'react';
import { FallbackNode } from './FallbackNode';
import { NodeContentDispatcher } from '../content/NodeContentDispatcher';
import type { NodeRendererContext, NodeRendererRegistry } from './nodeRendererTypes';

export function renderCanvasNode(
  registry: NodeRendererRegistry,
  context: NodeRendererContext,
): React.ReactNode {
  const renderer = registry[context.node.type];

  return (
    <NodeContentDispatcher
      context={context}
      renderLegacy={(legacyContext) =>
        renderer ? renderer(legacyContext) : <FallbackNode key={context.node.id} {...legacyContext} />
      }
    />
  );
}
