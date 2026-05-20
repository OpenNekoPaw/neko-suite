import { describe, expect, it, vi } from 'vitest';
import { ModelAssetExportService } from './ModelAssetExportService';

describe('ModelAssetExportService', () => {
  it('exports custom clips to an .nkma artifact without touching model.src', async () => {
    const fs = createFs({
      '/repo/hero.nkm': JSON.stringify(projectFixture()),
      '/repo/hero.glb': new Uint8Array([1, 2, 3]),
    });
    const service = new ModelAssetExportService({
      fs,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    const result = await service.exportMotions({
      sourcePath: '/repo/hero.nkm',
      outputPath: '/repo/out/hero-motions.nkma',
    });

    expect(result.manifest?.typeMetadata).toMatchObject({
      type: 'media',
      data: { mediaKind: 'model-motion' },
    });
    expect(JSON.parse(String(fs.files.get('/repo/out/hero-motions.nkma')))).toMatchObject({
      format: 'nkma',
      clips: [{ name: 'wave' }],
    });
    expect(fs.files.get('/repo/hero.glb')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('exports face/camera/editor config to a new .nkmc artifact', async () => {
    const fs = createFs({ '/repo/hero.nkm': JSON.stringify(projectFixture()) });
    const service = new ModelAssetExportService({ fs });

    await service.exportConfig({
      sourcePath: '/repo/hero.nkm',
      outputPath: '/repo/out/hero-config.nkmc',
    });

    expect(JSON.parse(String(fs.files.get('/repo/out/hero-config.nkmc')))).toMatchObject({
      format: 'nkmc',
      faceParams: { Blink: 0.5 },
      camera: { fov: 45 },
      editorState: { selectedNodeId: 'head' },
    });
    expect(fs.files.has('/repo/out/hero-config.nkmc.manifest.json')).toBe(true);
  });

  it('rejects malformed .nkm project data before export', async () => {
    const fs = createFs({
      '/repo/broken.nkm': JSON.stringify({
        version: 2,
        name: 'Broken',
        model: {},
      }),
    });
    const service = new ModelAssetExportService({ fs });

    await expect(
      service.exportConfig({
        sourcePath: '/repo/broken.nkm',
        outputPath: '/repo/out/broken-config.nkmc',
      }),
    ).rejects.toThrow('model.src must be a string or null');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('reports invalid JSON as an .nkm project parse failure', async () => {
    const fs = createFs({ '/repo/broken.nkm': '{' });
    const service = new ModelAssetExportService({ fs });

    await expect(
      service.exportMotions({
        sourcePath: '/repo/broken.nkm',
        outputPath: '/repo/out/broken-motions.nkma',
      }),
    ).rejects.toThrow('Invalid .nkm project JSON');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

function projectFixture() {
  return {
    version: 2,
    name: 'Hero',
    model: { src: './hero.glb' },
    faceParams: { Blink: 0.5 },
    customClips: [
      {
        name: 'wave',
        duration: 1,
        channels: [
          {
            targetNode: 'arm',
            property: 'rotation',
            keyframes: [
              {
                id: 'kf1',
                timestamp: 0,
                values: [0, 0, 0, 1],
                easing: 'linear',
              },
            ],
          },
        ],
      },
    ],
    camera: {
      position: [0, 1, 3],
      target: [0, 1, 0],
      up: [0, 1, 0],
      fov: 45,
    },
    viewport: { zoom: 1 },
    editorState: { selectedNodeId: 'head' },
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
      files.set(filePath, Buffer.from(data).toString('utf-8'));
    }),
    createDirectory: vi.fn(async () => undefined),
  };
}
