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
            catalog: {
              role: 'standalone',
              source: 'plugin',
              visibility: 'primary',
              editable: false,
              actions: [{ id: 'run' }],
            },
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
      catalog: {
        role: 'standalone',
        source: 'plugin',
        visibility: 'primary',
        editable: false,
      },
    });
  });

  it('falls back to default skill text when no locale matches', async () => {
    vscodeEnvState.setLanguage('fr');
    installExtension('neko.neko-agent', {
      exports: {
        getSkills: () => [
          {
            id: 'image',
            name: 'Image',
            description: 'Create or edit images.',
            command: 'neko.agent.invokeSkill',
            tags: ['ai'],
          },
        ],
      },
    });

    const [skill] = await new SkillReader().read();

    expect(skill).toMatchObject({
      id: 'image',
      name: 'Image',
      description: 'Create or edit images.',
      locale: 'fr',
      tags: ['ai'],
      catalog: {
        role: 'standalone',
        source: 'builtin',
        visibility: 'primary',
      },
    });
  });

  it('preserves provider catalog metadata', async () => {
    installExtension('neko.neko-agent', {
      exports: {
        getSkills: () => [
          {
            id: 'media-production',
            name: 'Media Production',
            description: 'Coordinate media production.',
            command: 'neko.agent.invokeSkill',
            catalog: {
              role: 'orchestrator',
              source: 'builtin',
              visibility: 'primary',
              editable: false,
              groupId: 'media-production',
              actions: [{ id: 'run' }, { id: 'fork', targetSource: 'project' }],
            },
          },
        ],
      },
    });

    const [skill] = await new SkillReader().read();

    expect(skill?.catalog).toEqual({
      role: 'orchestrator',
      source: 'builtin',
      visibility: 'primary',
      editable: false,
      groupId: 'media-production',
      actions: [{ id: 'run' }, { id: 'fork', targetSource: 'project' }],
    });
  });

  it('excludes quick-action command wrappers and hidden runtime entries from installed Skills', async () => {
    installExtension('neko.neko-agent', {
      exports: {
        getSkills: () => [
          {
            id: 'media-production',
            name: 'Media Production',
            description: 'Coordinate production.',
            catalog: {
              role: 'orchestrator',
              source: 'builtin',
              visibility: 'primary',
              editable: false,
              actions: [{ id: 'run' }],
            },
          },
          {
            id: 'audio-mixing',
            name: 'Audio Mixing',
            description: 'Mix timeline audio.',
            command: 'neko.agent.invokeSkill',
            catalog: {
              role: 'quick-action',
              source: 'builtin',
              visibility: 'primary',
              editable: false,
              actions: [{ id: 'run' }],
            },
          },
          {
            id: 'execution-persona',
            name: 'Execution Persona',
            description: 'Internal execution guidance.',
            catalog: {
              role: 'persona',
              source: 'builtin',
              visibility: 'hidden',
              editable: false,
              actions: [{ id: 'run' }],
            },
          },
        ],
      },
    });
    installExtension('neko.neko-cut', {
      exports: {
        getSkills: () => [
          {
            id: 'generate-video-clip',
            name: 'Generate Video Clip',
            description: 'Feature-package command wrapper.',
            command: 'neko.cut.ai.generateVideoForClip',
          },
        ],
      },
    });

    const skills = await new SkillReader().read();

    expect(skills.map((skill) => skill.id)).toEqual(['media-production']);
  });
});
