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
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'ai-generate')
        ?.content,
    ).toContain('AI 媒体生成');
    expect(
      getBuiltinSkills({ locale: 'zh-CN' }).find((skill) => skill.name === 'ai-generate')
        ?.content,
    ).not.toContain('AI Media Generation');
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
    expect(builtinSkillLocales['creation-persona']?.['zh-cn']?.description).toContain(
      '共创伙伴',
    );
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
