import { describe, expect, it } from 'vitest';
import { isDomNode, isNodeLibraryDragLeavingCanvas } from './useDragDrop';

describe('useDragDrop node-library drag helpers', () => {
  it('recognizes DOM-like nodes in the node test environment', () => {
    const nodeLike = { nodeType: 1 } as unknown as EventTarget;
    const eventTargetLike = {} as EventTarget;

    expect(isDomNode(nodeLike)).toBe(true);
    expect(isDomNode(eventTargetLike)).toBe(false);
    expect(isDomNode(null)).toBe(false);
  });

  it('keeps node-library drag feedback while moving inside the canvas', () => {
    const insideTarget = { nodeType: 1 } as unknown as Node;
    const canvasElement = {
      contains: (target: Node) => target === insideTarget,
    } as HTMLDivElement;

    expect(isNodeLibraryDragLeavingCanvas({ relatedTarget: insideTarget }, canvasElement)).toBe(
      false,
    );
    expect(isNodeLibraryDragLeavingCanvas({ relatedTarget: null }, canvasElement)).toBe(true);
    expect(
      isNodeLibraryDragLeavingCanvas(
        { relatedTarget: { nodeType: 1 } as unknown as EventTarget },
        canvasElement,
      ),
    ).toBe(true);
  });
});
