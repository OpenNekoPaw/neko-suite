import {
  createFrame,
  createFrameLayer,
  insertFrame,
  removeFrame,
  getOnionSkinGhosts,
  getTotalFrameCount,
} from './frame-manager';
import type { OnionSkinConfig } from '../types/frame';

describe('createFrame', () => {
  it('returns correct defaults', () => {
    const f = createFrame('layer-1', 3);
    expect(f.layerId).toBe('layer-1');
    expect(f.index).toBe(3);
    expect(f.duration).toBe(1);
    expect(f.isKeyframe).toBe(true);
    expect(f.imageData).toBeNull();
    expect(f.id).toMatch(/^frame-/);
  });
});

describe('createFrameLayer', () => {
  it('has one initial frame at index 0', () => {
    const layer = createFrameLayer('BG');
    expect(layer.name).toBe('BG');
    expect(layer.frames).toHaveLength(1);
    expect(layer.frames[0]!.index).toBe(0);
    expect(layer.frames[0]!.layerId).toBe(layer.id);
  });
});

describe('insertFrame', () => {
  it('shifts subsequent frame indices', () => {
    const layer = createFrameLayer('L');
    // layer starts with one frame at index 0
    const updated = insertFrame(layer, 0);
    expect(updated.frames).toHaveLength(2);
    expect(updated.frames[0]!.index).toBe(0); // new frame
    expect(updated.frames[1]!.index).toBe(1); // shifted original
  });
});

describe('removeFrame', () => {
  it('removes frame and re-indexes', () => {
    let layer = createFrameLayer('L');
    layer = insertFrame(layer, 1);
    expect(layer.frames).toHaveLength(2);
    const idToRemove = layer.frames[0]!.id;
    const updated = removeFrame(layer, idToRemove);
    expect(updated.frames).toHaveLength(1);
    expect(updated.frames[0]!.index).toBe(0);
  });
});

describe('getOnionSkinGhosts', () => {
  it('returns empty when disabled', () => {
    const config: OnionSkinConfig = {
      enabled: false,
      prevCount: 2,
      nextCount: 1,
      prevOpacity: 0.3,
      nextOpacity: 0.2,
    };
    const layer = createFrameLayer('L');
    expect(getOnionSkinGhosts([layer], layer.id, 0, config)).toEqual([]);
  });
});

describe('getTotalFrameCount', () => {
  it('sums frame durations', () => {
    const layer = createFrameLayer('L');
    // One frame with duration=1
    expect(getTotalFrameCount(layer)).toBe(1);
    const extended = insertFrame(layer, 1);
    expect(getTotalFrameCount(extended)).toBe(2);
  });
});
