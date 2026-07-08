import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import type {
  NksLayerData,
  ProjectFileOps,
  ProjectSourceAddResult,
  PsdImportPayloadWire,
} from '@neko/shared';
import {
  createDefaultNksDocument,
  scanNekoProjectAuthoringCoreDependencies,
} from '@neko/shared';
import { createPoisonedNekoProjectAuthoringRoute } from '@neko/shared/project-authoring/test-helpers';
import { SketchProjectAuthoringService } from './SketchProjectAuthoringService';

describe('SketchProjectAuthoringService', () => {
  it('creates file-backed NKS projects without opening a Webview', async () => {
    const fileOps = createMemoryFileOps();
    const service = new SketchProjectAuthoringService({ fileOps });

    const result = await service.createProject({
      target: {
        kind: 'new',
        documentUri: 'file:///project/generated.nks',
        title: 'Generated Sketch',
        reveal: false,
      },
      options: { width: 1280, height: 720, backgroundColor: '#101010' },
    });

    expect(result).toMatchObject({
      ok: true,
      documentUri: 'file:///project/generated.nks',
      created: true,
      revealed: false,
      target: { kind: 'new', created: true, reveal: false },
      data: {
        canvas: {
          width: 1280,
          height: 720,
          backgroundColor: '#101010',
        },
      },
    });
    expect(fileOps.readText('/project/generated.nks')).toContain('"width": 1280');
    expect(fileOps.readText('/project/generated.nks')).toContain('"height": 720');
  });

  it('updates explicit file targets through project-file IO', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit.nks': JSON.stringify(createDocument({ width: 640, height: 480 })),
    });
    const service = new SketchProjectAuthoringService({ fileOps });
    const nextDocument = createDocument({
      width: 1920,
      height: 1080,
      layers: [createRasterLayer('layer-generated', 'Generated Layer')],
    });

    const result = await service.updateProjectData({
      target: { kind: 'file', documentUri: 'file:///project/edit.nks' },
      document: nextDocument,
    });

    expect(result.ok).toBe(true);
    expect(result.documentUri).toBe('file:///project/edit.nks');
    expect(fileOps.readText('/project/edit.nks')).toContain('"width": 1920');
    expect(fileOps.readText('/project/edit.nks')).toContain('"Generated Layer"');
  });

  it('fails create-new requests when the host adapter has not resolved documentUri', async () => {
    const service = new SketchProjectAuthoringService({ fileOps: createMemoryFileOps() });

    const result = await service.createProject({
      target: { kind: 'new', title: 'Needs adapter target' },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'workspace-required',
        message: 'Sketch create-new authoring requires an adapter-resolved documentUri.',
      }),
    ]);
  });

  it('applies package-owned document edits and returns layer refs', async () => {
    const fileOps = createMemoryFileOps({
      '/project/edit-plan.nks': JSON.stringify(createDocument({ width: 800, height: 600 })),
    });
    const service = new SketchProjectAuthoringService({ fileOps });

    const result = await service.applyDocumentEdits({
      target: { kind: 'file', documentUri: 'file:///project/edit-plan.nks' },
      edits: [
        { kind: 'set-canvas', canvas: { width: 1024, height: 768 } },
        { kind: 'append-layer', layer: createRasterLayer('layer-imported', 'Imported') },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        layerIds: ['layer-imported'],
        document: {
          canvas: { width: 1024, height: 768 },
          layers: [expect.objectContaining({ id: 'layer-imported', name: 'Imported' })],
        },
      },
    });
    expect(fileOps.readText('/project/edit-plan.nks')).toContain('"Imported"');
  });

  it('saves and reopens headless edits from project-file state', async () => {
    const fileOps = createMemoryFileOps({
      '/project/reopen.nks': JSON.stringify(createDocument({ width: 320, height: 240 })),
    });
    const service = new SketchProjectAuthoringService({ fileOps });

    await service.applyDocumentEdits({
      target: { kind: 'file', documentUri: 'file:///project/reopen.nks' },
      edits: [{ kind: 'append-layer', layer: createRasterLayer('layer-reopen', 'Reopen') }],
    });

    const reopened = await new SketchProjectAuthoringService({ fileOps }).loadProject({
      target: { kind: 'file', documentUri: 'file:///project/reopen.nks' },
    });

    expect(reopened.ok).toBe(true);
    expect(reopened.data?.layers).toEqual([
      expect.objectContaining({ id: 'layer-reopen', name: 'Reopen' }),
    ]);
  });

  it('imports image sources into explicit file targets without a Webview executor', async () => {
    const legacyImportAsset = createPoisonedNekoProjectAuthoringRoute('neko.sketch.importAsset');
    const fileOps = createMemoryFileOps({
      '/project/image.nks': JSON.stringify(createDocument({ width: 640, height: 480 })),
    });
    const ingestSource = vi.fn(async () =>
      createSourceResult({ durablePath: 'imports/generated.png' }),
    );
    const service = new SketchProjectAuthoringService({
      fileOps,
      ingestSource,
      createId: createSequentialIdFactory(),
    });

    const result = await service.importImageSource({
      target: { kind: 'file', documentUri: 'file:///project/image.nks' },
      bytes: createPngHeader(32, 16),
      name: 'generated.png',
      mimeType: 'image/png',
      role: 'generated-image',
      requestId: 'image-request-1',
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        layerId: 'layer-1',
        sourcePath: 'imports/generated.png',
        layer: {
          id: 'layer-1',
          name: 'generated',
          width: 32,
          height: 16,
          source: {
            path: 'imports/generated.png',
            role: 'generated-image',
            mimeType: 'image/png',
          },
        },
      },
    });
    expect(ingestSource).toHaveBeenCalledWith(
      'file:///project/image.nks',
      expect.objectContaining({
        requestId: 'image-request-1',
        kind: 'generated-output',
        metadata: expect.objectContaining({
          sourceCommand: 'neko.sketch.authoring.importImageSource',
        }),
      }),
    );
    expect(fileOps.readText('/project/image.nks')).toContain('"source"');
    expect(fileOps.readText('/project/image.nks')).toContain('"imports/generated.png"');
    legacyImportAsset.assertNotCalled();
  });

  it('returns source diagnostics when image ingest cannot produce a durable path', async () => {
    const fileOps = createMemoryFileOps({
      '/project/reject.nks': JSON.stringify(createDocument({ width: 640, height: 480 })),
    });
    const service = new SketchProjectAuthoringService({
      fileOps,
      ingestSource: vi.fn(async () => createFailedSourceResult()),
    });

    const result = await service.importImageSource({
      target: { kind: 'file', documentUri: 'file:///project/reject.nks' },
      sourcePath: 'blob:runtime',
      name: 'runtime.png',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'runtime-handle-persisted',
        message: 'Runtime source rejected.',
      }),
    ]);
    expect(fileOps.readText('/project/reject.nks')).not.toContain('blob:runtime');
  });

  it('imports PSD payloads as durable NKS layers without Webview mapping', async () => {
    const fileOps = createMemoryFileOps({
      '/project/psd.nks': JSON.stringify(createDocument({ width: 1, height: 1 })),
    });
    const service = new SketchProjectAuthoringService({
      fileOps,
      createId: createSequentialIdFactory(),
    });

    const result = await service.importPsdPayload({
      target: { kind: 'file', documentUri: 'file:///project/psd.nks' },
      sourcePath: 'imports/source.psd',
      payload: createPsdPayload(),
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        layerIds: ['group-1', 'raster-1'],
        document: {
          canvas: { width: 1024, height: 768 },
          layers: [
            expect.objectContaining({
              id: 'group-1',
              type: 'group',
              source: expect.objectContaining({ path: 'imports/source.psd', role: 'psd' }),
              children: [
                expect.objectContaining({
                  id: 'raster-1',
                  name: 'Paint',
                  data: 'AQID',
                }),
              ],
            }),
          ],
        },
      },
    });
    expect(fileOps.readText('/project/psd.nks')).toContain('"imports/source.psd"');
    expect(fileOps.readText('/project/psd.nks')).toContain('"AQID"');
  });

  it('imports PSD sources through ingest before writing layer source refs', async () => {
    const fileOps = createMemoryFileOps({
      '/project/psd-source.nks': JSON.stringify(createDocument({ width: 1, height: 1 })),
    });
    const ingestSource = vi.fn(async () =>
      createSourceResult({ durablePath: 'imports/source.psd' }),
    );
    const service = new SketchProjectAuthoringService({ fileOps, ingestSource });

    const result = await service.importPsdSource({
      target: { kind: 'file', documentUri: 'file:///project/psd-source.nks' },
      sourcePath: '/external/source.psd',
      name: 'source.psd',
      payload: createPsdPayload(),
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        sourcePath: 'imports/source.psd',
        sourceIngest: expect.objectContaining({ durablePath: 'imports/source.psd' }),
      },
    });
    expect(ingestSource).toHaveBeenCalledWith(
      'file:///project/psd-source.nks',
      expect.objectContaining({
        sourcePath: '/external/source.psd',
        metadata: expect.objectContaining({
          sourceCommand: 'neko.sketch.authoring.importPsdSource',
        }),
      }),
    );
    expect(fileOps.readText('/project/psd-source.nks')).toContain('"imports/source.psd"');
    expect(fileOps.readText('/project/psd-source.nks')).not.toContain('/external/source.psd');
  });

  it('keeps the core service free of UI dependencies', () => {
    const source = readFileSync(
      join(__dirname, 'SketchProjectAuthoringService.ts'),
      'utf-8',
    );

    expect(scanNekoProjectAuthoringCoreDependencies(source)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });
});

interface MemoryFileOps extends ProjectFileOps {
  readText(filePath: string): string;
}

function createMemoryFileOps(initial: Record<string, string> = {}): MemoryFileOps {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    async readFile(filePath) {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`Missing file: ${filePath}`);
      }
      return encoder.encode(content);
    },
    async writeFile(filePath, content) {
      files.set(filePath, decoder.decode(content));
    },
    readText(filePath) {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`Missing file: ${filePath}`);
      }
      return content;
    },
  };
}

function createDocument(input: {
  readonly width: number;
  readonly height: number;
  readonly layers?: readonly NksLayerData[];
}) {
  const base = createDefaultNksDocument();
  return {
    ...base,
    canvas: {
      ...base.canvas,
      width: input.width,
      height: input.height,
    },
    layers: input.layers ? [...input.layers] : [],
  };
}

function createRasterLayer(id: string, name: string): NksLayerData {
  return {
    id,
    name,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 512,
    height: 512,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    data: 'base64-image',
  };
}

function createSourceResult(input: { readonly durablePath: string }): ProjectSourceAddResult {
  return {
    requestId: 'source-request',
    ok: true,
    durablePath: input.durablePath,
    diagnostics: [],
  };
}

function createFailedSourceResult(): ProjectSourceAddResult {
  return {
    requestId: 'source-request',
    ok: false,
    diagnostics: [
      {
        code: 'runtime-handle-persisted',
        severity: 'error',
        message: 'Runtime source rejected.',
        recoverability: 'manual',
      },
    ],
  };
}

function createPngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  writeUInt32BE(bytes, width, 16);
  writeUInt32BE(bytes, height, 20);
  return bytes;
}

function writeUInt32BE(bytes: Uint8Array, value: number, offset: number): void {
  bytes[offset] = Math.floor(value / 0x1000000) & 0xff;
  bytes[offset + 1] = (value >> 16) & 0xff;
  bytes[offset + 2] = (value >> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function createPsdPayload(): PsdImportPayloadWire {
  return {
    name: 'source.psd',
    tree: {
      canvas: {
        width: 1024,
        height: 768,
        dpi: 72,
        backgroundColor: '#ffffff',
      },
      layers: [
        {
          id: 'group-1',
          name: 'Group',
          kind: 'group',
          visible: true,
          opacity: 1,
          blendMode: 'pass through',
          clippingMask: false,
          left: 0,
          top: 0,
          width: 1024,
          height: 768,
          children: [
            {
              id: 'raster-1',
              name: 'Paint',
              kind: 'raster',
              visible: true,
              opacity: 0.75,
              blendMode: 'mul ',
              clippingMask: false,
              left: 10,
              top: 20,
              width: 300,
              height: 200,
              pixels: {
                kind: 'encoded',
                dataBase64: 'AQID',
                mimeType: 'image/png',
              },
            },
          ],
        },
      ],
    },
    issues: [],
  };
}

function createSequentialIdFactory(): () => string {
  let next = 1;
  return () => `layer-${next++}`;
}
