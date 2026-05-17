import { beforeEach, describe, expect, it } from 'vitest';
import { installExtension, vscodeEnvState, vscodeExtensionState } from './vscode-test-double';
import { SkillReader } from './skillReader';

describe('SkillReader', () => {
  beforeEach(() => {
    vscodeEnvState.reset();
    vscodeExtensionState.reset();
  });

  it('resolves localized skill text for the VSCode language', async () => {
    vscodeEnvState.setLanguage('zh-CN');
    installExtension('neko.neko-cut', {
      exports: {
        getSkills: () => [
          {
            id: 'generate-video-clip',
            name: 'Generate Video Clip',
            description: 'Generate a clip.',
            command: 'neko.cut.ai.generateVideoForClip',
            tags: ['generation', 'video'],
            locales: {
              'zh-cn': {
                name: '生成视频片段',
                description: '生成一个视频片段。',
                tags: ['生成', '视频'],
              },
            },
          },
        ],
      },
    });

    const [skill] = await new SkillReader().read();

    expect(skill).toMatchObject({
      id: 'generate-video-clip',
      extensionId: 'neko.neko-cut',
      name: '生成视频片段',
      description: '生成一个视频片段。',
      locale: 'zh-cn',
      tags: ['生成', '视频'],
    });
  });

  it('falls back to default skill text when no locale matches', async () => {
    vscodeEnvState.setLanguage('fr');
    installExtension('neko.neko-agent', {
      exports: {
        getSkills: () => [
          {
            id: 'ai-generate',
            name: 'AI Generate',
            description: 'Generate media.',
            command: 'neko.agent.invokeSkill',
            tags: ['ai'],
          },
        ],
      },
    });

    const [skill] = await new SkillReader().read();

    expect(skill).toMatchObject({
      id: 'ai-generate',
      name: 'AI Generate',
      description: 'Generate media.',
      locale: 'fr',
      tags: ['ai'],
    });
  });
});
