import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, CanvasViewport } from '@neko/shared';
import { NodeContentDispatcher } from './NodeContentDispatcher';
import type { NodeRendererContext } from '../nodes/nodeRendererRegistry';

const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };

function createContext(node: AnnotationCanvasNode): NodeRendererContext {
  return {
    node,
    allNodes: [node],
    selectedNodeIds: [],
    viewport,
    isSelected: false,
    containerRef: { current: null },
  };
}

function createAnnotationNode(): AnnotationCanvasNode {
  return {
    id: 'annotation-1',
    type: 'annotation',
    position: { x: 0, y: 0 },
    size: { width: 220, height: 120 },
    zIndex: 1,
    data: { content: 'Legacy note' },
  };
}

describe('NodeContentDispatcher', () => {
  it('uses the legacy renderer when node.content is absent', () => {
    const node = createAnnotationNode();
    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', { className: 'legacy-node' }, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Legacy path');
    expect(markup).toContain('legacy-node');
  });

  it('uses composable content when node.content exists', () => {
    const node: AnnotationCanvasNode = {
      ...createAnnotationNode(),
      content: {
        id: 'root',
        blocks: [
          {
            id: 'body',
            kind: 'text',
            binding: { path: '/content' },
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Legacy note');
    expect(markup).not.toContain('Legacy path');
    expect(markup).toContain('data-content-block-id="body"');
  });

  it('matches the annotation.basic composable rollout snapshot', () => {
    const node: AnnotationCanvasNode = {
      ...createAnnotationNode(),
      preset: 'annotation.basic',
      content: {
        id: 'annotation-root',
        layout: 'stack',
        blocks: [
          {
            id: 'annotation-content',
            kind: 'textarea',
            label: 'Note',
            binding: { path: '/content', valueType: 'string' },
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div data-node-id="annotation-1" class="absolute select-none cursor-grab" style="left:0;top:0;width:220px;height:120px;z-index:1;transform-origin:center center"><div class="w-full h-full rounded-lg border-2 shadow-lg overflow-hidden bg-[var(--node-bg)] transition-colors duration-150 border-[var(--node-border)]"><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div data-content-block-id="annotation-content" class="min-w-0"><label class="flex min-h-0 flex-1 flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Note</span><textarea class="min-h-[64px] resize-none rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]">Legacy note</textarea></label></div></div></div><div class="absolute z-30 derive-btn" style="right:-16px;top:50%;transform:translateY(-50%)"><button class="flex items-center justify-center rounded-full" style="width:28px;height:28px;background-color:var(--node-selected, #3b82f6);color:#fff;border:2px solid var(--node-bg, #1e1e1e);font-size:16px;font-weight:bold;line-height:1;cursor:pointer" title="添加后继节点">+</button></div></div>"`,
    );
  });
});
