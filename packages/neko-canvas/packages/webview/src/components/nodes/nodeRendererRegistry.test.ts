import { describe, expect, it } from 'vitest';
import { createBuiltInNodeRendererRegistry } from './nodeRendererRegistry';

describe('nodeRendererRegistry', () => {
  it('registers built-in canvas node renderers', () => {
    const registry = createBuiltInNodeRendererRegistry();

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
});
