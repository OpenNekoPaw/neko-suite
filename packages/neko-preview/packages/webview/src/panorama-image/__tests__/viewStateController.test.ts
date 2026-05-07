import { describe, expect, it } from 'vitest';
import { ViewStateController } from '../viewStateController';

describe('ViewStateController', () => {
  it('updates yaw, pitch, and fov locally without messaging dependencies', () => {
    const controller = new ViewStateController();

    const dragged = controller.applyDrag(100, -50);
    const zoomed = controller.applyWheel(-200);

    expect(dragged.yawDeg).not.toBe(0);
    expect(dragged.pitchDeg).not.toBe(0);
    expect(zoomed.fovDeg).toBeLessThan(75);
  });

  it('switches modes and clamps values', () => {
    const controller = new ViewStateController({ fovDeg: 500, pitchDeg: 500 });

    expect(controller.state.fovDeg).toBe(120);
    expect(controller.state.pitchDeg).toBe(89);
    expect(controller.setMode('little-planet').mode).toBe('little-planet');
    expect(controller.reset().mode).toBe('sphere');
  });

  it('keeps high-frequency view changes inside the controller surface', () => {
    const controller = new ViewStateController();

    for (let index = 0; index < 20; index += 1) {
      controller.applyDrag(4, -2);
      controller.applyWheel(index % 2 === 0 ? -1 : 1);
    }

    expect(controller.state.yawDeg).not.toBe(0);
    expect(Object.keys(controller.state)).toEqual([
      'mode',
      'yawDeg',
      'pitchDeg',
      'rollDeg',
      'fovDeg',
      'exposure',
      'toneMapping',
    ]);
  });
});
