import { describe, expect, it } from 'vitest';
import {
  STORYBOARD_CREATIVE_TABLE_FIELDS as AGENT_TYPES_STORYBOARD_CREATIVE_TABLE_FIELDS,
  STORYBOARD_CREATIVE_TABLE_HEADERS as AGENT_TYPES_STORYBOARD_CREATIVE_TABLE_HEADERS,
  resolveStoryboardCreativeTableHeader as resolveAgentTypesStoryboardCreativeTableHeader,
} from '@neko-agent/types';
import {
  OutputValidator,
  STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
  validateStoryboardCreativeTableOutput,
} from '..';

describe('validateStoryboardCreativeTableOutput', () => {
  it('uses shared storyboard profile aliases through agent-types compatibility exports', () => {
    expect(AGENT_TYPES_STORYBOARD_CREATIVE_TABLE_HEADERS).toContain('imagePrompt');
    expect(
      AGENT_TYPES_STORYBOARD_CREATIVE_TABLE_FIELDS.some((field) => field.id === 'sceneVideoPrompt'),
    ).toBe(true);
    expect(resolveAgentTypesStoryboardCreativeTableHeader('场景视频提示词')).toBe(
      'sceneVideoPrompt',
    );
    expect(resolveAgentTypesStoryboardCreativeTableHeader('建议操作')).toBe('nextAction');
    expect(resolveAgentTypesStoryboardCreativeTableHeader('prompt')).toBe('prompt');
    expect(resolveAgentTypesStoryboardCreativeTableHeader('actionId')).toBe('actionId');
  });

  it('accepts the canonical storyboard creative table headers', () => {
    const markdown = [
      '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction | contentType | decisionReason | requiresSplit | duplicateOf |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 正文 | 1 | ![P1](P1#panel_1) | 上方分格 | keep | 3s | 主角靠近光源 | 缓慢推近 | 低风声 | 主角 |  | 暗黑童话风格，主角靠近发光物 | needs-review | use-as-reference | story | 建立叙事 | false |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.table?.headers).toEqual(
      expect.arrayContaining(['scene', 'shot', 'source', 'visual', 'prompt']),
    );
  });

  it('accepts open review metadata columns without requiring every recommended storyboard field', () => {
    const markdown = [
      '| 场景 | 镜头 | 来源 | 画面 | 自定义审阅 |',
      '| --- | --- | --- | --- | --- |',
      '| 开场 | 1 | P1 | 角色进入巨构空间 | OCR uncertain |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      'storyboard-table-missing-column',
    );
  });

  it('accepts model-aware prompt slots without the legacy prompt column', () => {
    const markdown = [
      '| scene | shot | source | visual | imagePrompt | shotVideoPrompt | sceneVideoPrompt | reviewStatus |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor | monochrome keyframe | slow dolly through corridor | 30s lonely exploration | needs-review |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
  });

  it('accepts localized prompt-slot storyboard output with plan-only next actions', () => {
    const markdown = [
      '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 图像提示词 | 图像编辑提示词 | 镜头视频提示词 | 视频编辑提示词 | 场景风格提示词 | 场景视频提示词 | 场景视频编辑提示词 | 审阅状态 | 建议操作 | 内容类型 | 决策理由 | 需要拆分 | 重复来源 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 正文 | 1 | P1#panel_1 | 上方分格 | keep | 3s | 主角靠近发光物 | 缓慢推近 | 低风声 | 主角 |  | 暗黑童话关键帧，主角靠近发光古灯 | 重绘光晕并移除气泡文字 | 主角从阴影中缓慢走向光源，短镜头运动 | 调整单镜头运动结尾的光晕闪烁 | 黄昏牧场、紫金魔法光、墨线质感 | 用 20 秒连接镜头 1-3，保持黄昏牧场风格连续 | 将整场视频调成更冷的月光色调 | needs-review | 拆分分格后再送 Canvas 审阅 | story | 建立叙事节拍 | false |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      'storyboard-table-unknown-next-action',
    );
    expect(resolveAgentTypesStoryboardCreativeTableHeader('图像提示词')).toBe('imagePrompt');
    expect(resolveAgentTypesStoryboardCreativeTableHeader('场景视频提示词')).toBe(
      'sceneVideoPrompt',
    );
    expect(resolveAgentTypesStoryboardCreativeTableHeader('建议操作')).toBe('nextAction');
    expect(result.table?.headers).toEqual(
      expect.arrayContaining(['图像提示词', '场景视频提示词', '建议操作']),
    );
  });

  it('accepts an edit prompt slot as the production anchor', () => {
    const markdown = [
      '| scene | shot | imageEditPrompt |',
      '| --- | --- | --- |',
      '| Opening | 1 | repaint the corridor keyframe with warmer rim light |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
  });

  it('keeps a prompt-slot anchored table preferred over a later source table', () => {
    const markdown = [
      '| scene | shot | imageEditPrompt |',
      '| --- | --- | --- |',
      '| Opening | 1 | repaint the corridor keyframe with warmer rim light |',
      '',
      '| scene | shot | source | visual |',
      '| --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.table?.headers).toEqual(['scene', 'shot', 'imageEditPrompt']);
  });

  it('rejects weak storyboard-like tables without chat output anchors', () => {
    const markdown = [
      '| scene | visual | risk |',
      '| --- | --- | --- |',
      '| Opening | Wide industrial corridor | too vague |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'storyboard-table-missing-chat-output-anchor',
          details: expect.objectContaining({
            missingAnchor: 'scene-shot',
            fieldGroup: ['scene', 'shot'],
            missingFields: ['shot'],
          }),
        }),
        expect.objectContaining({
          code: 'storyboard-table-missing-chat-output-anchor',
          details: expect.objectContaining({
            missingAnchor: 'source-or-prompt-slot',
            fieldGroup: expect.arrayContaining(['source', 'prompt', 'imagePrompt']),
          }),
        }),
      ]),
    );
  });

  it('prefers a later table that satisfies storyboard chat output anchors', () => {
    const markdown = [
      '| scene | visual | risk |',
      '| --- | --- | --- |',
      '| Opening | Wide industrial corridor | too vague |',
      '',
      '| scene | shot | source | visual |',
      '| --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.table?.headers).toEqual(['scene', 'shot', 'source', 'visual']);
  });

  it('fails visible when an execution action id appears without a trusted lifecycle context', () => {
    const markdown = [
      '| scene | shot | source | visual | actionId |',
      '| --- | --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor | unregistered.local.action |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'storyboard-table-execution-field-not-supported',
      }),
    ]);
  });

  it('accepts an empty execution action id column', () => {
    const markdown = [
      '| scene | shot | source | visual | actionId |',
      '| --- | --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor |  |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
  });

  it('fails visible when an execution result ref appears without a trusted lifecycle context', () => {
    const markdown = [
      '| scene | shot | source | visual | resultRef |',
      '| --- | --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor | canvas.result.local |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'storyboard-table-execution-field-not-supported',
        details: expect.objectContaining({ field: 'resultRef' }),
      }),
    ]);
  });

  it('warns for non-standard shot and scene duration values when duration fields exist', () => {
    const markdown = [
      '| scene | shot | source | visual | duration | sceneDuration |',
      '| --- | --- | --- | --- | --- | --- |',
      '| Opening | 1 | P1 | Wide industrial corridor | around three seconds | half a minute |',
    ].join('\n');

    const result = validateStoryboardCreativeTableOutput(markdown);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'storyboard-table-duration-format',
          message: expect.stringContaining('"duration"'),
        }),
        expect.objectContaining({
          code: 'storyboard-table-duration-format',
          message: expect.stringContaining('"sceneDuration"'),
        }),
      ]),
    );
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
    expect(result.errors.map((error) => error.code)).not.toContain(
      'storyboard-table-missing-column',
    );
    expect(result.errors.map((error) => error.code)).not.toContain(
      'storyboard-table-missing-minimum-field-group',
    );
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
      ]),
    );
    expect(result.errors.map((error) => error.code)).not.toContain(
      'storyboard-table-missing-column',
    );
    expect(result.errors.map((error) => error.code)).not.toContain(
      'storyboard-table-missing-minimum-field-group',
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
        expect.objectContaining({ code: 'storyboard-table-missing-minimum-field-group' }),
      ]),
    );
    expect(result.errors.some((error) => error.message.includes('scene, shot'))).toBe(true);
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
