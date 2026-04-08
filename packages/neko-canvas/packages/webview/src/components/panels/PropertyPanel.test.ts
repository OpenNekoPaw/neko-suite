import { describe, expect, it } from 'vitest';
import { createBuiltInNodePropertiesRendererRegistry } from './PropertyPanel';

describe('PropertyPanel node properties registry', () => {
  it('registers built-in node property renderers', () => {
    const registry = createBuiltInNodePropertiesRendererRegistry();

    expect(registry.annotation).toBeTypeOf('function');
    expect(registry.storyboard).toBeTypeOf('function');
    expect(registry.text).toBeTypeOf('function');
    expect(registry.group).toBeTypeOf('function');
    expect(registry.media).toBeTypeOf('function');
    expect(registry.shot).toBeTypeOf('function');
    expect(registry.scene).toBeTypeOf('function');
    expect(registry.gallery).toBeTypeOf('function');
  });
});
