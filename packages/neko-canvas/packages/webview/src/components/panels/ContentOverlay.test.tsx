// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanvasData, CanvasNode } from '@neko/shared';
import { ContentOverlay } from './ContentOverlay';
import { useCanvasStore } from '../../stores/canvasStore';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ContentOverlay', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setLocale('en');
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      contentOverlayState: { visible: false, nodeId: null },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('owns fullscreen content scrolling in the overlay body viewport', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 21,
          duration: 3,
          visualDescription: 'A dense shot with enough metadata to require scrolling.',
          characterAction: 'The creator-facing summary stays readable.',
          characters: [{ characterName: 'Lead', role: 'primary' }],
          dialogue: 'The useful content stays visible.',
          voiceOver: 'A concise note remains available.',
          soundCue: 'soft pulse',
          generationPrompt: 'Machine-facing prompt should stay behind details.',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-scroll',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const scrollRegion = host.querySelector<HTMLElement>(
      '[data-content-overlay-scroll-region="true"]',
    );
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.className).toContain('flex min-h-0 flex-1 flex-col overflow-auto');
    expect(host.querySelector('[data-shot-creator-overlay="true"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-summary="true"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-preview="true"]')).not.toBeNull();
    expect(host.querySelector('[data-content-block-id="shot-generated-preview"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-details="true"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-details="true"]')?.hasAttribute('open')).toBe(
      false,
    );
    expect(host.textContent).toContain('A dense shot with enough metadata to require scrolling.');
    expect(host.textContent).toContain('The creator-facing summary stays readable.');
    expect(host.textContent).toContain('Lead (primary)');
    expect(host.textContent).toContain('The useful content stays visible.');
    expect(host.querySelector('[data-content-block-id="shot-visual-description"]')).toBeNull();
    expect(host.querySelector('[data-content-block-id="shot-generation-prompt"]')).toBeNull();
    expect(host.textContent).not.toContain('Machine-facing prompt should stay behind details.');
  });

  it('keeps scene storyboard table visible in fullscreen overlay', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneNumber: 5, sceneTitle: 'Fullscreen Scene' },
      }),
      id: 'scene-overlay-table',
      container: { policy: 'scene', childIds: ['shot-overlay-row'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          visualDescription: 'Visible fullscreen shot row',
          dialogue: 'The table is still here.',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-row',
      parentId: 'scene-overlay-table',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([scene, shot]),
      selection: { nodeIds: [scene.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={scene.id} onClose={() => undefined} />);
    });

    expect(
      host
        .querySelector('[data-container-section-id="scene-root"]')
        ?.getAttribute('data-container-section-fill'),
    ).toBe('fill');
    expect(host.querySelector('[data-scene-shot-table="true"]')).not.toBeNull();
    expect(host.querySelector('[data-scene-shot-table-row-id="shot-overlay-row"]')).not.toBeNull();
    expect(host.textContent).toContain('Visible fullscreen shot row');
    expect(host.textContent).toContain('The table is still here.');
  });
});

function createCanvasData(nodes: CanvasNode[]): CanvasData {
  return {
    version: '2.1',
    name: 'Test Canvas',
    nodes,
    connections: [],
  };
}
