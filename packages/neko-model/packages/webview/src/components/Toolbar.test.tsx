// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';
import { useModelStore } from '../stores/modelStore';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@neko/shared/vscode', () => ({
  postMessage: vi.fn(),
}));

describe('Model Toolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

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
    useModelStore.setState({
      cameraRadius: 2.2,
      showViewportGrid: true,
    });
  });

  it('renders a right dock visibility toggle at the bottom of the left toolbar', () => {
    const onToggleRightDock = vi.fn();

    act(() => {
      root.render(
        <Toolbar isRightDockVisible={true} onToggleRightDock={onToggleRightDock} width={48} />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label="toolbar.hideRightDock"]',
    );

    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-controls')).toBe('model-right-dock');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      toggle?.click();
    });

    expect(onToggleRightDock).toHaveBeenCalledTimes(1);
  });

  it('uses the show label when the right dock is collapsed', () => {
    act(() => {
      root.render(<Toolbar isRightDockVisible={false} onToggleRightDock={vi.fn()} width={48} />);
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label="toolbar.showRightDock"]',
    );

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps high-value viewport commands in the left toolbar', () => {
    const onCameraChange = vi.fn();
    const onCameraMutated = vi.fn();
    useModelStore.setState({ cameraRadius: 2, showViewportGrid: true });

    act(() => {
      root.render(
        <Toolbar
          isRightDockVisible={true}
          onCameraChange={onCameraChange}
          onCameraMutated={onCameraMutated}
          onToggleRightDock={vi.fn()}
          width={48}
        />,
      );
    });

    const grid = buttonByLabel(host, 'viewport.grid');
    const reset = buttonByLabel(host, 'viewport.resetCamera');

    expect(buttonByLabel(host, 'viewport.zoomIn')).toBeNull();
    expect(buttonByLabel(host, 'viewport.zoomOut')).toBeNull();
    expect(grid).not.toBeNull();
    expect(grid?.getAttribute('aria-pressed')).toBe('true');
    expect(reset).not.toBeNull();

    act(() => {
      grid?.click();
    });
    expect(useModelStore.getState().showViewportGrid).toBe(false);

    act(() => {
      reset?.click();
    });
    expect(onCameraMutated).toHaveBeenCalledTimes(1);
    expect(onCameraChange).toHaveBeenCalledTimes(1);
  });
});

function buttonByLabel(host: ParentNode, label: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}
