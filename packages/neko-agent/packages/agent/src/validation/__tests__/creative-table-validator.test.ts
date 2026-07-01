import { describe, expect, it } from 'vitest';
import {
  OutputValidator,
  STORYBOARD_CREATIVE_TABLE_HEADERS,
  STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
  validateStoryboardCreativeTableOutput,
} from '..';

describe('validateStoryboardCreativeTableOutput', () => {
  it('accepts the canonical storyboard creative table headers', () => {
    const markdown = [
      '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 正文 | 1 | ![P1](P1#panel_1) | 上方分格 | keep | 3s | 主角靠近光源 | 缓慢推近 | 低风声 | 主角 |  | 暗黑童话风格，主角靠近发光物 | needs-review | use-as-reference | story | 建立叙事 | false |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.table?.headers).toEqual([...STORYBOARD_CREATIVE_TABLE_HEADERS]);
  });

  it('rejects creation-document frontmatter in chat storyboard output', () => {
    const markdown = [
      '---',
      'id: storyboard-draft-1',
      'kind: draft',
      'status: draft',
      'domain: storyboard',
      'referenceChain:',
      '  - P1',
      '---',
      '',
      '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 正文 | 1 | P1 | 整页 | keep | 3s | 主角出现 | 静态 |  | 主角 |  | needs-prompt | needs-review | use-as-reference | story | 有叙事价值 | false |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors.map((error) => error.code)).toContain(
      'storyboard-frontmatter-not-allowed',
    );
  });

  it('rejects display-only Chinese headers from the screenshot-style simplified table', () => {
    const markdown = [
      '| 镜头 | 源页 | 景别/构图 | 画面内容 | 动作与节奏 | 镜头运动 | 声音/氛围 | 时长 | 备注 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 1 | P1 | 全景 | 主角站立 | 慢 | 推近 | 风声 | 3s | 待确认 |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors.map((error) => error.code)).toContain('storyboard-table-forbidden-header');
    expect(result.errors.map((error) => error.code)).toContain('storyboard-table-missing-column');
    expect(result.errors.some((error) => error.message.includes('characters'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('prompt'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('nextAction'))).toBe(true);
  });

  it('rejects journal-style seven-column storyboard summaries as simplified tables', () => {
    const markdown = [
      '## 前 10 页漫画分镜表',
      '',
      '| 镜头 | 页/资源 | 画面内容 | 景别/构图 | 动作与叙事功能 | 情绪/节奏 | 动画化建议 |',
      '|---|---|---|---|---|---|---|',
      '| S001 | P00 `read-image-cover.jpg` | 黑白工业巨构封面 | 封面海报 | reference-only | 压迫、慢 | 缓慢推近 |',
      '| S002 | P01 `read-image-moe-010564.jpg` | 巨大空旷空间 | 远景 | 建立场景 | 冷峻 | 低频环境声 |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'storyboard-table-forbidden-header' }),
        expect.objectContaining({
          code: 'storyboard-table-missing-column',
          details: expect.objectContaining({ header: 'characters' }),
        }),
        expect.objectContaining({
          code: 'storyboard-table-missing-column',
          details: expect.objectContaining({ header: 'prompt' }),
        }),
        expect.objectContaining({
          code: 'storyboard-table-missing-column',
          details: expect.objectContaining({ header: 'nextAction' }),
        }),
      ]),
    );
  });

  it('rejects overview-style page analysis tables even when they mention storyboard concepts', () => {
    const markdown = [
      '## 分镜概览',
      '',
      '| 分镜概览 | 源页 | 动作与节奏 | 镜头运动 | 声音/氛围 | 备注 |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 开场 | P1 | 慢速建立情绪 | 缓慢推近 | 低频风声 | 后续补人物和提示词 |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'storyboard-table-forbidden-header' }),
        expect.objectContaining({ code: 'storyboard-table-missing-column' }),
      ]),
    );
    expect(result.errors.some((error) => error.message.includes('prompt'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('characters'))).toBe(true);
  });

  it('accepts localized Chinese storyboard creative table headers', () => {
    const markdown = [
      '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 提示词 | 审阅状态 | 建议操作 | 内容类型 | 决策理由 | 需要拆分 | 重复来源 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 正文 | 1 | P1 | 整页 | keep | 3s | 主角出现 | 缓慢推近 | 低风声 | 主角 |  | 暗黑童话风格 | needs-review | use-as-reference | story | 有叙事价值 | false |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
  });

  it('rejects machine placeholders in human description columns', () => {
    const markdown = [
      '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 提示词 | 审阅状态 | 建议操作 | 内容类型 | 决策理由 | 需要拆分 | 重复来源 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 封面 | 1 | P1 | 整页 | reference-only | 3s | 封面巨构 | 缓慢推近 | 低频嗡鸣 | needs-panel-analysis |  | 黑白工业巨构封面风格参考 | needs-review | use-as-style-reference | cover | 封面作为风格参考 | false |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'storyboard-table-placeholder-in-wrong-column',
          details: expect.objectContaining({ field: 'characters' }),
        }),
      ]),
    );
  });

  it('rejects invalid storyboard enum and boolean cells', () => {
    const markdown = [
      '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 正文 | 1 | P1 | 整页 | maybe | 3s | 主角出现 | 缓慢推近 | 低风声 | 主角 |  | 暗黑童话风格 | pending | use-as-reference | story | 有叙事价值 | maybe |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'storyboard-table-invalid-cell-value',
          details: expect.objectContaining({ field: 'decision' }),
        }),
        expect.objectContaining({
          code: 'storyboard-table-invalid-cell-value',
          details: expect.objectContaining({ field: 'reviewStatus' }),
        }),
        expect.objectContaining({
          code: 'storyboard-table-invalid-boolean-cell',
          details: expect.objectContaining({ field: 'requiresSplit' }),
        }),
      ]),
    );
  });
});

describe('OutputValidator artifact validator registry', () => {
  it('applies registered storyboard profile validators by canonical id', async () => {
    const validator = new OutputValidator();
    const result = await validator.validate(
      [
        '| 镜头 | 源页 | 景别/构图 | 画面内容 |',
        '| --- | --- | --- | --- |',
        '| 1 | P1 | 全景 | 主角站立 |',
      ].join('\n'),
      [STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID],
    );

    expect(result.errors.map((error) => error.code)).toContain('storyboard-table-forbidden-header');
  });

  it('supports profile validator aliases without making storyboard validation global', async () => {
    const validator = new OutputValidator();
    const markdown = [
      '| 镜头 | 源页 | 景别/构图 | 画面内容 |',
      '| --- | --- | --- | --- |',
      '| 1 | P1 | 全景 | 主角站立 |',
    ].join('\n');

    await expect(validator.validate(markdown, undefined)).resolves.toEqual({
      errors: [],
      warnings: [],
    });
    await expect(validator.validate(markdown, ['StoryboardCreativeTable'])).resolves.toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'storyboard-table-forbidden-header' }),
      ]),
    });
  });
});
