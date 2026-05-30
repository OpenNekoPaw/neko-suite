// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PuppetToolbar } from './PuppetToolbar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
  UploadIcon: ({ size = 16 }: { readonly size?: number }) => <span data-icon="upload">{size}</span>,
}));

describe('PuppetToolbar', () => {
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

  it('renders on the shared left vertical toolbar surface', () => {
    act(() => {
      root.render(<PuppetToolbar {...defaultProps()} />);
    });

    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(host.querySelector('.neko-creative-left-rail')).not.toBeNull();
    expect(host.querySelector('.puppet-left-toolbar')).not.toBeNull();
    expect(host.querySelector('.puppet-left-toolbar')?.getAttribute('aria-label')).toBe(
      'puppet.toolbar.leftRail',
    );
    expect(host.querySelectorAll('.neko-toolbar-btn')).toHaveLength(6);
    expect(host.querySelector('[style*="flex"]')).not.toBeNull();
  });

  it('keeps viewport commands in the left rail', () => {
    act(() => {
      root.render(<PuppetToolbar {...defaultProps({ puppetLoaded: true })} />);
    });

    expect(buttonByLabel('puppet.toolbar.import')).not.toBeNull();
    expect(
      buttonByLabel('puppet.toolbar.import')?.getAttribute('data-creative-left-rail-kind'),
    ).toBe('common-action');
    expect(buttonByLabel('puppet.toolbar.export')).not.toBeNull();
    expect(buttonByLabel('puppet.toolbar.package')).not.toBeNull();
    expect(buttonByLabel('puppet.toolbar.fitView')).not.toBeNull();
    expect(buttonByLabel('puppet.toolbar.onionSkin')).not.toBeNull();
    expect(
      buttonByLabel('puppet.toolbar.fitView')?.getAttribute('data-puppet-toolbar-action'),
    ).toBe('fit-view');
    expect(
      buttonByLabel('puppet.toolbar.onionSkin')?.getAttribute('data-creative-left-rail-kind'),
    ).toBe('common-action');
  });

  it('routes left rail import and viewport commands', () => {
    const props = defaultProps({ puppetLoaded: true });

    act(() => {
      root.render(<PuppetToolbar {...props} />);
    });

    act(() => {
      buttonByLabel('puppet.toolbar.import')?.click();
      buttonByLabel('puppet.toolbar.export')?.click();
      buttonByLabel('puppet.toolbar.package')?.click();
      buttonByLabel('puppet.toolbar.fitView')?.click();
      buttonByLabel('puppet.toolbar.onionSkin')?.click();
    });

    expect(props.onImport).toHaveBeenCalledTimes(1);
    expect(props.onOpenExport).toHaveBeenCalledTimes(1);
    expect(props.onOpenPackage).toHaveBeenCalledTimes(1);
    expect(props.onFitView).toHaveBeenCalledTimes(1);
    expect(props.onToggleOnionSkin).toHaveBeenCalledTimes(1);
  });

  it('routes visibility toggles through the left rail', () => {
    const props = defaultProps({ isRightPanelVisible: true });

    act(() => {
      root.render(<PuppetToolbar {...props} />);
    });

    const rightPanelButton = buttonByLabel('puppet.toolbar.hideRightPanel');
    expect(rightPanelButton?.getAttribute('aria-controls')).toBe('puppet-right-panel');
    expect(rightPanelButton?.getAttribute('aria-expanded')).toBe('true');
    expect(rightPanelButton?.getAttribute('aria-pressed')).toBe('true');
    expect(rightPanelButton?.getAttribute('data-creative-left-rail-target')).toBe('right-panel');
    expect(rightPanelButton?.getAttribute('data-puppet-toolbar-action')).toBe('toggle-right-panel');
    expect(buttonByLabel('puppet.toolbar.import')).not.toBeNull();

    act(() => {
      rightPanelButton?.click();
    });

    expect(props.onToggleRightPanel).toHaveBeenCalledTimes(1);
  });

  it('uses the show label when the right panel is collapsed', () => {
    act(() => {
      root.render(<PuppetToolbar {...defaultProps({ isRightPanelVisible: false })} />);
    });

    const rightPanelButton = buttonByLabel('puppet.toolbar.showRightPanel');
    expect(rightPanelButton).not.toBeNull();
    expect(rightPanelButton?.getAttribute('aria-expanded')).toBe('false');
    expect(rightPanelButton?.getAttribute('aria-pressed')).toBe('false');
  });

  function buttonByLabel(label: string): HTMLButtonElement | null {
    return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }
});

function defaultProps(overrides: Partial<React.ComponentProps<typeof PuppetToolbar>> = {}) {
  return {
    isRightPanelVisible: true,
    puppetLoaded: false,
    onionSkinEnabled: false,
    onImport: vi.fn(),
    onOpenExport: vi.fn(),
    onOpenPackage: vi.fn(),
    onFitView: vi.fn(),
    onToggleOnionSkin: vi.fn(),
    onToggleRightPanel: vi.fn(),
    ...overrides,
  };
}
