import { describe, expect, it } from 'vitest';
import { Live2dBundleLoader } from './Live2dBundleLoader';
import { nestedLive2dModel3Json } from './__fixtures__/live2dBundleFixtures';

class FakeEntry {
  readonly isDirectory = false;
  readonly header: { readonly size: number; readonly compressedSize: number };

  constructor(
    readonly entryName: string,
    readonly bytes: Buffer,
  ) {
    this.header = { size: bytes.length, compressedSize: bytes.length };
  }
}

class FakeZip {
  private readonly entries: FakeEntry[];

  constructor(_bytes: Buffer) {
    this.entries = [
      entry(
        'avatars/sakura/sakura.model3.json',
        JSON.stringify({
          ...nestedLive2dModel3Json,
          FileReferences: {
            ...nestedLive2dModel3Json.FileReferences,
            Moc: 'sakura.moc3',
            Textures: ['textures/texture_00.png'],
            Physics: 'physics/sakura.physics3.json',
            Motions: {
              Idle: [{ File: 'motions/idle.motion3.json' }],
            },
          },
        }),
      ),
      entry('avatars/sakura/sakura.moc3', 'moc-bytes'),
      entry('avatars/sakura/textures/texture_00.png', 'png-bytes'),
      entry('avatars/sakura/expressions/smile.exp3.json', '{"Expression":"smile"}'),
      entry('avatars/sakura/motions/idle.motion3.json', '{"Motion":"idle"}'),
      entry('avatars/sakura/physics/sakura.physics3.json', '{"Physics":true}'),
    ];
  }

  getEntries(): FakeEntry[] {
    return this.entries;
  }

  getEntry(entryName: string): FakeEntry | null {
    return this.entries.find((entry) => entry.entryName === entryName) ?? null;
  }

  readFile(entry: string | FakeEntry): Buffer | null {
    const resolved = typeof entry === 'string' ? this.getEntry(entry) : entry;
    return resolved?.bytes ?? null;
  }

  readAsText(entry: string | FakeEntry): string {
    const bytes = this.readFile(entry);
    return bytes?.toString('utf-8') ?? '';
  }
}

describe('Live2dBundleLoader', () => {
  it('loads model3.json bundle metadata and runtime payloads from ZIP memory', () => {
    const loader = new Live2dBundleLoader({
      zipConstructor: FakeZip,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    const result = loader.loadLive2dBundle('./sakura.zip', Buffer.from('zip-bytes'));

    expect(result.projectData.puppet.src).toBeNull();
    expect(result.projectData.puppet.bundle?.manifest.entryPath).toBe(
      'avatars/sakura/sakura.model3.json',
    );
    expect(result.projectData.bundleIndex?.textures[0]?.locator.entryPath).toBe(
      'avatars/sakura/textures/texture_00.png',
    );
    expect(result.runtime.mocData).toBe(Buffer.from('moc-bytes').toString('base64'));
    expect(result.runtime.textures[0]).toMatchObject({
      index: 0,
      data: Buffer.from('png-bytes').toString('base64'),
      mimeType: 'image/png',
    });
    expect(result.runtime.auxiliary.motions).toEqual([['Idle-1', '{"Motion":"idle"}']]);
    expect(result.runtime.auxiliary.expressions).toEqual([['smile', '{"Expression":"smile"}']]);
    expect(result.runtime.auxiliary.physics).toBe('{"Physics":true}');
  });

  it('rejects ZIP fixtures with missing texture references before runtime loading', () => {
    class MissingTextureZip extends FakeZip {
      override getEntries(): FakeEntry[] {
        return super
          .getEntries()
          .filter((entry) => entry.entryName !== 'avatars/sakura/textures/texture_00.png');
      }
    }

    const loader = new Live2dBundleLoader({ zipConstructor: MissingTextureZip });

    expect(() => loader.loadLive2dBundle('./sakura.zip', Buffer.from('zip-bytes'))).toThrow(
      'Live2D bundle entry is missing: avatars/sakura/textures/texture_00.png',
    );
  });

  it('rejects ZIP fixtures with duplicate normalized entries', () => {
    class DuplicateEntryZip extends FakeZip {
      override getEntries(): FakeEntry[] {
        return [...super.getEntries(), entry('avatars\\sakura\\sakura.moc3', 'duplicate')];
      }
    }

    const loader = new Live2dBundleLoader({ zipConstructor: DuplicateEntryZip });

    expect(() => loader.loadLive2dBundle('./sakura.zip', Buffer.from('zip-bytes'))).toThrow(
      'Duplicate ZIP entry after normalization: avatars/sakura/sakura.moc3',
    );
  });
});

function entry(entryName: string, content: string): FakeEntry {
  return new FakeEntry(entryName, Buffer.from(content, 'utf-8'));
}
