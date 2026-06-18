import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PuppetEmptyState } from './PuppetEmptyState';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@neko/ui/icons', () => ({
  UploadIcon: ({ size = 16 }: { readonly size?: number }) => <span data-icon="upload">{size}</span>,
}));

class TestFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;

  readAsDataURL(file: File): void {
    this.result = `data:application/octet-stream;base64,${file.name}-payload`;
    this.onload?.();
  }
}

const originalFileReader = globalThis.FileReader;

describe('PuppetEmptyState', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    globalThis.FileReader = originalFileReader;
    vi.restoreAllMocks();
  });

  it('renders a visible Live2D import empty state in the viewport', () => {
    act(() => {
      root.render(<PuppetEmptyState onDropMoc3={vi.fn()} onImportMoc3={vi.fn()} />);
    });

    expect(host.querySelector('[data-puppet-empty-state="true"]')).not.toBeNull();
    expect(host.querySelector('[data-puppet-empty-panel="true"]')).not.toBeNull();
    expect(host.querySelector('[data-puppet-empty-preview="default-humanoid"]')).toBeNull();
    expect(host.querySelector('button')?.textContent).toContain('puppet.empty.import');
    expect(host.textContent).toContain('puppet.import.title');
    expect(host.textContent).toContain('puppet.empty.hint');
    expect(host.textContent?.toLowerCase()).not.toContain('tilemap');
    expect(host.textContent?.toLowerCase()).not.toContain('scene graph');
  });

  it('routes the visible import action through callbacks', () => {
    const onImportMoc3 = vi.fn();

    act(() => {
      root.render(<PuppetEmptyState onDropMoc3={vi.fn()} onImportMoc3={onImportMoc3} />);
    });

    act(() => {
      host.querySelector('button')?.click();
    });

    expect(onImportMoc3).toHaveBeenCalledTimes(1);
  });

  it('routes dropped moc3 files through callbacks', () => {
    const onDropMoc3 = vi.fn();

    act(() => {
      root.render(<PuppetEmptyState onDropMoc3={onDropMoc3} onImportMoc3={vi.fn()} />);
    });

    const dropTarget = host.querySelector('[data-puppet-empty-state="true"]');
    const file = new File(['moc'], 'sample.moc3');
    const dropEvent = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { files: [file] },
    });

    act(() => {
      dropTarget?.dispatchEvent(dropEvent);
    });

    expect(onDropMoc3).toHaveBeenCalledWith({
      name: 'sample.moc3',
      file,
    });
  });
});
