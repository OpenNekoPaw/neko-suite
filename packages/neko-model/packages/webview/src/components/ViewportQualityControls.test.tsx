// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportQualityControls } from './ViewportQualityControls';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        'viewport.quality.aria': '视口视频流质量',
        'viewport.quality.label': '质量',
        'viewport.quality.quarterShort': '1/4',
        'viewport.quality.halfShort': '1/2',
        'viewport.quality.nativeShort': '1:1',
        'viewport.qualityTitle.quarter': '四分之一物理像素',
        'viewport.qualityTitle.half': '二分之一物理像素',
        'viewport.qualityTitle.native': '原生 1:1',
      };
      return messages[key] ?? key;
    },
  }),
}));

describe('ViewportQualityControls', () => {
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

  it('renders explicit quarter/half/native quality choices', () => {
    const onQualityChange = vi.fn();
    act(() => {
      root.render(<ViewportQualityControls quality="half" onQualityChange={onQualityChange} />);
    });

    expect(host.querySelector('[aria-label="视口视频流质量"]')).not.toBeNull();
    expect(buttonByText('1/4').getAttribute('aria-checked')).toBe('false');
    expect(buttonByText('1/2').getAttribute('aria-checked')).toBe('true');
    expect(buttonByText('1:1').getAttribute('aria-checked')).toBe('false');

    act(() => {
      buttonByText('1:1').click();
    });

    expect(onQualityChange).toHaveBeenCalledWith('native');
  });

  function buttonByText(text: string): HTMLButtonElement {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === text,
    );
    if (!button) throw new Error(`Button not found: ${text}`);
    return button;
  }
});
