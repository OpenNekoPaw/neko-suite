import { describe, expect, it } from 'vitest';
import { TOOL_NAMES_PERCEPTION } from '@neko/shared';

import {
  aiGenerateSkill,
  aiGenerateToolDefinitions,
  builtinSkills,
  builtinSkillLocales,
  builtinToolGroups,
  CREATIVE_MEDIA_PROFILES,
  CREATIVE_MEDIA_WORKFLOW_STAGES,
  comicToStoryboardSkill,
  creationPersonaSkill,
  executionPersonaSkill,
  getBuiltinSkills,
  getCanonicalCreativeMediaSkills,
  getComicToStoryboardSkill,
  getMediaWorkflowBuiltinSkills,
  imageSkill,
  iterationPersonaSkill,
  mediaProductionSkill,
  mediaQualityReviewSkill,
  mediaToVideoSkill,
  normalizeBuiltinSkillLocale,
  qualityAssessmentSkill,
  scriptGenerationSkill,
  storyboardSkill,
  validateBuiltinSkillLocaleParity,
  videoSkill,
} from './index';

const localizedBuiltinPromptNames = [
  'creation-persona',
  'execution-persona',
  'iteration-persona',
  'skill-creator',
  'storyboard',
  'image',
  'video',
  'media-production',
  'media-quality-review',
  'scene-to-music',
  'video-editing',
  'color-grading',
  'audio-mixing',
  'subtitle-assistant',
  'script-generation',
  'script-to-timeline',
];

describe('@neko/skills builtins', () => {
  it('registers system skill-creator for explicit dollar Skill invocation', () => {
    const skill = getBuiltinSkills().find((candidate) => candidate.name === 'skill-creator');

    expect(skill).toEqual(
      expect.objectContaining({
        name: 'skill-creator',
        source: 'builtin',
        enabled: true,
      }),
    );
    expect(skill?.command).toBeUndefined();
    expect(skill?.content).toContain('Any host-supported authoring path may create');
    expect(skill?.content).toContain('not mandatory Skill-creation gates');
    expect(skill?.content).toContain('A root `manifest.json` is not part');
  });

  it('retains legacy exports while returning only canonical media workflow skills', () => {
    expect(comicToStoryboardSkill.name).toBe('comic-to-storyboard');
    expect(mediaToVideoSkill.name).toBe('media-to-video');
    expect(getMediaWorkflowBuiltinSkills().map((skill) => skill.name)).toEqual([
      'storyboard',
      'image',
      'video',
      'media-production',
      'media-quality-review',
    ]);
  });

  it('registers canonical creative skills once and keeps profiles and stages out of the peer catalog', () => {
    const canonicalNames = [
      'storyboard',
      'image',
      'video',
      'media-production',
      'media-quality-review',
    ];
    const legacyPeerNames = [
      'ai-generate',
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
    const registeredSkills = getBuiltinSkills();
    const registeredNames = registeredSkills.map((skill) => skill.name);

    for (const name of canonicalNames) {
      expect(registeredNames.filter((candidate) => candidate === name)).toHaveLength(1);
    }
    for (const name of legacyPeerNames) {
      expect(registeredNames).not.toContain(name);
    }
    expect(getCanonicalCreativeMediaSkills().map((skill) => skill.name)).toEqual(canonicalNames);
    expect(CREATIVE_MEDIA_PROFILES.map((profile) => profile.id)).toEqual(
      expect.arrayContaining([
        'storyboard/from-comic',
        'media-production/from-comic',
        'image/outpaint',
        'video/generate-from-keyframes',
      ]),
    );
    expect(CREATIVE_MEDIA_WORKFLOW_STAGES.map((stage) => stage.id)).toEqual(
      expect.arrayContaining(['animation-planning', 'generated-shot-assembly', 'preflight-export']),
    );
    for (const profile of CREATIVE_MEDIA_PROFILES) {
      expect(registeredNames).not.toContain(profile.id);
    }
    for (const stage of CREATIVE_MEDIA_WORKFLOW_STAGES) {
      expect(registeredNames).not.toContain(stage.id);
    }
    for (const skill of registeredSkills) {
      expect(skill.command).toBeUndefined();
      expect(skill.toolDefinitions).toBeUndefined();
    }
  });

  it('exposes capability-neutral canonical image guidance without broad quality claims', () => {
    expect(imageSkill.content).toContain('capability-neutral image operation');
    expect(imageSkill.content).toContain('Negotiate adapter support');
    expect(imageSkill.content).toContain(
      'Do not claim aesthetic, character-consistency, or policy approval without QualityEvidence',
    );
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
    expect(zhCnSkills.find((skill) => skill.name === 'image')?.description).toContain('图片');
    expect(zhCnSkills.find((skill) => skill.name === 'storyboard')?.description).toContain(
      'canonical Storyboard',
    );
    expect(zhCnSkills.find((skill) => skill.name === 'video-editing')?.description).not.toContain(
      'Video editing assistant',
    );
  });

  it('keeps comic storyboard visual evidence contract aligned with runtime perception capabilities', () => {
    const english = getComicToStoryboardSkill().content;
    const zhCn = getComicToStoryboardSkill('zh-CN').content;

    expect(english).toContain('runtime content/perception capability guidance');
    expect(english).toContain('current visual evidence path');
    expect(english).toContain(
      'Metadata, perception cards, thumbnails, filenames, dimensions, and page labels alone are not visual evidence.',
    );
    expect(english).toContain('do not output any Markdown table');
    expect(english).not.toContain('ReadDocument');
    expect(english).not.toContain('ReadImage');
    expect(english).not.toContain('QuerySemanticCoverage');

    expect(zhCn).toContain('运行时 content/perception 能力说明');
    expect(zhCn).toContain('当前视觉证据链');
    expect(zhCn).toContain('metadata/感知卡、缩略图、文件名、尺寸列表和页码本身不是视觉证据。');
    expect(zhCn).toContain('不要输出任何 Markdown 表格');
    expect(zhCn).not.toContain('ReadDocument');
    expect(zhCn).not.toContain('ReadImage');
    expect(zhCn).not.toContain('QuerySemanticCoverage');
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
    expect(english).toContain('`generate-video`: write a complete scene video generation prompt');
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
      'Do not use Canvas authoring capabilities instead of generating the storyboard table.',
    );
    expect(english).toContain(
      'The first storyboard draft must be visible as an assistant Markdown block before any Canvas handoff is attempted.',
    );
    expect(english).toContain(
      'If no visible assistant Markdown block or UI handoff source exists yet',
    );
    expect(english).toContain('Canvas authoring lifecycle capability');
    expect(english).toContain('runtime Canvas capability context');
    expect(english).toContain('The Canvas package owns concrete operations');
    expect(english).toContain('Do not substitute a review-only table/draft path');
    expect(english).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(english).not.toContain('canvas.ingestMarkdown');

    expect(zhCn).toContain(
      '当用户要求“生成分镜表并发送到 Canvas”时，先完成并输出唯一的 Markdown creative table。',
    );
    expect(zhCn).toContain('不要用 Canvas authoring capability 替代分镜表生成。');
    expect(zhCn).toContain('分镜初稿必须先作为可见 assistant Markdown 块出现在聊天中');
    expect(zhCn).toContain('不可见运行时参数');
    expect(zhCn).toContain('先输出表格并停止');
    expect(zhCn).toContain('Canvas authoring lifecycle capability');
    expect(zhCn).toContain('运行时 Canvas capability context');
    expect(zhCn).toContain('具体 operation、目标选择、审批要求');
    expect(zhCn).toContain('不要把 review-only 表格/草稿路径替代为生产分镜交付');
    expect(zhCn).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(zhCn).not.toContain('canvas.ingestMarkdown');
  });

  it('keeps generic Markdown and Canvas authoring details out of storyboard domain skills', () => {
    const english = getComicToStoryboardSkill().content;
    const zhCn = getComicToStoryboardSkill('zh-CN').content;
    const allMarkdownSkillContent = getBuiltinSkills()
      .filter((skill) => localizedBuiltinPromptNames.includes(skill.name))
      .map((skill) => skill.content)
      .join('\n');
    const allMarkdownSkillContentZhCn = getBuiltinSkills({ locale: 'zh-CN' })
      .filter((skill) => localizedBuiltinPromptNames.includes(skill.name))
      .map((skill) => skill.content)
      .join('\n');

    expect(english).toContain('shared Markdown/profile layer');
    expect(english).toContain('This skill only chooses storyboard fields');
    expect(english).not.toContain('Markdown renderer behavior');
    expect(english).not.toContain('voicePrompt');

    expect(zhCn).toContain('shared Markdown/profile 层');
    expect(zhCn).toContain('本 Skill 只选择分镜表字段');
    expect(zhCn).not.toContain('Markdown renderer 行为');
    expect(zhCn).not.toContain('voicePrompt');

    expect(allMarkdownSkillContent).not.toContain('reviewStatus');
    expect(allMarkdownSkillContentZhCn).not.toContain('reviewStatus');
  });

  it('keeps concrete tool protocols out of builtin skill prompt content', () => {
    const allPromptContent = [
      ...getBuiltinSkills().map((skill) => skill.content),
      ...getBuiltinSkills({ locale: 'zh-CN' }).map((skill) => skill.content),
    ].join('\n');
    const disallowedPromptTokens = [
      'ReadDocument',
      'ReadImage',
      'QuerySemanticCoverage',
      'GenerateImage',
      'TransformImage',
      'GenerateVideo',
      'GenerateMusic',
      'QualityCheck',
      'QualityRepairCheck',
      'AddEffect',
      'SetColorCorrection',
      'SetAudioProperties',
      'AddTimelineElement',
      'UpdateTimelineElement',
      'AddTrack',
      'TaskWrite',
      'GetTimelineInfo',
      'ListTimelineElements',
      'task_output',
      'canvas.createStoryboardFromMarkdown',
      'canvas.ingestMarkdown',
      'neko.story.toTimeline',
      'neko.<domain>.authoring',
      'QuickPick',
      'SaveDialog',
      'VSCode command',
      'Parameters:',
      'Key Params',
      'Default Parameters',
      '工具参数',
      '带工具名和参数',
    ];

    for (const token of disallowedPromptTokens) {
      expect(allPromptContent).not.toContain(token);
    }
  });

  it('keeps media generation completion claims grounded in runtime capability results', () => {
    expect(aiGenerateSkill.content).toContain(
      'Start media generation by submitting the appropriate runtime media capability',
    );
    expect(aiGenerateSkill.content).toContain(
      'report success only from confirmed runtime capability results',
    );
    expect(aiGenerateSkill.content).toContain(
      'before success is confirmed, describe only planned, submitted, pending, blocked, or failed state',
    );
  });

  it('owns all non-runtime builtin skill and tool group definitions', () => {
    expect(aiGenerateSkill.name).toBe('ai-generate');
    expect(aiGenerateToolDefinitions.map((definition) => definition.name)).toContain(
      'GenerateImage',
    );
    expect(scriptGenerationSkill.name).toBe('script-generation');
    expect(qualityAssessmentSkill.name).toBe('quality-assessment');
    expect(storyboardSkill.name).toBe('storyboard');
    expect(imageSkill.name).toBe('image');
    expect(videoSkill.name).toBe('video');
    expect(mediaProductionSkill.name).toBe('media-production');
    expect(mediaQualityReviewSkill.name).toBe('media-quality-review');
    expect(mediaQualityReviewSkill.allowedTools).toContain(TOOL_NAMES_PERCEPTION.PERCEIVE);
    expect(creationPersonaSkill.name).toBe('creation-persona');
    expect(executionPersonaSkill.name).toBe('execution-persona');
    expect(iterationPersonaSkill.name).toBe('iteration-persona');

    expect(builtinToolGroups.map((group) => group.name)).toContain('perception-evidence');
    expect(getBuiltinSkills().map((skill) => skill.name)).toEqual(
      builtinSkills.map((skill) => skill.name),
    );
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'storyboard')?.content,
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
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'image')?.content,
    ).toContain('capability-neutral 图片操作');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'image')?.content,
    ).not.toContain('# Image');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'image')?.content,
    ).toContain('协商 adapter 支持等级');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'image')?.content,
    ).not.toContain('GenerateImage');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'media-quality-review')
        ?.content,
    ).toContain('媒体质量审查');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'media-quality-review')
        ?.content,
    ).not.toContain('# Media Quality Review');
  });

  it('owns canonical builtin skill catalog display localization metadata', () => {
    expect(builtinSkillLocales.storyboard?.['zh-cn']).toEqual(
      expect.objectContaining({
        name: '分镜',
        description: expect.stringContaining('canonical Storyboard'),
        tags: expect.arrayContaining(['分镜', '镜头', '来源归一化']),
      }),
    );
    expect(builtinSkillLocales['media-production']?.['zh-cn']?.name).toBe('媒体制作');
    expect(builtinSkillLocales['media-quality-review']?.['zh-cn']?.name).toBe('媒体质量审查');
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
