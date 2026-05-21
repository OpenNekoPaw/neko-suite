import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderCanvasNode } from './nodeRendererRegistry';
import { createStoryboardNodeRendererRegistry } from '../../subsystems/storyboard/renderers';
import { createStoryboardNodeTypeDescriptors } from '../../subsystems/storyboard/descriptors';

describe('nodeRendererRegistry', () => {
  it('registers storyboard subsystem node renderers', () => {
    const registry = createStoryboardNodeRendererRegistry();

    expect(registry.script).toBeTypeOf('function');
    expect(registry.document).toBeTypeOf('function');
    expect(registry['canvas-embed']).toBeTypeOf('function');
    expect(registry.model).toBeTypeOf('function');
    expect(registry.annotation).toBeUndefined();
    expect(registry.text).toBeUndefined();
    expect(registry.media).toBeUndefined();
    expect(registry.shot).toBeUndefined();
    expect(registry.scene).toBeUndefined();
    expect(registry.gallery).toBeUndefined();
  });

  it('registers storyboard subsystem node descriptors separately from core', () => {
    const descriptors = createStoryboardNodeTypeDescriptors();

    expect(descriptors.shot?.tagLabel).toBe('SHOT');
    expect(descriptors.scene?.defaultSize).toEqual({ width: 640, height: 400 });
    expect(descriptors.annotation).toBeUndefined();
  });

  it('renders a fallback card for unsupported complete nodes', () => {
    const markup = renderToStaticMarkup(
      renderCanvasNode({}, {
        node: {
          id: 'future-1',
          type: 'future-node',
          position: { x: 0, y: 0 },
          size: { width: 240, height: 140 },
          zIndex: 1,
          data: { preserved: true },
        } as never,
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(markup).toContain('UNSUPPORTED');
    expect(markup).toContain('future-node');
    expect(markup).toContain('preserved');
  });
});
