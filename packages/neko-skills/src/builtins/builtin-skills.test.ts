import { describe, expect, it } from 'vitest';

import {
  aiGenerateSkill,
  aiGenerateToolDefinitions,
  builtinSkills,
  builtinSkillLocales,
  builtinToolGroups,
  comicToStoryboardSkill,
  creationPersonaSkill,
  executionPersonaSkill,
  getBuiltinSkills,
  getComicToStoryboardSkill,
  getMediaWorkflowBuiltinSkills,
  iterationPersonaSkill,
  mediaToVideoSkill,
  normalizeBuiltinSkillLocale,
  qualityAssessmentSkill,
  scriptGenerationSkill,
  validateBuiltinSkillLocaleParity,
} from './index';

const localizedBuiltinPromptNames = [
  'creation-persona',
  'execution-persona',
  'iteration-persona',
  'ai-generate',
  'scene-to-music',
  'video-editing',
  'color-grading',
  'audio-mixing',
  'subtitle-assistant',
  'script-generation',
  'script-to-timeline',
  'media-to-video',
  'comic-to-animation',
  'comic-to-storyboard',
  'image-to-shot',
  'storyboard-to-animation-plan',
  'animation-plan-to-cut',
  'generated-shot-assembly',
  'export-video-package',
  'quality-assessment',
];

describe('@neko/skills builtins', () => {
  it('exports comic storyboard and media workflow skill definitions', () => {
    expect(comicToStoryboardSkill.name).toBe('comic-to-storyboard');
    expect(mediaToVideoSkill.name).toBe('media-to-video');
    expect(getMediaWorkflowBuiltinSkills().map((skill) => skill.name)).toEqual([
      'media-to-video',
      'comic-to-animation',
      'image-to-shot',
      'storyboard-to-animation-plan',
      'animation-plan-to-cut',
      'generated-shot-assembly',
      'export-video-package',
    ]);
  });

  it('keeps localized builtin skill content in the skills package', () => {
    expect(normalizeBuiltinSkillLocale('zh-CN')).toBe('zh-cn');
    expect(normalizeBuiltinSkillLocale('zh-TW')).toBe('zh-cn');
    expect(getComicToStoryboardSkill('zh-CN').description).toContain('分镜');
    expect(getComicToStoryboardSkill('zh-TW').description).toContain('分镜');
    expect(getComicToStoryboardSkill('en-US')).toBe(comicToStoryboardSkill);
  });

  it('projects localized builtin skill descriptions into runtime skill definitions', () => {
    const zhCnSkills = getBuiltinSkills({ locale: 'zh-CN' });

    expect(zhCnSkills.find((skill) => skill.name === 'video-editing')?.description).toContain(
      '剪切',
    );
    expect(zhCnSkills.find((skill) => skill.name === 'ai-generate')?.description).toContain('图片');
    expect(zhCnSkills.find((skill) => skill.name === 'comic-to-storyboard')?.description).toContain(
      '分镜',
    );
    expect(zhCnSkills.find((skill) => skill.name === 'video-editing')?.description).not.toContain(
      'Video editing assistant',
    );
  });

  it('keeps comic storyboard visual evidence contract aligned with ReadImage native multimodal flow', () => {
    const english = getComicToStoryboardSkill().content;
    const zhCn = getComicToStoryboardSkill('zh-CN').content;

    expect(english).toContain('native multimodal attachments');
    expect(english).toContain('vision-capable native multimodal Agent reasoning');
    expect(english).toContain('do not output any Markdown table');
    expect(english).not.toContain('non metadata');

    expect(zhCn).toContain('原生多模态附件');
    expect(zhCn).toContain('具备 vision 能力');
    expect(zhCn).toContain('不要输出任何 Markdown 表格');
    expect(zhCn).not.toContain('非 metadata');
  });

  it('keeps comic storyboard prompts actionable for image and video generation/editing', () => {
    const english = getComicToStoryboardSkill().content;
    const zhCn = getComicToStoryboardSkill('zh-CN').content;

    expect(english).toContain(
      'Image generation prompts must include character appearance, scene/location, composition/camera, style/color/lighting, and reference-consistency constraints.',
    );
    expect(english).toContain(
      'Image edit prompts must describe ordered operations such as crop/split/rotate/colorize/redraw/remove text/inpaint/outpaint/upscale/style normalization.',
    );
    expect(english).toContain(
      "Video prompts must summarize the scene's source/reference, character, scene, emotion, shot-ordered action beats, dialogue or silence, camera movement, environmental change, pacing/total duration, and constraints.",
    );
    expect(english).toContain(
      '`videoPrompt` is scene-level. Write at most one video prompt per scene, preferably on the first row of that scene.',
    );
    expect(english).toContain(
      'Do not write shot-level or single-shot video prompts in new storyboard output.',
    );
    expect(english).toContain(
      'Prompt cells are generation instructions, not visual-analysis notes or review labels.',
    );
    expect(english).toContain(
      'Do not write prompt fragments like only "crop the standing character panel", "black-haired man walks past bodies", or "low-angle follow".',
    );
    expect(english).toContain(
      'When a reference image is directly usable, leave `imagePrompt` blank instead of inventing image-edit work.',
    );
    expect(english).toContain('Resource references must state their purpose.');
    expect(english).toContain(
      'Use the base shape "scene intent / reference resources and their roles / subject characters and emotion / scene environment / shot-numbered or time-coded action beats / camera transitions / environmental change or effects / dialogue, narration, SFX, or silence / total duration / constraints".',
    );
    expect(english).toContain('For long scenes or intents over 10 seconds');
    expect(english).toContain('Operation-specific prompt intent:');
    expect(english).toContain(
      '`generate-video`: write a complete scene video generation prompt',
    );
    expect(english).toContain(
      '`edit-video`: write what to preserve, what to modify, and how scene, character, action, dialogue, camera, background, effects, or audio should change.',
    );
    expect(english).toContain(
      '`process-reference` / `optimize-image-prompt`: write image preparation or image generation steps, not a video prompt.',
    );
    expect(english).toContain(
      'Common prompt failure checks: ambiguous references, conflicting instructions, overloaded content, unassigned resources, and duration mismatch.',
    );
    expect(english).toContain('not extra table fields or Canvas schema');
    expect(english).toContain('Prompt self-check: every non-empty `imagePrompt` / `videoPrompt`');

    expect(zhCn).toContain(
      '图片生成提示词必须包含人物外观、场景/地点、构图/镜头、风格/色彩/光影和参考一致性约束。',
    );
    expect(zhCn).toContain(
      '图片编辑提示词必须写清有顺序的操作步骤，例如裁切/切分/旋转/上色/重绘/去文字/局部重绘/扩图/放大/统一风格。',
    );
    expect(zhCn).toContain(
      '视频提示词必须按 scene 汇总来源/参考、人物、场景、情绪、按镜号排列的动作节拍、对白或无对白、运镜、环境变化、节奏/总时长和约束。',
    );
    expect(zhCn).toContain(
      '`videoPrompt` 是 scene 级字段。每个 scene 最多写一个视频提示词，优先写在该 scene 的第一行；同一 scene 的后续 shot 行默认继承该 scene 的视频提示词，除非新 scene 开始。',
    );
    expect(zhCn).toContain('新的分镜输出不要写 shot 级或单镜视频提示词。');
    expect(zhCn).toContain('提示词单元格是生成指导，不是视觉分析笔记、审阅标签或操作摘要。');
    expect(zhCn).toContain(
      '不要只写“裁切主角站立分格”“黑发男性从尸体旁走过”“镜头低角度跟随”这类提示词碎片。',
    );
    expect(zhCn).toContain(
      '参考图可直接用于视频时，`imagePrompt` 留空，不要为了填表编造图像编辑任务。',
    );
    expect(zhCn).toContain('资源引用必须说明用途。');
    expect(zhCn).toContain(
      '基础结构是“场景意图 / 参考资源及用途 / 主体人物与情绪 / 场景环境 / 按镜号或时间段排列的动作节拍 / 运镜连接 / 环境变化或特效 / 对白、旁白、音效或无对白 / 总时长 / 约束”。',
    );
    expect(zhCn).toContain('长 scene 或 10 秒以上意图');
    expect(zhCn).toContain('按操作类型写提示词意图：');
    expect(zhCn).toContain(
      '`generate-video`：写完整场景视频生成提示词，包含主体/人物、场景、情绪、按镜号或时间段排列的节拍、运镜、转场/特效、音频/对白、风格、时长和约束。',
    );
    expect(zhCn).toContain(
      '`edit-video`：写清保留什么、修改什么，以及场景、人物、动作、对白、镜头、背景、特效或音频如何变化。',
    );
    expect(zhCn).toContain(
      '`process-reference` / `optimize-image-prompt`：写图片准备或图片生成步骤，不要写成视频提示词。',
    );
    expect(zhCn).toContain(
      '常见提示词错误自检：引用模糊、指令冲突、内容过载、素材无归属、时长不匹配。',
    );
    expect(zhCn).toContain('不是新增表格字段或 Canvas schema');
    expect(zhCn).toContain('提示词自检：每个非空 `imagePrompt` / `videoPrompt`');
  });

  it('keeps comic storyboard Canvas handoff after the reviewable table is complete', () => {
    const english = getComicToStoryboardSkill().content;
    const zhCn = getComicToStoryboardSkill('zh-CN').content;

    expect(english).toContain(
      'When the user asks to generate a storyboard and send it to Canvas, first finish and output the single Markdown creative table.',
    );
    expect(english).toContain(
      'Do not call Canvas tools instead of generating the storyboard table.',
    );
    expect(english).toContain(
      'The first storyboard draft must be visible as an assistant Markdown block before any Canvas Markdown tool is called.',
    );
    expect(english).toContain('If no visible assistant Markdown block or UI handoff source exists yet');
    expect(english).toContain(
      'Use canvas.createStoryboardFromMarkdown for production scene/shot nodes.',
    );
    expect(english).toContain(
      '"Send as Markdown" means Markdown is the source format/transport',
    );
    expect(english).toContain('report Canvas tool-surface blocked');
    expect(english).toContain('canvas.ingestMarkdown is only a review-only table fallback.');

    expect(zhCn).toContain(
      '当用户要求“生成分镜表并发送到 Canvas”时，先完成并输出唯一的 Markdown creative table。',
    );
    expect(zhCn).toContain('不要用 Canvas 工具替代分镜表生成。');
    expect(zhCn).toContain('分镜初稿必须先作为可见 assistant Markdown 块出现在聊天中');
    expect(zhCn).toContain('先输出表格并停止');
    expect(zhCn).toContain('生产 scene/shot 节点使用 canvas.createStoryboardFromMarkdown。');
    expect(zhCn).toContain(
      '“作为 Markdown/Markdown 发送”表示 Markdown 是来源格式/传输格式',
    );
    expect(zhCn).toContain('报告 Canvas tool-surface blocked');
    expect(zhCn).toContain('canvas.ingestMarkdown 只能作为 review-only 表格/草稿摄入。');
  });

  it('keeps image-to-shot prompt guidance aligned with storyboard prompt style', () => {
    const english = getBuiltinSkills().find((skill) => skill.name === 'image-to-shot')?.content;
    const zhCn = getBuiltinSkills({ locale: 'zh-CN' }).find(
      (skill) => skill.name === 'image-to-shot',
    )?.content;

    expect(english).toContain('Resource references must state their purpose.');
    expect(english).toContain('scene intent / reference resource roles');
    expect(english).toContain(
      'Prefer time-coded beats for long scenes or intents over 10 seconds.',
    );
    expect(english).toContain('Every non-empty prompt must answer');

    expect(zhCn).toContain('资源引用必须说明用途。');
    expect(zhCn).toContain('场景意图 / 参考资源用途');
    expect(zhCn).toContain('长 scene 或 10 秒以上意图优先分时段描述。');
    expect(zhCn).toContain('每个非空提示词都必须能回答');
  });

  it('owns all non-runtime builtin skill and tool group definitions', () => {
    expect(aiGenerateSkill.name).toBe('ai-generate');
    expect(aiGenerateToolDefinitions.map((definition) => definition.name)).toContain(
      'GenerateImage',
    );
    expect(scriptGenerationSkill.name).toBe('script-generation');
    expect(qualityAssessmentSkill.name).toBe('quality-assessment');
    expect(creationPersonaSkill.name).toBe('creation-persona');
    expect(executionPersonaSkill.name).toBe('execution-persona');
    expect(iterationPersonaSkill.name).toBe('iteration-persona');

    expect(builtinToolGroups.map((group) => group.name)).toContain('perception-evidence');
    expect(getBuiltinSkills().map((skill) => skill.name)).toEqual(
      builtinSkills.map((skill) => skill.name),
    );
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'comic-to-storyboard')
        ?.content,
    ).toContain('分镜');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'script-generation')
        ?.content,
    ).toContain('Fountain 语法');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'script-generation')
        ?.content,
    ).not.toContain('Fountain Syntax Reference');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'creation-persona')
        ?.content,
    ).toContain('创作文档契约');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'creation-persona')
        ?.content,
    ).not.toContain('Creation document contract');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'execution-persona')
        ?.content,
    ).toContain('系统操作员');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'execution-persona')
        ?.content,
    ).not.toContain('System Operator');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'iteration-persona')
        ?.content,
    ).toContain('一致性迭代');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'iteration-persona')
        ?.content,
    ).not.toContain('Consistency Iterator');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'video-editing')
        ?.content,
    ).toContain('视频剪辑助手');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'video-editing')
        ?.content,
    ).not.toContain('Video Editing Assistant');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'ai-generate')?.content,
    ).toContain('AI 媒体生成');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'ai-generate')?.content,
    ).not.toContain('AI Media Generation');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'ai-generate')?.content,
    ).toContain('工具参数 prompt 默认使用用户当前语言');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'ai-generate')?.content,
    ).not.toContain('[Subject] + [Style] + [Details] + [Atmosphere] + [Technical]');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'quality-assessment')
        ?.content,
    ).toContain('媒体质量检查助手');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'quality-assessment')
        ?.content,
    ).not.toContain('Media Quality Assessment Assistant');
  });

  it('owns builtin skill catalog display localization metadata', () => {
    expect(builtinSkillLocales['comic-to-storyboard']?.['zh-cn']).toEqual(
      expect.objectContaining({
        name: '漫画转分镜表',
        description: expect.stringContaining('结构化分镜表'),
        tags: expect.arrayContaining(['AI', '漫画', '分镜']),
      }),
    );
    expect(builtinSkillLocales['media-to-video']?.['zh-cn']?.name).toBe('媒体转视频');
    expect(builtinSkillLocales['creation-persona']?.['zh-cn']?.description).toContain('共创伙伴');
  });

  it('keeps localized markdown-backed builtin prompts structurally aligned', () => {
    const englishSkills = getBuiltinSkills();
    const zhCnSkills = getBuiltinSkills({ locale: 'zh-CN' });

    expect(
      zhCnSkills
        .filter(
          (skill) =>
            skill.content !== englishSkills.find((base) => base.name === skill.name)?.content,
        )
        .map((skill) => skill.name),
    ).toEqual(localizedBuiltinPromptNames);
    expect(
      validateBuiltinSkillLocaleParity({
        defaultSkills: englishSkills,
        localizedSkills: zhCnSkills,
        locale: 'zh-cn',
        skillNames: localizedBuiltinPromptNames,
      }),
    ).toEqual([]);
  });

  it('reports stable prompt-token drift between localized builtin prompts', () => {
    expect(
      validateBuiltinSkillLocaleParity({
        defaultSkills: [
          {
            name: 'example',
            content: '# Example\n\n## Rules\n\nUse `imagePrompt` and `videoPrompt`.',
          },
        ],
        localizedSkills: [
          {
            name: 'example',
            content: '# 示例\n\n## 规则\n\n使用 `imagePrompt`。',
          },
        ],
        locale: 'zh-cn',
        skillNames: ['example'],
      }),
    ).toEqual([
      expect.objectContaining({
        skillName: 'example',
        code: 'stable-token-mismatch',
        missingTokens: ['videoPrompt'],
        extraTokens: [],
      }),
    ]);
  });
});
