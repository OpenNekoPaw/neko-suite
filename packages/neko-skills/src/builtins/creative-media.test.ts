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

  it('keeps operation ids in machine-readable metadata rather than tool tutorials', () => {
    const skills = new Map(getCanonicalCreativeMediaSkills().map((skill) => [skill.name, skill]));
    expect(skills.get('image')?.mediaWorkflow?.operations).toContain('outpaint');
    expect(skills.get('video')?.mediaWorkflow?.operations).toContain('generate-from-keyframes');
    expect(skills.get('video')?.content).not.toContain('startFrameRef:');
    expect(skills.get('image')?.content).not.toContain('outpaintExpansion:');
  });
});
