import { describe, expect, it } from 'vitest';

import {
  comicToStoryboardSkill,
  getComicToStoryboardSkill,
  getMediaWorkflowBuiltinSkills,
  mediaToVideoSkill,
  normalizeBuiltinSkillLocale,
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
});
