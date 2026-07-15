import { describe, expect, it } from 'vitest';
import { TOOL_NAMES_PERCEPTION, TOOL_NAMES_QUALITY } from '@neko/shared';
import * as builtinExports from './index';

import {
  builtinSkills,
  builtinSkillLocales,
  builtinToolGroups,
  CREATIVE_MEDIA_PROFILES,
  getBuiltinSkills,
  getCanonicalCreativeMediaSkills,
  imageSkill,
  mediaProductionSkill,
  mediaQualityReviewSkill,
  normalizeBuiltinSkillLocale,
  scriptGenerationSkill,
  storyboardSkill,
  validateBuiltinSkillLocaleParity,
  videoSkill,
} from './index';

const localizedBuiltinPromptNames = [
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

  it('removes legacy creative Skill runtime exports instead of only hiding them from the catalog', () => {
    const removedExports = [
      'aiGenerateSkill',
      'aiGenerateToolDefinitions',
      'comicToStoryboardSkill',
      'getComicToStoryboardSkill',
      'mediaToVideoSkill',
      'getMediaToVideoSkill',
      'comicToAnimationSkill',
      'getComicToAnimationSkill',
      'imageToShotSkill',
      'getImageToShotSkill',
      'storyboardToAnimationPlanSkill',
      'getStoryboardToAnimationPlanSkill',
      'animationPlanToCutSkill',
      'getAnimationPlanToCutSkill',
      'generatedShotAssemblySkill',
      'getGeneratedShotAssemblySkill',
      'exportVideoPackageSkill',
      'getExportVideoPackageSkill',
      'getMediaWorkflowBuiltinSkills',
    ];

    for (const exportName of removedExports) {
      expect(Object.hasOwn(builtinExports, exportName), exportName).toBe(false);
    }
  });

  it('publishes only the canonical QualityCheck tool identity', () => {
    expect(TOOL_NAMES_QUALITY).toEqual({ QUALITY_CHECK: 'QualityCheck' });
    expect(Object.values(TOOL_NAMES_QUALITY)).not.toContain('QualityRepairCheck');
    expect(Object.values(TOOL_NAMES_QUALITY)).not.toContain('QualityCheckConsistency');
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
    for (const profile of CREATIVE_MEDIA_PROFILES) {
      expect(registeredNames).not.toContain(profile.id);
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

  it('keeps localized canonical builtin skill content in the skills package', () => {
    expect(normalizeBuiltinSkillLocale('zh-CN')).toBe('zh-cn');
    expect(normalizeBuiltinSkillLocale('zh-TW')).toBe('zh-cn');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'storyboard')?.content,
    ).toContain('漫画来源 profile');
    expect(
      getBuiltinSkills({ locale: 'zh-TW' }).find((skill) => skill.name === 'storyboard')?.content,
    ).toContain('漫画来源 profile');
    expect(getBuiltinSkills({ locale: 'en-US' }).find((skill) => skill.name === 'storyboard')).toBe(
      storyboardSkill,
    );
  });

  it('keeps locale-neutral portable package identity when localizing content', () => {
    const english = getBuiltinSkills({ locale: 'en-US' }).find(
      (skill) => skill.name === 'storyboard',
    );
    const localized = getBuiltinSkills({ locale: 'zh-CN' }).find(
      (skill) => skill.name === 'storyboard',
    );

    expect(localized?.content).not.toBe(english?.content);
    expect(localized?.portableDefinition).toEqual({
      name: english?.name,
      description: english?.description,
      body: english?.content,
      allowedTools: english?.allowedTools,
    });
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
    expect(zhCnSkills.find((skill) => skill.name === 'media-production')?.description).toContain(
      '当前证据',
    );
    expect(
      zhCnSkills.find((skill) => skill.name === 'media-production')?.description,
    ).not.toContain('完整流程');
    expect(zhCnSkills.find((skill) => skill.name === 'video-editing')?.description).not.toContain(
      'Video editing assistant',
    );
  });

  it('migrates comic visual-evidence methodology into the canonical storyboard Skill', () => {
    const english = storyboardSkill.content;
    const zhCn = getBuiltinSkills({ locale: 'zh-CN' }).find(
      (skill) => skill.name === 'storyboard',
    )?.content;

    expect(english).toContain('actual pixel-level visual evidence, OCR, or panel boundaries');
    expect(english).toContain(
      'Metadata, thumbnails, filenames, dimensions, and page labels alone are not visual evidence.',
    );
    expect(english).toContain('avoid authoritative panel/shot claims');
    expect(english).toContain('partial Markdown review');
    expect(english).not.toContain('ReadDocument');
    expect(english).not.toContain('ReadImage');
    expect(english).not.toContain('QuerySemanticCoverage');

    expect(zhCn).toContain('实际像素级视觉证据、OCR 或分格边界');
    expect(zhCn).toContain('metadata、缩略图、文件名、尺寸和页码本身不是视觉证据。');
    expect(zhCn).toContain('不得给出权威分格/镜头断言');
    expect(zhCn).toContain('仍可用 Markdown 保留已知来源事实');
    expect(zhCn).not.toContain('ReadDocument');
    expect(zhCn).not.toContain('ReadImage');
    expect(zhCn).not.toContain('QuerySemanticCoverage');
  });

  it('migrates generation-effective comic prompt constraints without restoring a stage Skill', () => {
    const english = storyboardSkill.content;
    const zhCn = getBuiltinSkills({ locale: 'zh-CN' }).find(
      (skill) => skill.name === 'storyboard',
    )?.content;

    expect(english).toContain(
      'Image generation prompts cover appearance, environment, composition/camera',
    );
    expect(english).toContain(
      'crop/split/rotate/colorize/redraw/remove-text/inpaint/outpaint/upscale',
    );
    expect(english).toContain('Scene video prompts cover source/reference roles');
    expect(english).toContain('ordered or time-coded action beats');
    expect(english).toContain('Long scenes should use explicit beat or time segments');
    expect(english).toContain('ambiguous references, conflicting instructions, overloaded content');
    expect(english).toContain('leave `imagePrompt` empty instead of inventing edit work');
    expect(english).toContain('`videoPrompt` is scene-level');

    expect(zhCn).toContain('图片生成提示词覆盖人物/主体外观、环境、构图/镜头');
    expect(zhCn).toContain('裁切/切分/旋转/上色/重绘/去文字/局部重绘/扩图/放大/风格统一');
    expect(zhCn).toContain('scene 视频提示词覆盖来源/参考用途');
    expect(zhCn).toContain('按镜号或时间段排列的动作节拍');
    expect(zhCn).toContain('长 scene 应使用明确节拍或时间段');
    expect(zhCn).toContain('引用模糊、指令冲突、内容过载');
    expect(zhCn).toContain('`imagePrompt` 应留空，不得为了填表编造编辑任务');
    expect(zhCn).toContain('`videoPrompt` 是 scene 级字段');
  });

  it('defaults to flexible Markdown and gates structured Storyboard authoring on explicit intent', () => {
    const english = storyboardSkill.content;
    const zhCn = getBuiltinSkills({ locale: 'zh-CN' }).find(
      (skill) => skill.name === 'storyboard',
    )?.content;

    expect(english).toContain('Default to one reviewable Markdown document.');
    expect(english).toContain('Only explicit professional structured authoring');
    expect(english).toContain('without requiring fixed columns');
    expect(english).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(english).not.toContain('canvas.ingestMarkdown');

    expect(zhCn).toContain('默认产出一份可审阅的普通 Markdown 文档');
    expect(zhCn).toContain('只有明确的专业结构化 authoring');
    expect(zhCn).toContain('不强制固定列');
    expect(zhCn).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(zhCn).not.toContain('canvas.ingestMarkdown');
  });

  it('keeps renderer and package-specific authoring protocols out of canonical storyboard guidance', () => {
    const english = storyboardSkill.content;
    const zhCn = getBuiltinSkills({ locale: 'zh-CN' }).find(
      (skill) => skill.name === 'storyboard',
    )?.content;
    const allPromptContent = [
      ...getBuiltinSkills().map((skill) => skill.content),
      ...getBuiltinSkills({ locale: 'zh-CN' }).map((skill) => skill.content),
    ].join('\n');

    expect(english).not.toContain('Markdown renderer behavior');
    expect(english).not.toContain('voicePrompt');
    expect(zhCn).not.toContain('Markdown renderer 行为');
    expect(zhCn).not.toContain('voicePrompt');
    expect(allPromptContent).not.toContain('reviewStatus');
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
      'subagent_output',
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
    for (const skill of [imageSkill, videoSkill]) {
      expect(skill.content).toContain('confirmed runtime capability result');
      expect(skill.content).toContain('planned, submitted, pending, blocked, or failed');
    }
  });

  it('guides evidence-first creator review and actionable creative work units', () => {
    const content = mediaProductionSkill.content;

    expect(content).toContain('observed facts, Agent interpretation, creator decisions');
    expect(content).toContain('optional `brief.md`');
    expect(content).toContain('optional living `plan.md`');
    expect(content).toContain('trigger and skip conditions');
    expect(content).toContain('capability intent');
    expect(content).toContain('acceptance evidence');
    expect(content).toContain('failure or degraded branch');
    expect(content).toContain('Editing Markdown does not execute it');
    expect(content).toContain(
      'A simple low-risk operation may proceed without creating planning files',
    );
    expect(content).toContain('Reuse current Storyboards');
    expect(content).toContain('renewed creator approval');
    expect(content).toContain('`blocked`, `degraded`, or `partial`');
  });

  it.each([
    ['comic', ['page', 'panel', 'reading-order', 'dialogue', 'character appearance']],
    ['screenplay', ['scene headings', 'action', 'dialogue', 'location', 'timing intent']],
    [
      'novel',
      [
        'chapter or scene boundaries',
        'point of view',
        'narration',
        'dialogue',
        'adaptation omissions',
      ],
    ],
    [
      'illustration',
      ['visible composition', 'subjects', 'layers', 'palette', 'spatial relationships'],
    ],
  ] as const)('grounds %s planning in source-specific evidence', (_source, evidenceTerms) => {
    for (const term of evidenceTerms) {
      expect(mediaProductionSkill.content).toContain(term);
    }
  });

  it('reuses current Storyboard and project evidence instead of forcing document creation', () => {
    const content = mediaProductionSkill.content;

    expect(content).toContain('Existing Storyboards and projects use their current revision');
    expect(content).toContain('owned shots or timeline state');
    expect(content).toContain('mark it skipped or reused rather than rebuilding it');
    expect(content).toContain(
      'A simple low-risk operation may proceed without creating planning files',
    );
    expect(content).not.toContain('must create `brief.md`');
    expect(content).not.toContain('must create `plan.md`');
  });

  it('keeps creative plan guidance free of executable workflow state and Tool protocol', () => {
    const content = mediaProductionSkill.content;
    const forbidden = [
      'workflowNodeId',
      'operationSchema',
      'toolCallId',
      'pollingInterval',
      'Webview',
      'stageTracking',
      'ExecutionPlan',
      'GenerateImage',
      'ReadDocument',
    ];

    for (const token of forbidden) {
      expect(content).not.toContain(token);
    }
    expect(mediaProductionSkill.allowedTools).toBeUndefined();
  });

  it('owns all non-runtime builtin skill and tool group definitions', () => {
    expect(scriptGenerationSkill.name).toBe('script-generation');
    expect(storyboardSkill.name).toBe('storyboard');
    expect(imageSkill.name).toBe('image');
    expect(videoSkill.name).toBe('video');
    expect(mediaProductionSkill.name).toBe('media-production');
    expect(mediaQualityReviewSkill.name).toBe('media-quality-review');
    expect(mediaQualityReviewSkill.allowedTools).toContain(TOOL_NAMES_PERCEPTION.PERCEIVE);

    expect(builtinToolGroups.map((group) => group.name)).toContain('perception-evidence');
    expect(builtinToolGroups.map((group) => group.name)).not.toContain('plan-mode');
    expect(builtinToolGroups.flatMap((group) => group.tools)).not.toEqual(
      expect.arrayContaining(['EnterPlanMode', 'ExitPlanMode']),
    );
    expect(builtinToolGroups.find((group) => group.name === 'media-qa')?.tools).toEqual([
      'QualityCheck',
    ]);
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
