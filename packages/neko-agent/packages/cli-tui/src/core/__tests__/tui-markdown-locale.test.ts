import { describe, expect, it } from 'vitest';
import { formatTuiTemplate, getTuiLabels, type TuiLocale } from '../tui-locale';

describe('TUI Markdown localization', () => {
  it('keeps Markdown bundle keys and interpolation placeholders in parity', () => {
    const locales: readonly TuiLocale[] = ['en', 'zh'];
    const entries = locales.map((locale) => getTuiLabels(locale).markdown);
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual(Object.keys(entries[1] ?? {}).sort());

    for (const key of Object.keys(entries[0] ?? {}) as Array<keyof (typeof entries)[number]>) {
      const placeholders = entries.map((entry) =>
        [...entry[key].matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort(),
      );
      expect(placeholders[0]).toEqual(placeholders[1]);
    }
  });

  it('formats synthetic columns and safe-control descriptions locally', () => {
    const zh = getTuiLabels('zh').markdown;
    expect(formatTuiTemplate(zh.syntheticColumn, { index: 3 })).toBe('第 3 列');
    expect(formatTuiTemplate(zh.unsafeControl, { control: 'ESC' })).toBe(
      '不安全的终端控制字符 ESC',
    );
  });
});
