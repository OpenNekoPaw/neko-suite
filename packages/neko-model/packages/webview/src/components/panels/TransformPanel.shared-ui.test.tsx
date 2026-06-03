// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransformPanel } from './TransformPanel';
import type { SceneNodeSnapshot } from '../../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'transform.translate': 'Translate',
        'controlAvailability.state.degraded': 'Degraded',
        'controlAvailability.reason.runtime-rejected': 'Runtime rejected',
      };
      return messages[key] ?? key;
    },
  }),
}));

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Model TransformPanel shared UI migration', () => {
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

  it('renders transform properties through shared PropertyPanel and commits numeric values', () => {
    const onTransformCommit = vi.fn();

    act(() => {
      root.render(
        <TransformPanel
          node={createNode()}
          onTransformCommit={onTransformCommit}
          onTransformModeChange={vi.fn()}
          transformMode="translate"
        />,
      );
    });

    const positionX = host.querySelector<HTMLInputElement>(
      '[data-property-id="position.x"] input[type="number"]',
    );
    expect(positionX).not.toBeNull();

    act(() => {
      setInputValue(positionX, '4.25');
      positionX?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      positionX?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });

    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    expect(onTransformCommit.mock.calls[0]?.[0]).toBe('node-1');
    expect(onTransformCommit.mock.calls[0]?.[1].position.x).toBe(4.25);
  });

  it('shows runtime rejection as a local degraded reason without removing the selected node', () => {
    act(() => {
      root.render(
        <TransformPanel
          node={createNode()}
          availability={{
            state: 'degraded',
            reason: 'runtime-rejected',
            retryable: true,
            diagnostic: { code: 'scene-command.rejected', message: 'Rejected by Engine' },
          }}
          onTransformCommit={vi.fn()}
          onTransformModeChange={vi.fn()}
          transformMode="translate"
        />,
      );
    });

    expect(host.textContent).toContain('Node 1');
    expect(host.querySelector('[data-availability-reason="runtime-rejected"]')).not.toBeNull();
    expect(buttonByText('Translate').title).toBe('Translate - Degraded: Runtime rejected');
  });
});

function createNode(): SceneNodeSnapshot {
  return {
    nodeId: 'node-1',
    name: 'Node 1',
    kind: 'mesh',
    visible: true,
    children: [],
    transform: {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  } as SceneNodeSnapshot;
}

function setInputValue(input: HTMLInputElement | null, value: string): void {
  if (!input) return;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text,
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}
