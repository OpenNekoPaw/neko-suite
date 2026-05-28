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

    act(() => {
      root.render(<Toolbar sidePanelVisible={false} onToggleSidePanel={onToggleSidePanel} />);
    });

    const sidePanelButton = buttonByLabel('audio.sidePanel.show');

    expect(host.querySelector('.audio-left-toolbar')).not.toBeNull();
    expect(host.querySelector('.neko-creative-left-rail')).not.toBeNull();
    expect(host.querySelector('.audio-left-toolbar')?.getAttribute('aria-label')).toBe(
      'audio.toolbar.leftRail',
    );
    expect(buttonByLabel('audio.spectrum.toggle')).not.toBeNull();
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
      sidePanelButton?.click();
    });

    expect(onToggleSidePanel).toHaveBeenCalledTimes(1);
  });

  function buttonByLabel(label: string): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }
});
