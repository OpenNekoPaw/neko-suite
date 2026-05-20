import type { BundleArchiveEntryMetadata } from '@neko/shared';

export const nestedLive2dModel3Json = {
  Version: 3,
  FileReferences: {
    Moc: 'model/sakura.moc3',
    Textures: ['textures/texture_00.png', 'textures/texture_01.png'],
    Physics: '../shared/sakura.physics3.json',
    Expressions: [{ Name: 'smile', File: 'expressions/smile.exp3.json' }],
    Motions: {
      Idle: [{ File: 'motions/idle.motion3.json', FadeInTime: 0.5, FadeOutTime: 1 }],
      TapBody: [{ File: '../shared/motions/tap.motion3.json', Name: 'tap-body' }],
    },
  },
  Groups: [{ Target: 'Parameter', Name: 'EyeBlink', Ids: ['ParamEyeLOpen', 'ParamEyeROpen'] }],
} as const;

export const nestedLive2dBundleEntries = [
  'avatars/sakura/model3.json',
  'avatars/sakura/model/sakura.moc3',
  'avatars/sakura/textures/texture_00.png',
  'avatars/sakura/textures/texture_01.png',
  'avatars/sakura/expressions/smile.exp3.json',
  'avatars/sakura/motions/idle.motion3.json',
  'avatars/shared/motions/tap.motion3.json',
  'avatars/shared/sakura.physics3.json',
] as const;

export function archiveEntries(paths: readonly string[]): BundleArchiveEntryMetadata[] {
  return paths.map((entryPath) => ({
    entryPath,
    uncompressedSize: 1,
  }));
}
