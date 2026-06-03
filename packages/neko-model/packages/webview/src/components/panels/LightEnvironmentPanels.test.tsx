// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneNodeSnapshot } from '../../types';
import { EnvironmentPanel } from './EnvironmentPanel';
import { LightInspectorPanel } from './LightInspectorPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'controlAvailability.state.disabled': 'Unavailable',
        'controlAvailability.reason.capability-unsupported': 'Capability unsupported',
      };
      return messages[key] ?? key;
    },
  }),
}));

let host: HTMLDivElement;
let root: Root;

describe('Light and Environment panels', () => {
  beforeEach(() => {
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

  it('compiles light edits to callbacks using acknowledged node identity', () => {
    const onLightUpdate = vi.fn();
    const onDeleteLight = vi.fn();
    render(
      <LightInspectorPanel
        node={lightNode()}
        onAddLight={vi.fn()}
        onDeleteLight={onDeleteLight}
        onSetVisible={vi.fn()}
        onLightUpdate={onLightUpdate}
      />,
    );

    const intensity = inputByLabel('Intensity');
    act(() => {
      setInputValue(intensity, '8');
      intensity.dispatchEvent(new Event('input', { bubbles: true }));
      intensity.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    act(() => buttonByText('Delete').click());

    expect(onLightUpdate.mock.calls[0]?.[0]).toBe('key_light');
    expect(onLightUpdate.mock.calls[0]?.[1].intensity).toBe(8);
    expect(onDeleteLight).toHaveBeenCalledWith('key_light');
  });

  it('renders environment diagnostics and emits update, retry, and clear commands', () => {
    const onUpdate = vi.fn();
    const onRetry = vi.fn();
    const onClear = vi.fn();
    const onPickPanorama = vi.fn();
    render(
      <EnvironmentPanel
        environment={{
          environmentId: 'scene-environment',
          mode: 'background-and-ibl',
          rotationDeg: 10,
          intensity: 1,
          exposure: 0,
          visibleAsBackground: true,
        }}
        diagnostics={[
          {
            code: 'environment.pending',
            severity: 'warning',
            message: 'Still loading',
            retryable: true,
          },
        ]}
        onSet={vi.fn()}
        onUpdate={onUpdate}
        onClear={onClear}
        onRetry={onRetry}
        onPickPanorama={onPickPanorama}
      />,
    );

    const rotation = inputByLabel('Rotation');
    act(() => {
      setInputValue(rotation, '42');
      rotation.dispatchEvent(new Event('input', { bubbles: true }));
      rotation.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    act(() => {
      buttonByText('Panorama').click();
      buttonByText('Retry').click();
      buttonByText('Clear').click();
    });

    expect(host.textContent).toContain('environment.pending');
    expect(onUpdate.mock.calls[0]?.[0].rotationDeg).toBe(42);
    expect(onPickPanorama).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('surfaces disabled reasons for light and environment controls', () => {
    render(
      <LightInspectorPanel
        node={null}
        disabled={true}
        availability={{ state: 'disabled', reason: 'capability-unsupported' }}
        onAddLight={vi.fn()}
        onDeleteLight={vi.fn()}
        onSetVisible={vi.fn()}
        onLightUpdate={vi.fn()}
      />,
    );

    expect(
      host.querySelector('[data-availability-reason="capability-unsupported"]'),
    ).not.toBeNull();
    expect(buttonByText('point').title).toBe(
      'Add point light - Unavailable: Capability unsupported',
    );

    act(() => {
      root.render(
        <EnvironmentPanel
          environment={null}
          diagnostics={[]}
          disabled={true}
          availability={{ state: 'disabled', reason: 'capability-unsupported' }}
          onSet={vi.fn()}
          onUpdate={vi.fn()}
          onClear={vi.fn()}
          onRetry={vi.fn()}
          onPickPanorama={vi.fn()}
        />,
      );
    });

    expect(
      host.querySelector('[data-availability-reason="capability-unsupported"]'),
    ).not.toBeNull();
    expect(buttonByText('Panorama').title).toBe(
      'Choose LDR panorama - Unavailable: Capability unsupported',
    );
  });
});

function render(node: React.ReactElement): void {
  act(() => {
    root.render(node);
  });
}

function lightNode(): SceneNodeSnapshot {
  return {
    nodeId: 'key_light',
    name: 'Key Light',
    kind: 'light',
    children: [],
    visible: true,
    light: {
      nodeId: 'key_light',
      kind: 'point',
      color: { x: 1, y: 1, z: 1 },
      intensity: 4,
      range: 12,
    },
  };
}

function inputByLabel(label: string): HTMLInputElement {
  const labels = [...host.querySelectorAll<HTMLLabelElement>('label')];
  const match = labels.find((item) => item.textContent?.includes(label));
  const input = match?.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error(`Input not found: ${label}`);
  return input;
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
