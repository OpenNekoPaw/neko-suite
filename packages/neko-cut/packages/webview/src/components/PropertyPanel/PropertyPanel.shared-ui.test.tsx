import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyPanel } from './PropertyPanel';
import type { ProjectDefaults, TimelineElement, Transform } from '../../types';
import { createDefaultElementTransform } from '../../types/animation';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../SpeedControl', () => ({
  SpeedControl: () => <div data-testid="speed-control" />,
}));

vi.mock('../TransitionPicker', () => ({
  TransitionPicker: () => <div data-testid="transition-picker" />,
}));

vi.mock('../ColorCorrection', () => ({
  ColorCorrectionPanel: () => <div data-testid="color-correction" />,
}));

vi.mock('../Effects', () => ({
  EffectsPanel: () => <div data-testid="effects-panel" />,
}));

vi.mock('../Mask', () => ({
  MaskPanel: () => <div data-testid="mask-panel" />,
}));

vi.mock('./AIActionsButton', () => ({
  AIActionsButton: () => <button type="button">AI</button>,
}));

vi.mock('./NormalizeLoudnessButton', () => ({
  NormalizeLoudnessButton: () => <button type="button">Normalize</button>,
}));

describe('Cut PropertyPanel shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('keeps preview and commit separated for shared transform controls', () => {
    const onElementChange = vi.fn();
    const onElementCommit = vi.fn();
    const element = createElement();

    act(() => {
      root.render(
        <PropertyPanel
          currentTime={0}
          element={element}
          projectDefaults={createDefaults()}
          onAddKeyframe={vi.fn()}
          onDefaultsChange={vi.fn()}
          onElementChange={onElementChange}
          onElementCommit={onElementCommit}
          onRemoveKeyframe={vi.fn()}
        />,
      );
    });

    const opacityInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="animTransform.opacity"] input[type="number"]',
    );
    expect(opacityInput).not.toBeNull();

    act(() => {
      setInputValue(opacityInput, '0.4');
      opacityInput?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onElementChange).toHaveBeenCalledTimes(1);
    expect(onElementCommit).not.toHaveBeenCalled();
    expect(onElementChange.mock.calls[0]?.[0]).toBe('element-1');
    expect(onElementChange.mock.calls[0]?.[1].animTransform.opacity.baseValue).toBe(0.4);

    act(() => {
      opacityInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(onElementCommit).toHaveBeenCalledTimes(1);
    expect(onElementCommit.mock.calls[0]?.[0]).toBe('element-1');
    expect(onElementCommit.mock.calls[0]?.[1].animTransform.opacity.baseValue).toBe(0.4);
  });

  it('routes shared keyframe toggle to add/remove callbacks', () => {
    const onAddKeyframe = vi.fn();
    const onRemoveKeyframe = vi.fn();
    const element = createElement();
    element.animTransform!.opacity.keyframes = [];

    act(() => {
      root.render(
        <PropertyPanel
          currentTime={0}
          element={element}
          projectDefaults={createDefaults()}
          onAddKeyframe={onAddKeyframe}
          onDefaultsChange={vi.fn()}
          onElementChange={vi.fn()}
          onElementCommit={vi.fn()}
          onRemoveKeyframe={onRemoveKeyframe}
        />,
      );
    });

    const keyframeButton = host.querySelector<HTMLButtonElement>(
      '[data-property-id="animTransform.opacity"] button[aria-pressed]',
    );

    act(() => {
      keyframeButton?.click();
    });

    expect(onAddKeyframe).toHaveBeenCalledWith('element-1', 'animTransform.opacity', 0.75);
    expect(onRemoveKeyframe).not.toHaveBeenCalled();
  });
});

function createElement(): TimelineElement {
  const animTransform = createDefaultElementTransform();
  animTransform.opacity = {
    baseValue: 0.75,
    keyframes: [{ id: 'kf-opacity', time: 0, value: 0.75, easing: 'linear' }],
  };

  return {
    id: 'element-1',
    type: 'media',
    name: 'Clip 1',
    src: '/clip.mp4',
    startTime: 0,
    duration: 10,
    trimStart: 0,
    trimEnd: 0,
    transform: createTransform(),
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    animTransform,
  };
}

function createDefaults(): ProjectDefaults {
  return {
    text: {
      fontSize: 48,
      fontFamily: 'Arial',
      color: '#ffffff',
      backgroundColor: 'transparent',
      textAlign: 'center',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
    },
    transform: {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    },
    audio: {
      volume: 1,
      pan: 0,
      fadeIn: 0,
      fadeOut: 0,
      gain: 0,
    },
  };
}

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}

function createTransform(): Transform {
  return {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
