import { describe, expect, it } from 'vitest';
import {
  expandRuntimePluginTransferInputs,
  buildRuntimePluginSlashCommandDispatch,
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
  createRuntimePluginSlashCommandRegistry,
} from '../plugin-transfer-runtime';

describe('plugin transfer runtime', () => {
  it('builds cross-plugin transfer command plans', () => {
    expect(
      buildRuntimePluginTransferPlan({
        target: 'canvas',
        assetPath: '/tmp/image.png',
        mediaType: 'image',
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: { path: '/tmp/image.png', type: 'image' },
    });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'cut',
        assetPath: '/tmp/sound.wav',
        mediaType: 'audio',
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.cut.importGeneratedClip',
      payload: { assetPath: '/tmp/sound.wav', mediaType: 'audio' },
    });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'sketch',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/frame.png', mediaType: 'image', name: 'Frame' },
        },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.sketch.importAsset',
      payload: { path: '/tmp/frame.png', name: 'Frame' },
    });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'sketch',
        assetPath: '/tmp/movie.mp4',
        mediaType: 'video',
      }),
    ).toEqual({ status: 'unsupported', target: 'sketch' });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'model',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/character.glb', mediaType: 'model', name: 'Character' },
        },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.model.importAsset',
      payload: { path: '/tmp/character.glb', name: 'Character' },
    });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'model',
        assetPath: '/tmp/frame.png',
        mediaType: 'image',
      }),
    ).toEqual({ status: 'unsupported', target: 'model' });
  });

  it('builds structured canvas storyboard transfer plans', () => {
    const storyboard = {
      mode: 'semantic' as const,
      sourceScriptUri: 'agent://rich-content/storyboard',
      scenes: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'Opening',
          sceneNumber: 1,
          shotPlans: [
            {
              shotNumber: 1,
              duration: 3,
              visualDescription: 'Wide establishing frame',
              characters: [],
              shotScale: 'MS' as const,
              characterAction: '',
              emotion: [],
              sceneTags: [],
            },
          ],
        },
      ],
    };

    expect(
      buildRuntimePluginTransferPlan({
        target: 'canvas',
        payload: { kind: 'canvasStoryboard', storyboard },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.canvas.importStoryboard',
      payload: storyboard,
    });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'cut',
        payload: { kind: 'canvasStoryboard', storyboard },
      }),
    ).toEqual({ status: 'unsupported', target: 'cut' });
  });

  it('builds structured cut storyboard transfer plans', () => {
    const storyboard = {
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 3,
          imagePath: '/repo/shot-1.png',
          label: '#001',
        },
      ],
    };

    expect(
      buildRuntimePluginTransferPlan({
        target: 'cut',
        payload: { kind: 'cutStoryboard', storyboard },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.cut.importStoryboard',
      payload: storyboard,
    });

    expect(
      buildRuntimePluginTransferPlan({
        target: 'canvas',
        payload: { kind: 'cutStoryboard', storyboard },
      }),
    ).toEqual({ status: 'unsupported', target: 'canvas' });
  });

  it('expands asset batch transfers into single-asset inputs', () => {
    expect(
      expandRuntimePluginTransferInputs({
        target: 'cut',
        payload: {
          kind: 'assetBatch',
          assets: [
            { path: '/tmp/a.png', mediaType: 'image' },
            { path: '/tmp/b.wav', mediaType: 'audio' },
          ],
        },
      }),
    ).toEqual([
      {
        target: 'cut',
        payload: { kind: 'singleAsset', asset: { path: '/tmp/a.png', mediaType: 'image' } },
      },
      {
        target: 'cut',
        payload: { kind: 'singleAsset', asset: { path: '/tmp/b.wav', mediaType: 'audio' } },
      },
    ]);
  });

  it('rejects direct batch planning without expansion', () => {
    expect(() =>
      buildRuntimePluginTransferPlan({
        target: 'cut',
        payload: {
          kind: 'assetBatch',
          assets: [{ path: '/tmp/a.png', mediaType: 'image' }],
        },
      } as Parameters<typeof buildRuntimePluginTransferPlan>[0]),
    ).toThrow('Unsupported plugin transfer payload kind: assetBatch');
  });

  it('builds plugin slash command dispatch plans', () => {
    expect(
      buildRuntimePluginSlashCommandDispatch({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.nekocanvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'selected shots',
      }),
    ).toEqual({
      command: 'neko.nekocanvas.slashCommand.batch',
      invocation: {
        extensionId: 'neko.nekocanvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'selected shots',
      },
    });
  });

  it('aggregates plugin slash commands in stable extension order', () => {
    const registry = createRuntimePluginSlashCommandRegistry();

    registry.register('neko.z', [
      { id: 'export', name: '/export', description: 'Export storyboard' },
    ]);
    registry.register('neko.a', [
      { id: 'batch', name: '/batch', description: 'Batch generate', icon: 'image' },
    ]);

    expect(registry.getAll()).toEqual([
      {
        id: 'batch',
        name: '/batch',
        description: 'Batch generate',
        icon: 'image',
        extensionId: 'neko.a',
      },
      {
        id: 'export',
        name: '/export',
        description: 'Export storyboard',
        extensionId: 'neko.z',
      },
    ]);
  });

  it('replaces and unregisters plugin slash commands by extension', () => {
    const registry = createRuntimePluginSlashCommandRegistry();

    registry.register('neko.canvas', [
      { id: 'batch', name: '/batch', description: 'Batch generate' },
    ]);
    registry.register('neko.canvas', [
      { id: 'export', name: '/export', description: 'Export storyboard' },
    ]);

    expect(registry.getAll()).toEqual([
      {
        id: 'export',
        name: '/export',
        description: 'Export storyboard',
        extensionId: 'neko.canvas',
      },
    ]);
    expect(registry.unregister('neko.canvas')).toBe(true);
    expect(registry.unregister('neko.canvas')).toBe(false);
    expect(registry.getAll()).toEqual([]);
  });

  it('projects installed neko plugins to a webview message', () => {
    expect(
      buildRuntimePluginsAvailableMessage({
        hasExtension: (extensionId) => extensionId === 'neko.nekocanvas',
      }),
    ).toEqual({
      type: 'pluginsAvailable',
      plugins: {
        canvas: true,
        cut: false,
        sketch: false,
        model: false,
      },
    });
  });
});
