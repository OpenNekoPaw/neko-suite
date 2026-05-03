import { describe, expect, it } from 'vitest';
import { projectPluginTransferMenu } from '../plugin-transfer-presenter';

describe('plugin transfer presenter', () => {
  it('projects plugin transfer menu targets by media type and availability', () => {
    expect(
      projectPluginTransferMenu({
        mediaType: 'image',
        plugins: { canvas: true, cut: false },
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
          id: 'explorer',
          label: 'Explorer',
          accepts: ['image', 'video', 'audio'],
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
          accepts: ['image', 'video', 'audio'],
          requiresPlugin: null,
        },
      ],
    });
  });
});
