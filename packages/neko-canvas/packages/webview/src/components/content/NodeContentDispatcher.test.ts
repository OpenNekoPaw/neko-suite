import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, CanvasNode, CanvasViewport } from '@neko/shared';
import { NodeContentDispatcher } from './NodeContentDispatcher';
import { createNodeCollapseUpdate } from './NodeShell';
import type { NodeRendererContext } from '../nodes/nodeRendererTypes';
import { buildCanvasNode } from '../../utils/nodeFactory';

const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };

function createContext(node: CanvasNode, allNodes: CanvasNode[] = [node]): NodeRendererContext {
  return {
    node,
    allNodes,
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
  it('uses the legacy renderer when node has no content and no preset', () => {
    const node: CanvasNode = {
      id: 'storyboard-1',
      type: 'storyboard',
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      zIndex: 1,
      data: {},
    } as CanvasNode;
    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', { className: 'legacy-node' }, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Legacy path');
    expect(markup).toContain('legacy-node');
  });

  it('uses composable content when node.content exists and no preset matches', () => {
    const node = {
      id: 'custom-1',
      type: 'document',
      position: { x: 0, y: 0 },
      size: { width: 220, height: 120 },
      zIndex: 1,
      data: { title: 'My Doc' },
      content: {
        id: 'root',
        blocks: [
          {
            id: 'body',
            kind: 'text',
            binding: { path: '/title' },
          },
        ],
      },
    } as unknown as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('My Doc');
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
      `"<div data-node-id="annotation-1" class="absolute select-none cursor-grab" style="left:0;top:0;width:220px;height:120px;z-index:1;transform-origin:center center"><div class="w-full h-full rounded-lg border-2 shadow-lg overflow-hidden bg-[var(--node-bg)] transition-colors duration-150 border-[var(--node-border)]"><div class="flex min-h-0 flex-col"><div class="flex items-center gap-2 px-3 py-2" style="background-color:var(--node-header-bg);border-bottom:1px solid var(--node-divider)"><button type="button" class="flex-shrink-0 text-[10px]" style="color:var(--node-fg-secondary)">▼</button><span class="flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium" style="background-color:#eab30820;color:#eab308">NOTE</span><span class="min-w-0 flex-1 truncate text-sm font-medium" style="color:var(--node-fg)">Note</span><button type="button" class="flex-shrink-0 rounded px-1 py-0.5 text-xs" style="color:var(--node-fg-secondary)">⛶</button></div><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div data-content-block-id="annotation-content" class="min-w-0"><label class="flex min-h-0 flex-1 flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Note</span><textarea class="min-h-[64px] resize-none rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]">Legacy note</textarea></label></div></div></div></div><div class="absolute z-30 derive-btn" style="right:-16px;top:50%;transform:translateY(-50%)"><button class="flex items-center justify-center rounded-full" style="width:28px;height:28px;background-color:var(--node-selected, #3b82f6);color:#fff;border:2px solid var(--node-bg, #1e1e1e);font-size:16px;font-weight:bold;line-height:1;cursor:pointer" title="添加后继节点">+</button></div></div>"`,
    );
  });

  it('renders migrated shot generation preview from selected candidate data', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 3,
          visualDescription: 'Selected image',
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'data:image/png;base64,aaa',
              prompt: 'first',
              timestamp: 1,
              selected: true,
            },
          ],
        },
      }),
      id: 'shot-1',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data:image/png;base64,aaa');
    expect(markup).toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).not.toContain('Legacy path');
  });

  it('keeps composable node content visible when the node is not selected', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          duration: 3,
          visualDescription: 'Wide establishing frame',
          characterAction: 'Look toward the skyline',
        },
      }),
      id: 'shot-unselected',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data-content-block-id="shot-status"');
    expect(markup).toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).toContain('data-content-block-id="shot-visual-description"');
    expect(markup).toContain('data-content-block-id="shot-character-action"');
    expect(markup).toContain('Detail');
    expect(markup).not.toContain('Legacy path');
  });

  it('builds persistent container collapse updates without changing non-container nodes', () => {
    const containerNode = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        data: {},
      }),
      id: 'scene-container',
      container: {
        policy: 'scene',
        childIds: ['shot-1'],
        metadata: { tone: 'quiet' },
      },
    } as CanvasNode;
    const leafNode = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 1,
      data: {},
    }) as CanvasNode;

    expect(createNodeCollapseUpdate(containerNode, true)).toEqual({
      container: {
        policy: 'scene',
        childIds: ['shot-1'],
        metadata: { tone: 'quiet' },
        collapsed: true,
      },
    });
    expect(createNodeCollapseUpdate(leafNode, true)).toBeUndefined();
  });

  it('renders project nodes through the default composable preset when unselected', () => {
    const node = {
      id: 'project-1',
      type: 'project',
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      zIndex: 0,
      data: {
        projectPath: 'projects/demo.nkv',
        projectTitle: 'Demo',
        projectType: 'nkv',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data-content-block-id="project-asset-preview"');
    expect(markup).toContain('Video Project');
    expect(markup).not.toContain('Legacy path');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('renders migrated scene child slot summaries and action buttons', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Arrival', sceneNumber: 1 },
      }),
      id: 'scene-1',
      container: { policy: 'scene', childIds: ['shot-1'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: { shotNumber: 1, visualDescription: 'Train door' },
      }),
      id: 'shot-1',
      parentId: 'scene-1',
      preview: {
        nodeId: 'shot-1',
        title: 'Shot 1',
        subtitle: 'Train door',
        role: 'node-summary',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: { ...createContext(scene, [scene, shot]), isSelected: true },
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Shot 1');
    expect(markup).toContain('Assign selected');
    expect(markup).toContain('Auto layout');
    expect(markup).not.toContain('Legacy path');
  });

  it('renders migrated gallery container with childSlots layout', () => {
    const node = {
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          rows: 1,
          cols: 3,
        },
      }),
      id: 'gallery-1',
      container: {
        policy: 'gallery',
        childIds: [],
        layout: { mode: 'gallery' },
        acceptedChildren: { nodeTypes: ['media'] },
        deleteBehavior: 'delete-subtree',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Mika');
    expect(markup).toContain('No views (drag media here)');
    expect(markup).toContain('grid-template-columns:repeat(3, 1fr)');
    expect(markup).not.toContain('Legacy path');
  });

  it('covers migrated core preset render parity surfaces', () => {
    const nodes = [
      {
        ...buildCanvasNode({
          type: 'shot',
          position: { x: 0, y: 0 },
          zIndex: 0,
          preset: 'shot.basic',
          data: {
            shotNumber: 5,
            visualDescription: 'Door opens',
            duration: 3,
            generationStatus: 'done',
            generationHistory: [
              {
                id: 'candidate-1',
                dataUrl: 'data:image/png;base64,shot',
                prompt: 'door',
                timestamp: 1,
                selected: true,
              },
            ],
          },
        }),
        id: 'shot-parity',
      },
      {
        ...buildCanvasNode({
          type: 'scene',
          position: { x: 0, y: 260 },
          zIndex: 0,
          preset: 'scene.basic',
          data: { sceneTitle: 'Arrival', sceneNumber: 1, location: 'Station' },
        }),
        id: 'scene-parity',
      },
      {
        ...buildCanvasNode({
          type: 'gallery',
          position: { x: 320, y: 0 },
          zIndex: 0,
          preset: 'gallery.basic',
          data: {
            characterName: 'Mika',
            cells: [
              {
                id: 'front',
                label: 'front',
                image: 'data:image/png;base64,front',
                generationStatus: 'done',
              },
            ],
          },
        }),
        id: 'gallery-parity',
      },
      {
        ...buildCanvasNode({
          type: 'media',
          position: { x: 320, y: 260 },
          zIndex: 0,
          preset: 'media.basic',
          data: { assetPath: 'assets/ref.png', mediaType: 'image' },
        }),
        id: 'media-parity',
      },
      {
        ...buildCanvasNode({
          type: 'project',
          position: { x: 640, y: 260 },
          zIndex: 0,
          data: {
            projectPath: 'projects/demo.nkp',
            projectTitle: 'Puppet Demo',
            projectType: 'nkp',
          },
        }),
        id: 'project-parity',
      },
    ] as CanvasNode[];

    const markup = nodes
      .map((node) =>
        renderToStaticMarkup(
          React.createElement(NodeContentDispatcher, {
            context: createContext(node, nodes),
            renderLegacy: () => React.createElement('div', null, 'Legacy path'),
          }),
        ),
      )
      .join('\n');

    expect(markup).toContain('data-node-id="shot-parity"');
    expect(markup).toContain('data-content-block-id="shot-status"');
    expect(markup).toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).toContain('data:image/png;base64,shot');
    expect(markup).toContain('data-content-block-id="shot-visual-description"');
    expect(markup).toContain('data-node-id="scene-parity"');
    expect(markup).toContain('No children');
    expect(markup).toContain('data-content-block-id="scene-title"');
    expect(markup).toContain('data-node-id="gallery-parity"');
    expect(markup).toContain('data-content-block-id="gallery-global-prompt"');
    expect(markup).toContain('Character Profile');
    expect(markup).toContain('No views (drag media here)');
    expect(markup).toContain('data-node-id="media-parity"');
    expect(markup).toContain('data-content-block-id="media-asset-preview"');
    expect(markup).toContain('data-node-id="project-parity"');
    expect(markup).toContain('data-content-block-id="project-asset-preview"');
    expect(markup).toContain('Puppet');
    expect(markup).not.toContain('Legacy path');
  });
});
