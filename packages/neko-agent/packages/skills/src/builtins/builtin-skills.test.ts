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
} from './index';

describe('@neko-agent/skills builtins', () => {
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
    expect(getComicToStoryboardSkill('zh-CN').description).toContain('分镜');
    expect(getComicToStoryboardSkill('en-US')).toBe(comicToStoryboardSkill);
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
  });
});
