import { describe, expect, it } from 'vitest';
import { createStoryboardOutputValidationAdapter } from './storyboard-output-validation';

describe('storyboard output validation contribution', () => {
  const adapter = createStoryboardOutputValidationAdapter();

  it('accepts the canonical Storyboard creative table', () => {
    const result = adapter.validate(
      [
        '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Establish the room | Slow push in | 3s | Hello |',
      ].join('\n'),
    );

    expect(result.errors).toEqual([]);
  });

  it('owns Storyboard diagnostics and localized retry guidance', () => {
    const result = adapter.validate(
      ['| 镜头 | 画面 |', '| --- | --- |', '| 1 | 角色进入森林 |'].join('\n'),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'storyboard-table-required-fields-missing' }),
      ]),
    );
    expect(adapter.buildRetryInstruction?.(result.errors, 'zh-cn')).toContain(
      'Storyboard 输出契约',
    );
  });
});
