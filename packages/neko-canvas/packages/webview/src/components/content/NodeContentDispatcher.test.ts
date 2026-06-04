import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, CanvasNode, CanvasViewport } from '@neko/shared';
import { createNodeCollapseUpdate, NodeContentDispatcher } from './NodeContentDispatcher';
import type { NodeRendererContext } from '../nodes/nodeRendererTypes';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { setLocale } from '../../i18n';

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

afterEach(() => {
  setLocale('en');
});

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

    expect(markup).toContain('data-node-density="compact"');
    expect(markup).toContain('data-node-overflow="scroll"');
    expect(markup).toContain('flex-1 resize-none');
    expect(markup).toContain('<textarea');
  });

  it('clamps tiny composable nodes to their minimum render size and scrolls overflow', () => {
    const node = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Tiny Scene', sceneNumber: 4 },
      }),
      id: 'scene-tiny',
      size: { width: 90, height: 60 },
      container: { policy: 'scene', childIds: [] },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('width:320px');
    expect(markup).toContain('height:220px');
    expect(markup).toContain('data-node-density="compact"');
    expect(markup).toContain('data-node-overflow="scroll"');
    expect(markup).toContain('flex min-h-0 min-w-0 flex-1 flex-col overflow-auto');
    expect(markup).not.toContain('Legacy path');
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

  it('renders migrated shot preview from a reference image before generation', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 4,
          visualDescription: 'Imported comic panel',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-reference',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data:image/png;base64,reference');
    expect(markup).toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).not.toContain('Legacy path');
  });

  it('renders migrated shot preview from a materialized document reference image', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 5,
          visualDescription: 'Imported comic panel',
          referenceImagePath: '/cache/page-1.jpg',
          referenceImageResourceRef: {
            kind: 'document-entry',
            source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
            entryPath: 'OPS/page-1.jpg',
            cachePath: '/cache/page-1.jpg',
            versionPolicy: 'read-only-source',
          },
          runtimeReferenceImagePath:
            'https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg',
        },
      }),
      id: 'shot-runtime-reference',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg');
    expect(markup).toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).not.toContain('src="/cache/page-1.jpg"');
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

  it('localizes composable shot control values', () => {
    setLocale('zh-cn');

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
          shotScale: 'MS',
          cameraMovement: 'static',
          cameraAngle: 'eye-level',
          generationStatus: 'idle',
        },
      }),
      id: 'shot-localized',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('空闲');
    expect(markup).toContain('MS — 中景');
    expect(markup).toContain('静止');
    expect(markup).toContain('平视');
    expect(markup).not.toContain('&gt;idle&lt;');
    expect(markup).not.toContain('&gt;static&lt;');
    expect(markup).not.toContain('&gt;eye-level&lt;');
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

  it('renders collapsed composable containers at header height only', () => {
    const node = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Collapsed Scene', sceneNumber: 1 },
      }),
      id: 'scene-collapsed',
      container: { policy: 'scene', childIds: [], collapsed: true },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('height:42px');
    expect(markup).toContain('Collapsed Scene');
    expect(markup).not.toContain('data-content-block-id="scene-title"');
    expect(markup).not.toContain('data-child-slot-id="scene-children"');
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

  it('renders scene shot children as a single horizontal progress rail', () => {
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
    expect(markup).toContain('data-child-slot-id="scene-children"');
    expect(markup).toContain('data-child-slot-variant="summary-large"');
    expect(markup).toContain('data-child-slot-kind="scene-shot-rail"');
    expect(markup).toContain('data-child-slot-card-height="210"');
    expect(markup).toContain('data-child-slot-card-max-height="210"');
    expect(markup).toContain('data-scene-shot-rail="true"');
    expect(markup).toContain('data-scene-shot-card-id="shot-1"');
    expect(markup).toContain('data-scene-shot-card-layout="rail"');
    expect(markup).toContain('data-scene-shot-card-height="210px"');
    expect(markup).toContain('Shot progress');
    expect(markup).toContain('Train door');
    expect(markup).toContain('Detail');
    expect(markup).not.toContain('data-child-card-layout="detail"');
    expect(markup).not.toContain('data-child-detail-id="shot-1"');
    expect(markup).not.toContain('Visual');
    expect(markup).not.toContain('data-node-card-id="shot-1"');
    expect(markup).not.toContain('Legacy path');
  });

  it('renders parent-linked scene children even when container childIds are stale', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Parent Linked', sceneNumber: 3 },
      }),
      id: 'scene-parent-linked',
      container: { policy: 'scene', childIds: [] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: { shotNumber: 7, visualDescription: 'Visible through parentId' },
      }),
      id: 'shot-parent-linked',
      parentId: 'scene-parent-linked',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, shot]),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data-child-slot-id="scene-children"');
    expect(markup).toContain('data-child-slot-kind="scene-shot-rail"');
    expect(markup).toContain('data-scene-shot-card-id="shot-parent-linked"');
    expect(markup).toContain('Shot 7');
    expect(markup).toContain('Visible through parentId');
    expect(markup).not.toContain('No shots');
    expect(markup).not.toContain('Legacy path');
  });

  it('keeps scene shot rail horizontal when a scene container is narrow', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Narrow', sceneNumber: 2 },
      }),
      id: 'scene-narrow',
      size: { width: 340, height: 240 },
      container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
    } as CanvasNode;
    const children = ['shot-1', 'shot-2'].map(
      (id, index) =>
        ({
          ...buildCanvasNode({
            type: 'shot',
            position: { x: 20 + index * 20, y: 20 },
            zIndex: index + 1,
            preset: 'shot.basic',
            data: { shotNumber: index + 1, visualDescription: `Beat ${index + 1}` },
          }),
          id,
          parentId: 'scene-narrow',
        }) as CanvasNode,
    );

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, ...children]),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data-node-density="compact"');
    expect(markup).toContain('data-child-slot-variant="summary-large"');
    expect(markup).toContain('data-child-slot-kind="scene-shot-rail"');
    expect(markup).toContain('data-child-slot-card-height="150"');
    expect(markup).toContain('data-child-slot-card-max-height="210"');
    expect(markup).toContain('data-scene-shot-rail="true"');
    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('flex-nowrap');
    expect(markup).toContain('data-scene-shot-card-id="shot-1"');
    expect(markup).toContain('data-scene-shot-card-id="shot-2"');
    expect(markup).toContain('Beat 1');
    expect(markup).toContain('Beat 2');
    expect(markup).not.toContain('data-child-card-layout="detail"');
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
    expect(markup).toContain('3-View Character');
    expect(markup).toContain('0 views');
    expect(markup).not.toContain('0 cells');
    expect(markup).toContain('data-child-slot-id="gallery-children"');
    expect(markup).toContain('data-child-slot-variant="gallery"');
    expect(markup).toContain('data-child-slot-kind="gallery-grid"');
    expect(markup).toContain('data-child-slot-card-height="170"');
    expect(markup).not.toContain('data-content-block-id="gallery-global-prompt"');
    expect(markup).not.toContain('Character Profile');
    expect(markup).not.toContain('Legacy path');
  });

  it('shows gallery advanced fields only in expanded content context', () => {
    const node = {
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          globalPromptPrefix: 'clean reference lighting',
          characterProfile: { description: 'A tall elf' },
        },
      }),
      id: 'gallery-expanded',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: { ...createContext(node), isExpanded: true },
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Advanced');
    expect(markup).toContain('Character Profile');
    expect(markup).not.toContain('data-content-block-id="gallery-global-prompt"');
  });

  it('renders gallery children as image-first grid cards instead of a horizontal rail', () => {
    const gallery = {
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
      id: 'gallery-with-children',
      size: { width: 560, height: 420 },
      container: {
        policy: 'gallery',
        childIds: ['media-front', 'media-side'],
        layout: { mode: 'gallery' },
        acceptedChildren: { nodeTypes: ['media'] },
        deleteBehavior: 'delete-subtree',
        childPlacements: {
          'media-front': {
            childId: 'media-front',
            metadata: {
              label: 'Front',
              prompt: 'Front view, neutral pose, clean reference lighting.',
              generationStatus: 'done',
            },
          },
          'media-side': {
            childId: 'media-side',
            metadata: {
              label: 'Side',
              prompt: 'Side view with matching outfit details.',
              generationStatus: 'idle',
            },
          },
        },
      },
    } as CanvasNode;
    const mediaFront = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'media.basic',
        data: {
          assetPath: 'data:image/png;base64,front',
          mediaType: 'image',
        },
      }),
      id: 'media-front',
      parentId: 'gallery-with-children',
    } as CanvasNode;
    const mediaSide = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 40, y: 20 },
        zIndex: 2,
        preset: 'media.basic',
        data: {
          assetPath: 'data:image/png;base64,side',
          mediaType: 'image',
        },
      }),
      id: 'media-side',
      parentId: 'gallery-with-children',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(gallery, [gallery, mediaFront, mediaSide]),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('data-child-slot-id="gallery-children"');
    expect(markup).toContain('data-child-slot-kind="gallery-grid"');
    expect(markup).toContain('data-child-slot-variant="gallery"');
    expect(markup).toContain('data-child-slot-card-height="240"');
    expect(markup).toContain('data-gallery-child-card-id="media-front"');
    expect(markup).toContain('data-gallery-child-card-layout="visual-grid"');
    expect(markup).toContain('Front view, neutral pose, clean reference lighting.');
    expect(markup).toContain('Done');
    expect(markup).toContain('data:image/png;base64,front');
    expect(markup).toContain('overflow-x-hidden');
    expect(markup).not.toContain('data-scene-shot-rail="true"');
    expect(markup).not.toContain('flex-nowrap');
    expect(markup).not.toContain('Legacy path');
  });

  it('renders group children as informative summary cards with remove actions', () => {
    const group = {
      ...buildCanvasNode({
        type: 'group',
        position: { x: 0, y: 0 },
        zIndex: 0,
        data: { label: 'Review Group', childIds: ['note-1', 'media-1'] },
      }),
      id: 'group-1',
    } as CanvasNode;
    const note = {
      ...buildCanvasNode({
        type: 'annotation',
        position: { x: 20, y: 20 },
        zIndex: 1,
        data: { content: 'Check the second beat before exporting.' },
      }),
      id: 'note-1',
      parentId: 'group-1',
    } as CanvasNode;
    const media = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 40, y: 40 },
        zIndex: 2,
        preset: 'media.basic',
        data: { assetPath: 'assets/ref.png', mediaType: 'image' },
      }),
      id: 'media-1',
      parentId: 'group-1',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(group, [group, note, media]),
        renderLegacy: () => React.createElement('div', null, 'Legacy path'),
      }),
    );

    expect(markup).toContain('Review Group');
    expect(markup).toContain('data-child-slot-id="group-children"');
    expect(markup).toContain('data-child-slot-kind="group-summary"');
    expect(markup).toContain('data-child-slot-variant="row"');
    expect(markup).toContain('data-child-slot-card-height="148"');
    expect(markup).toContain('data-group-child-card-id="note-1"');
    expect(markup).toContain('data-group-child-card-id="media-1"');
    expect(markup).toContain('data-group-child-card-height="148px"');
    expect(markup).toContain('Check the second beat before exporting.');
    expect(markup).toContain('ref.png');
    expect(markup).toContain('overflow-y-auto');
    expect(markup).toContain('overflow-x-hidden');
    expect(markup).toContain('Remove from group');
    expect(markup).toContain('Detail');
    expect(markup).not.toContain('Legacy path');
    expect(markup).not.toContain('group-node');
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
          type: 'group',
          position: { x: 640, y: 0 },
          zIndex: 0,
          data: { label: 'Review', childIds: [] },
        }),
        id: 'group-parity',
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
    expect(markup).toContain('No views (drag media here)');
    expect(markup).not.toContain('data-content-block-id="gallery-global-prompt"');
    expect(markup).not.toContain('Character Profile');
    expect(markup).toContain('data-node-id="media-parity"');
    expect(markup).toContain('data-content-block-id="media-asset-preview"');
    expect(markup).toContain('data-node-id="group-parity"');
    expect(markup).toContain('data-child-slot-id="group-children"');
    expect(markup).toContain('No children');
    expect(markup).toContain('data-node-id="project-parity"');
    expect(markup).toContain('data-content-block-id="project-asset-preview"');
    expect(markup).toContain('Puppet');
    expect(markup).not.toContain('Legacy path');
  });
});
