// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSideToolbar } from './Toolbar';
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

vi.mock('@neko/ui/icons', async () => {
  const actual = await vi.importActual<typeof import('@neko/ui/icons')>('@neko/ui/icons');
  return {
    ...actual,
    DownloadIcon: ({ size = 16 }: { readonly size?: number }) => (
      <span data-icon="download">{size}</span>
    ),
    RightPanelIcon: ({ size = 16 }: { readonly size?: number }) => (
      <span data-icon="right-panel">{size}</span>
    ),
    RightPanelOffIcon: ({ size = 16 }: { readonly size?: number }) => (
      <span data-icon="right-panel-off">{size}</span>
    ),
    LayersIcon: ({ size = 16 }: { readonly size?: number }) => (
      <span data-icon="layers">{size}</span>
    ),
  };
});

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
  });

  it('renders a right dock visibility toggle at the bottom of the left toolbar', () => {
    const onToggleRightDock = vi.fn();

    act(() => {
      root.render(
        <ModelSideToolbar
          isViewportHudVisible={true}
          onToggleViewportHud={vi.fn()}
          isBottomPanelVisible={true}
          onToggleBottomPanel={vi.fn()}
          isRightDockVisible={true}
          onToggleRightDock={onToggleRightDock}
          width={48}
        />,
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
    expect(toggle?.getAttribute('data-creative-left-rail-target')).toBe('right-panel');

    act(() => {
      toggle?.click();
    });

    expect(onToggleRightDock).toHaveBeenCalledTimes(1);
  });

  it('uses the show label when the right dock is collapsed', () => {
    act(() => {
      root.render(
        <ModelSideToolbar
          isViewportHudVisible={true}
          onToggleViewportHud={vi.fn()}
          isBottomPanelVisible={true}
          onToggleBottomPanel={vi.fn()}
          isRightDockVisible={false}
          onToggleRightDock={vi.fn()}
          width={48}
        />,
      );
    });

    const toggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label="toolbar.showRightDock"]',
    );

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps viewport commands in the left toolbar and exposes three model visibility toggles', () => {
    const onToggleViewportHud = vi.fn();
    const onToggleBottomPanel = vi.fn();
    const onCameraChange = vi.fn();
    const onCameraMutated = vi.fn();

    act(() => {
      root.render(
        <ModelSideToolbar
          isViewportHudVisible={false}
          onToggleViewportHud={onToggleViewportHud}
          isBottomPanelVisible={false}
          onToggleBottomPanel={onToggleBottomPanel}
          isRightDockVisible={true}
          onToggleRightDock={vi.fn()}
          onCameraChange={onCameraChange}
          onCameraMutated={onCameraMutated}
          width={48}
        />,
      );
    });

    const bottomPanelToggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label="toolbar.showBottomPanel"]',
    );
    const hudToggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label="toolbar.showViewportHud"]',
    );

    expect(host.querySelector('.neko-creative-left-rail')).not.toBeNull();
    expect(buttonByLabel(host, 'toolbar.exportGlb')).not.toBeNull();
    expect(buttonByLabel(host, 'toolbar.saveProject')).not.toBeNull();
    expect(buttonByLabel(host, 'toolbar.faceEditor')).not.toBeNull();
    expect(buttonByLabel(host, 'toolbar.boneExpression')).not.toBeNull();
    expect(buttonByLabel(host, 'viewport.grid')).not.toBeNull();
    expect(buttonByLabel(host, 'viewport.resetCamera')).not.toBeNull();
    expect(
      buttonByLabel(host, 'toolbar.faceEditor')?.getAttribute('data-model-toolbar-action'),
    ).toBe('toggle-face');
    expect(buttonByLabel(host, 'viewport.grid')?.getAttribute('data-creative-left-rail-kind')).toBe(
      'common-action',
    );
    expect(hudToggle).not.toBeNull();
    expect(hudToggle?.getAttribute('aria-controls')).toBe('model-viewport-hud');
    expect(hudToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(hudToggle?.getAttribute('aria-pressed')).toBe('false');
    expect(hudToggle?.getAttribute('data-creative-left-rail-target')).toBe('hud');
    expect(hudToggle?.getAttribute('data-model-toolbar-action')).toBe('toggle-viewport-hud');
    expect(bottomPanelToggle).not.toBeNull();
    expect(bottomPanelToggle?.getAttribute('aria-controls')).toBe('model-timeline-dock');
    expect(bottomPanelToggle?.getAttribute('aria-expanded')).toBe('false');
    expect(bottomPanelToggle?.getAttribute('aria-pressed')).toBe('false');
    expect(bottomPanelToggle?.getAttribute('data-creative-left-rail-target')).toBe('main-panel');
    expect(bottomPanelToggle?.getAttribute('data-model-toolbar-action')).toBe(
      'toggle-bottom-panel',
    );

    act(() => {
      buttonByLabel(host, 'viewport.resetCamera')?.click();
      hudToggle?.click();
      bottomPanelToggle?.click();
    });

    expect(onCameraMutated).toHaveBeenCalledTimes(1);
    expect(onCameraChange).toHaveBeenCalledTimes(1);
    expect(onToggleViewportHud).toHaveBeenCalledTimes(1);
    expect(onToggleBottomPanel).toHaveBeenCalledTimes(1);
  });

  it('does not rerender for camera-only store updates during viewport dragging', () => {
    const renderProbe = vi.fn();
    const previousCameraState = {
      cameraTheta: useModelStore.getState().cameraTheta,
      cameraPhi: useModelStore.getState().cameraPhi,
      cameraRadius: useModelStore.getState().cameraRadius,
      cameraTarget: useModelStore.getState().cameraTarget,
    };

    function ToolbarProbe(): React.ReactElement {
      renderProbe();
      return <ModelSideToolbar width={48} />;
    }

    act(() => {
      root.render(<ToolbarProbe />);
    });

    const initialRenderCount = renderProbe.mock.calls.length;

    act(() => {
      useModelStore.setState({
        cameraTheta: 1.2,
        cameraPhi: 0.8,
        cameraRadius: 3,
        cameraTarget: [0.1, 0.2, 0.3],
      });
    });

    expect(renderProbe).toHaveBeenCalledTimes(initialRenderCount);

    act(() => {
      useModelStore.setState(previousCameraState);
    });
  });
});

function buttonByLabel(host: ParentNode, label: string): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}
