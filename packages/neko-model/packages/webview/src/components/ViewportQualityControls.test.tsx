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
        'viewport.quality.quarterShort': '性能',
        'viewport.quality.halfShort': '清晰',
        'viewport.quality.nativeShort': '极清',
        'viewport.qualityTitle.quarter': '低延迟预览',
        'viewport.qualityTitle.half': '默认编辑预览',
        'viewport.qualityTitle.native': '细节检查预览',
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

  it('renders semantic performance/clear/inspect quality choices', () => {
    const onQualityChange = vi.fn();
    act(() => {
      root.render(<ViewportQualityControls quality="half" onQualityChange={onQualityChange} />);
    });

    expect(host.querySelector('[aria-label="视口视频流质量"]')).not.toBeNull();
    expect(selectByLabel('视口视频流质量').value).toBe('half');
    expect(
      Array.from(selectByLabel('视口视频流质量').options).map((option) => option.text),
    ).toEqual(['性能', '清晰', '极清']);

    act(() => {
      changeSelect('视口视频流质量', 'native');
    });

    expect(onQualityChange).toHaveBeenCalledWith('native');
  });

  function selectByLabel(label: string): HTMLSelectElement {
    const select = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    if (!select) throw new Error(`Select not found: ${label}`);
    return select;
  }

  function changeSelect(label: string, value: string): void {
    const select = selectByLabel(label);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
