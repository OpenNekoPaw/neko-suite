import { describe, expect, it } from 'vitest';
import { detectTuiLocale, getTuiLabels } from '../tui-locale';

describe('TUI locale detection', () => {
  it('uses system locale before the generic shell locale', () => {
    const locale = detectTuiLocale(
      {
        LANG: 'en_US.UTF-8',
      },
      () => 'zh-CN',
    );

    expect(locale).toBe('zh');
    expect(getTuiLabels(locale).chrome.startupHelp).toBe('输入 /help 查看命令，输入 /exit 退出');
  });

  it('ignores VS Code NLS injection for the TUI platform', () => {
    const locale = detectTuiLocale(
      {
        VSCODE_NLS_CONFIG: JSON.stringify({
          locale: 'zh-cn',
          osLocale: 'zh-cn',
          availableLanguages: {},
        }),
        LANG: 'en_US.UTF-8',
      },
      () => undefined,
    );

    expect(locale).toBe('en');
    expect(getTuiLabels(locale).chrome.startupHelp).toBe('Type /help for commands, /exit to quit');
  });

  it('keeps NEKO_LOCALE as the explicit TUI override', () => {
    const locale = detectTuiLocale(
      {
        NEKO_LOCALE: 'en-US',
        LANG: 'zh_CN.UTF-8',
      },
      () => 'zh-CN',
    );

    expect(locale).toBe('en');
  });
});
