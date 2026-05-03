import { describe, expect, it } from 'vitest';
import {
  buildRuntimePluginSlashCommandDispatch,
  buildRuntimePluginTransferPlan,
  buildRuntimePluginsAvailableMessage,
  createRuntimePluginSlashCommandRegistry,
} from '../plugin-transfer-runtime';

describe('plugin transfer runtime', () => {
  it('builds cross-plugin transfer command plans', () => {
    expect(
      buildRuntimePluginTransferPlan({ target: 'canvas', assetPath: '/tmp/image.png' }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: { path: '/tmp/image.png' },
    });
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
      },
    });
  });
});
