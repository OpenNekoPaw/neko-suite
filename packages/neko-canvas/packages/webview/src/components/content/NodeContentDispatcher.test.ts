import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, CanvasNode, CanvasViewport } from '@neko/shared';
import { NodeContentDispatcher } from './NodeContentDispatcher';
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

  it('renders migrated scene child slot summaries and action buttons', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Arrival', sceneNumber: 1, shotIds: [] },
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

  it('renders migrated gallery cells through collection metadata', () => {
    const node = {
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
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
      id: 'gallery-1',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('front');
    expect(markup).toContain('data:image/png;base64,front');
    expect(markup).toContain('data-content-block-id="gallery-cell-collection"');
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

    expect(markup).toMatchInlineSnapshot(`
      "<div data-node-id="shot-parity" class="absolute select-none cursor-grab" style="left:0;top:0;width:220px;height:200px;z-index:0;transform-origin:center center"><div class="w-full h-full rounded-lg border-2 shadow-lg overflow-hidden bg-[var(--node-bg)] transition-colors duration-150 border-[var(--node-border)]"><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div class="flex min-w-0 flex-row gap-2 p-2"><div data-content-block-id="shot-status" class="min-w-0"><span class="inline-flex max-w-full items-center self-start rounded border border-[var(--node-border)] px-2 py-0.5 text-xs text-[var(--node-fg-secondary)]"><span class="truncate">done</span></span></div><div data-content-block-id="shot-scale" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Scale</span><select class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"><option value="ECU">ECU</option><option value="CU">CU</option><option value="MCU">MCU</option><option value="MS" selected="">MS</option><option value="MLS">MLS</option><option value="LS">LS</option><option value="VLS">VLS</option><option value="ELS">ELS</option></select></label></div><div data-content-block-id="camera-movement" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Move</span><select class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"><option value="static">static</option><option value="pan">pan</option><option value="tilt">tilt</option><option value="zoom-in">zoom-in</option><option value="zoom-out">zoom-out</option><option value="dolly">dolly</option><option value="dolly-in">dolly-in</option><option value="dolly-out">dolly-out</option><option value="handheld">handheld</option><option value="crane">crane</option></select></label></div><div data-content-block-id="camera-angle" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Angle</span><select class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"><option value="eye-level">eye-level</option><option value="high-angle">high-angle</option><option value="low-angle">low-angle</option><option value="bird-eye">bird-eye</option><option value="dutch">dutch</option></select></label></div><div data-content-block-id="shot-duration" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Duration</span><input type="number" class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]" value="3"/></label></div></div><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div data-content-block-id="shot-generated-preview" class="min-w-0"><div class="relative flex min-h-[80px] items-center justify-center overflow-hidden rounded border border-[var(--node-border)] bg-black/20"><img src="data:image/png;base64,shot" alt="Generated Image" class="h-full w-full object-cover"/></div></div></div><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div data-content-block-id="shot-visual-description" class="min-w-0"><label class="flex min-h-0 flex-1 flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Visual</span><textarea class="min-h-[64px] resize-none rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]">Door opens</textarea></label></div><div data-content-block-id="shot-character-action" class="min-w-0"><label class="flex min-h-0 flex-1 flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Action</span><textarea class="min-h-[64px] resize-none rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"></textarea></label></div><div data-content-block-id="shot-characters" class="min-w-0"><ul class="space-y-1 text-xs text-[var(--node-fg-secondary)]"></ul></div><div data-content-block-id="shot-emotion" class="min-w-0"><div class="flex flex-wrap gap-1"></div></div><div data-content-block-id="shot-scene-tags" class="min-w-0"><div class="flex flex-wrap gap-1"></div></div></div></div></div><div class="absolute z-30 derive-btn" style="right:-16px;top:50%;transform:translateY(-50%)"><button class="flex items-center justify-center rounded-full" style="width:28px;height:28px;background-color:var(--node-selected, #3b82f6);color:#fff;border:2px solid var(--node-bg, #1e1e1e);font-size:16px;font-weight:bold;line-height:1;cursor:pointer" title="添加后继节点">+</button></div><div data-port-id="img-out" data-port-type="output" data-node-id="shot-parity" data-anchor="right" style="position:absolute;width:14px;height:14px;border-radius:50%;background-color:#f59e0b;border:2px solid var(--node-bg);cursor:crosshair;z-index:10;right:-7px;top:50%;transform:translateY(-50%)" class="transition-all duration-150 scale-75 opacity-60 hover:scale-110 hover:opacity-100" title="Image"></div></div>
      <div data-node-id="scene-parity" class="absolute select-none cursor-grab" style="left:0;top:260px;width:640px;height:400px;z-index:0;transform-origin:center center"><div class="w-full h-full rounded-lg border-2 shadow-lg overflow-hidden bg-[var(--node-bg)] transition-colors duration-150 border-[var(--node-border)]"><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div class="space-y-1"></div><div class="flex min-w-0 flex-row gap-2 p-2"><div data-content-block-id="scene-number" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Scene</span><input type="number" class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]" value="1"/></label></div><div data-content-block-id="scene-title" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Title</span><input class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]" value="Arrival"/></label></div><div data-content-block-id="scene-location" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Location</span><input class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]" value="Station"/></label></div><div data-content-block-id="scene-time-of-day" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Time</span><input class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]" value=""/></label></div></div></div></div><div class="absolute z-30 derive-btn" style="right:-16px;top:50%;transform:translateY(-50%)"><button class="flex items-center justify-center rounded-full" style="width:28px;height:28px;background-color:var(--node-selected, #3b82f6);color:#fff;border:2px solid var(--node-bg, #1e1e1e);font-size:16px;font-weight:bold;line-height:1;cursor:pointer" title="添加后继节点">+</button></div><div data-port-id="in" data-port-type="input" data-node-id="scene-parity" data-anchor="left" style="position:absolute;width:14px;height:14px;border-radius:50%;background-color:#6b7280;border:2px solid var(--node-bg);cursor:crosshair;z-index:10;left:-7px;top:50%;transform:translateY(-50%)" class="transition-all duration-150 scale-75 opacity-60 hover:scale-110 hover:opacity-100" title="Input"><div class="absolute inset-[3px] rounded-full" style="background-color:var(--node-bg)"></div></div><div data-port-id="out" data-port-type="output" data-node-id="scene-parity" data-anchor="right" style="position:absolute;width:14px;height:14px;border-radius:50%;background-color:#6b7280;border:2px solid var(--node-bg);cursor:crosshair;z-index:10;right:-7px;top:50%;transform:translateY(-50%)" class="transition-all duration-150 scale-75 opacity-60 hover:scale-110 hover:opacity-100" title="Output"></div></div>
      <div data-node-id="gallery-parity" class="absolute select-none cursor-grab" style="left:320px;top:0;width:290px;height:160px;z-index:0;transform-origin:center center"><div class="w-full h-full rounded-lg border-2 shadow-lg overflow-hidden bg-[var(--node-bg)] transition-colors duration-150 border-[var(--node-border)]"><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div class="flex min-w-0 flex-row gap-2 p-2"><div data-content-block-id="gallery-preset" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Preset</span><select class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]"><option value="character-3view" selected="">character-3view</option><option value="character-4view">character-4view</option><option value="expression-9">expression-9</option><option value="turnaround-8">turnaround-8</option><option value="scene-views">scene-views</option><option value="custom">custom</option></select></label></div><div data-content-block-id="gallery-character-name" class="min-w-0"><label class="flex flex-col gap-1 text-xs text-[var(--node-fg-secondary)]"><span>Character</span><input class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 px-2 py-1 text-[var(--node-fg)] outline-none focus:border-[var(--node-selected)]" value="Mika"/></label></div></div><div class="grid min-w-0 grid-cols-2 gap-2 p-2"><div data-content-block-id="gallery-cell-collection" class="min-w-0"><div class="grid grid-cols-2 gap-1 text-xs text-[var(--node-fg-secondary)]"><div class="min-w-0 rounded border border-[var(--node-border)] bg-black/20 p-1.5"><div class="flex min-w-0 items-center gap-2"><img src="data:image/png;base64,front" alt="front" class="h-10 w-10 flex-shrink-0 rounded object-cover"/><div class="min-w-0"><div class="truncate text-xs text-[var(--node-fg)]">front</div><div class="truncate text-[10px] text-[var(--node-fg-secondary)]">done</div></div></div></div></div></div></div></div></div><div class="absolute z-30 derive-btn" style="right:-16px;top:50%;transform:translateY(-50%)"><button class="flex items-center justify-center rounded-full" style="width:28px;height:28px;background-color:var(--node-selected, #3b82f6);color:#fff;border:2px solid var(--node-bg, #1e1e1e);font-size:16px;font-weight:bold;line-height:1;cursor:pointer" title="添加后继节点">+</button></div><div data-port-id="img-out" data-port-type="output" data-node-id="gallery-parity" data-anchor="right" style="position:absolute;width:14px;height:14px;border-radius:50%;background-color:#f59e0b;border:2px solid var(--node-bg);cursor:crosshair;z-index:10;right:-7px;top:50%;transform:translateY(-50%)" class="transition-all duration-150 scale-75 opacity-60 hover:scale-110 hover:opacity-100" title="Reference"></div></div>
      <div data-node-id="media-parity" class="absolute select-none cursor-grab" style="left:320px;top:260px;width:280px;height:200px;z-index:0;transform-origin:center center"><div class="w-full h-full rounded-lg border-2 shadow-lg overflow-hidden bg-[var(--node-bg)] transition-colors duration-150 border-[var(--node-border)]"><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div class="flex min-h-0 min-w-0 flex-col gap-2 p-2"><div data-content-block-id="media-asset-preview" class="min-w-0"><div class="relative flex min-h-[80px] items-center justify-center overflow-hidden rounded border border-[var(--node-border)] bg-black/20"><img src="assets/ref.png" alt="Preview" class="h-full w-full object-cover"/><button type="button" class="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Open</button></div></div></div></div></div><div class="absolute z-30 derive-btn" style="right:-16px;top:50%;transform:translateY(-50%)"><button class="flex items-center justify-center rounded-full" style="width:28px;height:28px;background-color:var(--node-selected, #3b82f6);color:#fff;border:2px solid var(--node-bg, #1e1e1e);font-size:16px;font-weight:bold;line-height:1;cursor:pointer" title="添加后继节点">+</button></div><div data-port-id="out" data-port-type="output" data-node-id="media-parity" data-anchor="right" style="position:absolute;width:14px;height:14px;border-radius:50%;background-color:#6b7280;border:2px solid var(--node-bg);cursor:crosshair;z-index:10;right:-7px;top:50%;transform:translateY(-50%)" class="transition-all duration-150 scale-75 opacity-60 hover:scale-110 hover:opacity-100" title="Output"></div></div>"
    `);
  });
});
