import { describe, expect, it } from 'vitest';
import { projectPluginTransferMenu } from '../plugin-transfer-presenter';

describe('plugin transfer presenter', () => {
  it('projects plugin transfer menu targets by media type and availability', () => {
    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: false, sketch: true },
      }),
    ).toEqual({
      showMenu: true,
      targets: [
        {
          id: 'canvas',
          label: 'Canvas',
          accepts: ['image'],
          requiresPlugin: 'canvas',
        },
        {
          id: 'sketch',
          label: 'Sketch',
          accepts: ['image'],
          requiresPlugin: 'sketch',
        },
        {
          id: 'explorer',
          label: 'Explorer',
          accepts: ['image', 'video', 'audio', 'model'],
          requiresPlugin: null,
        },
      ],
    });

    expect(
      projectPluginTransferMenu({
        mediaType: 'video',
        plugins: { canvas: true, cut: true },
      }).targets.map((target) => target.id),
    ).toEqual(['cut', 'explorer']);

    expect(
      projectPluginTransferMenu({
        mediaType: 'audio',
        plugins: {},
      }),
    ).toEqual({
      showMenu: true,
      targets: [
        {
          id: 'explorer',
          label: 'Explorer',
          accepts: ['image', 'video', 'audio', 'model'],
          requiresPlugin: null,
        },
      ],
    });

    expect(
      projectPluginTransferMenu({
        mediaType: 'model',
        plugins: { model: true },
      }).targets.map((target) => target.id),
    ).toEqual(['model', 'explorer']);
  });

  it('limits structured storyboard payloads to compatible plugin targets', () => {
    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: true },
        structuredKind: 'canvasStoryboard',
      }).targets.map((target) => target.id),
    ).toEqual(['canvas']);

    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: true },
        structuredKind: 'cutStoryboard',
      }).targets.map((target) => target.id),
    ).toEqual(['cut']);
  });
});
