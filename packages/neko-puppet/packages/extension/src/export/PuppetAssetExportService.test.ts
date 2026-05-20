import { describe, expect, it, vi } from 'vitest';
import { PuppetAssetExportService } from './PuppetAssetExportService';

describe('PuppetAssetExportService', () => {
  it('exports bundle-backed model entries without mutating the original ZIP', async () => {
    const writtenZips: FakeZip[] = [];
    const sourceZip = new FakeZip();
    sourceZip.addFile('model/sakura.moc3', Buffer.from('moc'));
    sourceZip.addFile('textures/texture_00.png', Buffer.from('png'));
    sourceZip.addFile('motions/idle.motion3.json', Buffer.from('{}'));
    sourceZip.addFile('expressions/smile.exp3.json', Buffer.from('{}'));
    const fs = createFs({
      '/repo/sakura.nkp.puppet.bundle': JSON.stringify({
        version: '1.0',
        name: 'Sakura',
        puppet: {
          src: null,
          format: 'moc3',
          bundle: {
            path: './sakura.zip',
            manifest: locator('./sakura.zip', 'model3.json'),
            moc: locator('./sakura.zip', 'model/sakura.moc3'),
          },
        },
        bundleIndex: {
          storageMode: 'bundle-memory',
          manifest: locator('./sakura.zip', 'model3.json'),
          moc: locator('./sakura.zip', 'model/sakura.moc3'),
          textures: [{ index: 0, locator: locator('./sakura.zip', 'textures/texture_00.png') }],
          motions: [
            {
              name: 'idle',
              group: 'Idle',
              locator: locator('./sakura.zip', 'motions/idle.motion3.json'),
            },
          ],
          expressions: [
            { name: 'smile', locator: locator('./sakura.zip', 'expressions/smile.exp3.json') },
          ],
        },
        parameters: {},
        viewport: { zoom: 1 },
      }),
      '/repo/sakura.zip': Buffer.from('source-zip'),
    });
    const service = new PuppetAssetExportService({
      fs,
      zipConstructor: fakeZipConstructor({
        sourceZip,
        writtenZips,
      }),
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    const result = await service.exportModel({
      sourcePath: '/repo/sakura.nkp.puppet.bundle',
      outputPath: '/repo/out/sakura-model.zip',
    });

    expect(result.manifest?.typeMetadata).toMatchObject({
      type: 'media',
      data: { mediaKind: 'puppet-model' },
    });
    expect([...(writtenZips[0]?.entries.keys() ?? [])]).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'package.json',
        'model/model/sakura.moc3',
        'model/textures/texture_00.png',
      ]),
    );
    expect(fs.files.get('/repo/out/sakura-model.zip')).toBeInstanceOf(Buffer);
    expect([...sourceZip.entries.keys()]).toEqual(
      expect.arrayContaining([
        'model/sakura.moc3',
        'textures/texture_00.png',
        'motions/idle.motion3.json',
        'expressions/smile.exp3.json',
      ]),
    );
  });

  it('exports bundle-backed motions and config as independent packages', async () => {
    const writtenZips: FakeZip[] = [];
    const sourceZip = new FakeZip();
    sourceZip.addFile('motions/idle.motion3.json', Buffer.from('{}'));
    sourceZip.addFile('expressions/smile.exp3.json', Buffer.from('{}'));
    const projectJson = JSON.stringify({
      version: '1.0',
      name: 'Sakura',
      puppet: {
        src: null,
        bundle: {
          path: './sakura.zip',
          manifest: locator('./sakura.zip', 'model3.json'),
          moc: locator('./sakura.zip', 'model/sakura.moc3'),
        },
      },
      bundleIndex: {
        storageMode: 'bundle-memory',
        manifest: locator('./sakura.zip', 'model3.json'),
        moc: locator('./sakura.zip', 'model/sakura.moc3'),
        textures: [],
        motions: [
          {
            name: 'idle',
            group: 'Idle',
            locator: locator('./sakura.zip', 'motions/idle.motion3.json'),
          },
        ],
        expressions: [
          { name: 'smile', locator: locator('./sakura.zip', 'expressions/smile.exp3.json') },
        ],
      },
      parameters: {},
      viewport: { zoom: 1 },
    });
    const service = new PuppetAssetExportService({
      fs: createFs({
        '/repo/sakura.nkp.puppet.bundle': projectJson,
        '/repo/sakura.zip': Buffer.from('source-zip'),
      }),
      zipConstructor: fakeZipConstructor({ sourceZip, writtenZips }),
    });

    await service.exportMotions({
      sourcePath: '/repo/sakura.nkp.puppet.bundle',
      outputPath: '/repo/out/sakura-motions.zip',
    });
    await service.exportConfig({
      sourcePath: '/repo/sakura.nkp.puppet.bundle',
      outputPath: '/repo/out/sakura-config.zip',
    });

    expect(writtenZips[0]?.entries.has('motions/motions/idle.motion3.json')).toBe(true);
    expect(writtenZips[1]?.entries.has('config/expressions/smile.exp3.json')).toBe(true);
  });
});

function locator(bundlePath: string, entryPath: string) {
  return {
    bundlePath,
    entryPath,
    fragmentRef: `${bundlePath}#${entryPath}`,
  };
}

class FakeZip {
  readonly entries = new Map<string, Buffer>();

  constructor(_data?: Buffer) {}

  getEntries() {
    return [...this.entries.keys()].map((entryName) => ({ entryName, isDirectory: false }));
  }

  getEntry(entryName: string) {
    return this.entries.has(entryName) ? { entryName, isDirectory: false } : null;
  }

  readFile(entry: string | { readonly entryName: string }) {
    const entryName = typeof entry === 'string' ? entry : entry.entryName;
    return this.entries.get(entryName) ?? null;
  }

  addFile(entryName: string, data: Buffer) {
    this.entries.set(entryName, Buffer.from(data));
  }

  toBuffer() {
    return Buffer.from(JSON.stringify([...this.entries.keys()]), 'utf-8');
  }
}

function fakeZipConstructor(options: {
  readonly sourceZip: FakeZip;
  readonly writtenZips: FakeZip[];
}) {
  return class TestZip extends FakeZip {
    constructor(data?: Buffer) {
      super(data);
      if (data) {
        for (const [entryName, bytes] of options.sourceZip.entries) {
          this.addFile(entryName, bytes);
        }
      } else {
        options.writtenZips.push(this);
      }
    }
  };
}

function createFs(initialFiles: Record<string, string | Uint8Array>) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    readFile: vi.fn(async (filePath: string) => {
      const file = files.get(filePath);
      if (file === undefined) throw new Error(`Missing file: ${filePath}`);
      return typeof file === 'string' ? Buffer.from(file, 'utf-8') : file;
    }),
    writeFile: vi.fn(async (filePath: string, data: Uint8Array) => {
      files.set(filePath, data);
    }),
    createDirectory: vi.fn(async () => undefined),
  };
}
