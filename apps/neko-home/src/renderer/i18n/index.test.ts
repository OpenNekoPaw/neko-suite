import { describe, expect, it } from 'vitest';
import { createHomeI18n } from './index';

describe('Home i18n composition', () => {
  it('uses matching Home-only message keys for English and Chinese', () => {
    const english = createHomeI18n('en').i18nService;
    const chinese = createHomeI18n('zh-cn').i18nService;

    expect(english.t('overview.title')).toBe('Continue creating');
    expect(chinese.t('overview.title')).toBe('继续创作');
    expect(english.t('overview.openInVSCode')).toBe('Open in VSCode');
    expect(chinese.t('overview.openInVSCode')).toBe('在 VSCode 中打开');
  });
});
