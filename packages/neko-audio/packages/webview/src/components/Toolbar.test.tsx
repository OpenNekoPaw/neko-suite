// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toolbar } from './Toolbar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('@neko/ui/icons', () => ({
  DownloadIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="download">{size}</span>
  ),
  PackageIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="package">{size}</span>
  ),
  RightPanelIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="right-panel">{size}</span>
  ),
  RightPanelOffIcon: ({ size = 16 }: { readonly size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
  ),
}));

describe('Audio toolbar surfaces', () => {
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

  it('places audio command buttons and right panel visibility in the left rail', () => {
    const onToggleSidePanel = vi.fn();
    const onOpenExport = vi.fn();
    const onOpenPackage = vi.fn();

    act(() => {
      root.render(
        <Toolbar
          sidePanelVisible={false}
          onOpenExport={onOpenExport}
          onOpenPackage={onOpenPackage}
          onToggleSidePanel={onToggleSidePanel}
        />,
      );
    });

    const sidePanelButton = buttonByLabel('audio.sidePanel.show');

    expect(host.querySelector('.audio-left-toolbar')).not.toBeNull();
    expect(host.querySelector('.neko-creative-left-rail')).not.toBeNull();
    expect(host.querySelector('.audio-left-toolbar')?.getAttribute('aria-label')).toBe(
      'audio.toolbar.leftRail',
    );
    expect(buttonByLabel('audio.spectrum.toggle')).not.toBeNull();
    expect(buttonByLabel('audio.export.toggle')).not.toBeNull();
    expect(buttonByLabel('audio.package.project')).not.toBeNull();
    expect(
      buttonByLabel('audio.export.toggle')?.getAttribute('data-creative-left-rail-action'),
    ).toBe('open-export');
    expect(
      buttonByLabel('audio.package.project')?.getAttribute('data-creative-left-rail-action'),
    ).toBe('open-package');
    expect(buttonByLabel('audio.analysis.loudness')).not.toBeNull();
    expect(buttonByLabel('audio.analysis.silence')).not.toBeNull();
    expect(buttonByLabel('audio.analysis.denoise')).not.toBeNull();
    expect(buttonByLabel('audio.analysis.normalize')).not.toBeNull();
    expect(
      buttonByLabel('audio.analysis.loudness')?.getAttribute('data-audio-toolbar-action'),
    ).toBe('analyze-loudness');
    expect(
      buttonByLabel('audio.spectrum.toggle')?.getAttribute('data-creative-left-rail-kind'),
    ).toBe('common-action');
    expect(sidePanelButton?.getAttribute('aria-controls')).toBe('audio-side-panel');
    expect(sidePanelButton?.getAttribute('aria-expanded')).toBe('false');
    expect(sidePanelButton?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(sidePanelButton?.getAttribute('data-creative-left-rail-target')).toBe('right-panel');
    act(() => {
      buttonByLabel('audio.export.toggle')?.click();
      buttonByLabel('audio.package.project')?.click();
      sidePanelButton?.click();
    });

    expect(onOpenExport).toHaveBeenCalledTimes(1);
    expect(onOpenPackage).toHaveBeenCalledTimes(1);
    expect(onToggleSidePanel).toHaveBeenCalledTimes(1);
  });

  function buttonByLabel(label: string): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }
});
