// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(host.querySelector('[data-shot-creator-prompt="true"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-shot-creator-prompt-source]')
        ?.getAttribute('data-shot-creator-prompt-source'),
    ).toBe('generationPrompt');
    expect(host.textContent).toContain('Custom override');
    expect(host.querySelector('textarea')?.value).toBe(
      'Machine-facing prompt should stay behind details.',
    );
    expect(host.querySelector('[data-content-block-id="shot-visual-description"]')).toBeNull();
    expect(host.querySelector('[data-content-block-id="shot-generation-prompt"]')).toBeNull();
  });

  it('shows an assembled prompt in the creator summary when no custom prompt is set', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          duration: 1,
          visualDescription: 'White title page with calligraphy.',
          characterAction: 'No character action.',
          characters: [],
          emotion: ['mysterious'],
          sceneTags: ['opening'],
          visualStyle: 'minimal ink',
          soundCue: 'soft ambient tone',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-assembled-prompt',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(
      host
        .querySelector('[data-shot-creator-prompt-source]')
        ?.getAttribute('data-shot-creator-prompt-source'),
    ).toBe('assembled');
    expect(host.textContent).toContain('Assembled from fields');
    expect(host.querySelector('textarea')?.value).toContain('White title page with calligraphy.');
    expect(host.querySelector('textarea')?.value).toContain('Style: minimal ink');
    expect(host.querySelector('textarea')?.value).toContain('Sound: soft ambient tone');
  });

  it('commits prompt edits as generationPrompt and cancels Escape edits', async () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 3,
          visualDescription: 'Field assembled prompt.',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-edit-prompt',
    } as CanvasNode;

    const updateNodeData = vi.fn();
    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
      updateNodeData,
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const textarea = host.querySelector('textarea');
    expect(textarea).not.toBeNull();

    await act(async () => {
      setTextareaValue(textarea!, 'Custom title prompt');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    expect(updateNodeData).toHaveBeenCalledWith(node.id, {
      generationPrompt: 'Custom title prompt',
    });

    updateNodeData.mockClear();

    await act(async () => {
      setTextareaValue(textarea!, 'Should not commit');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    expect(updateNodeData).not.toHaveBeenCalled();
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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
}
