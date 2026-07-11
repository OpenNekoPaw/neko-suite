import { describe, expect, it } from 'vitest';
import { getCanonicalCreativeMediaSkills } from './creative-media';

const PROVIDER_SPECIFIC_TERMS = [
  'openai',
  'runway',
  'dashscope',
  'kling',
  'luma',
  'vidu',
  'minimax',
  'liblib',
  'startFrameImageBase64',
  'endFrameImageBase64',
  'referenceVideoUrl',
  'sourceVideoUrl',
  'providerId',
  'modelId',
  'taskId',
] as const;

const RUNTIME_PROTOCOL_TERMS = [
  'GenerateVideo',
  'GenerateImage',
  'canvas_generate_',
  'executeCommand(',
  'polling interval',
  'poll task',
  'webview message',
] as const;

describe('canonical creative media Skill content boundaries', () => {
  it.each([undefined, 'zh-CN'])(
    'keeps provider extensions and runtime tool protocols out of Skill content (%s)',
    (locale) => {
      for (const skill of getCanonicalCreativeMediaSkills(locale)) {
        for (const forbidden of [...PROVIDER_SPECIFIC_TERMS, ...RUNTIME_PROTOCOL_TERMS]) {
          expect(skill.content, `${skill.name} leaked ${forbidden}`).not.toContain(forbidden);
        }
      }
    },
  );

  it.each([undefined, 'zh-CN'])(
    'keeps canonical Storyboard image/video prompt semantics distinct (%s)',
    (locale) => {
      const storyboard = getCanonicalCreativeMediaSkills(locale).find(
        (skill) => skill.name === 'storyboard',
      );
      expect(storyboard?.content).toContain('`imagePrompt`');
      expect(storyboard?.content).toContain('`videoPrompt`');
      expect(storyboard?.content).toMatch(/scene-level|scene 级/);
      expect(storyboard?.content).toMatch(/Never collapse|禁止把图片与视频意图合并/);
      expect(storyboard?.content).toMatch(/multiple resources|匹配多个资源/);
    },
  );

  it('keeps operation ids in machine-readable metadata rather than tool tutorials', () => {
    const skills = new Map(getCanonicalCreativeMediaSkills().map((skill) => [skill.name, skill]));
    expect(skills.get('image')?.mediaWorkflow?.operations).toContain('outpaint');
    expect(skills.get('video')?.mediaWorkflow?.operations).toContain('generate-from-keyframes');
    expect(skills.get('video')?.content).not.toContain('startFrameRef:');
    expect(skills.get('image')?.content).not.toContain('outpaintExpansion:');
  });
});
