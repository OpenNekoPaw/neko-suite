import { describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '../../types/project';
import {
  ProjectFileStore,
  ProjectFormatCodecRegistry,
  InMemoryProjectDocumentHost,
  applyPortableSourcePathPolicy,
  createDefaultProjectFormatCodecRegistry,
  createProjectFileDiagnostic,
  detectRuntimeOrCacheSourceHandle,
  handleProjectSourceAddRequest,
  nkpSourcePathPolicy,
  nkmSourcePathPolicy,
  nkvSourcePathPolicy,
  resolveProjectSourceDiagnostics,
  toContentIngestRequest,
  type PortableSourcePathPolicy,
  type ProjectFileOps,
  type ProjectFormatCodec,
} from '../index';

describe('ProjectFormatCodecRegistry', () => {
  it('registers codecs by format id and extension', () => {
    const registry = new ProjectFormatCodecRegistry();
    registry.register(createJsonCodec('demo', '.ndemo'));

    expect(registry.get('demo')?.formatId).toBe('demo');
    expect(registry.getByExtension('/workspace/file.ndemo')?.formatId).toBe('demo');
  });

  it('rejects duplicate extensions', () => {
    const registry = new ProjectFormatCodecRegistry();
    registry.register(createJsonCodec('left', '.nkt'));

    expect(() => registry.register(createJsonCodec('right', '.nkt'))).toThrow('already registered');
  });
});

describe('ProjectFileStore', () => {
  it('loads invalid JSON as diagnostics without replacing the file', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({ '/project/edit.nkv': '{bad json' }),
    });

    const result = await store.load<ProjectData>({ filePath: '/project/edit.nkv' });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-json')).toBe(true);
    expect(result.document?.tracks).toEqual([]);
  });

  it('saves file-backed project content to injected file ops', async () => {
    const files = createMemoryFileOps();
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });

    const project: ProjectData = {
      version: '2.0',
      name: 'Cut',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      tracks: [],
    };
    const result = await store.save({ filePath: '/project/edit.nkv', document: project });

    expect(result.ok).toBe(true);
    expect(result.written).toBe(true);
    expect(files.readText('/project/edit.nkv')).toContain('"name": "Cut"');
  });

  it('supports save-as and revert through the shared store', async () => {
    const files = createMemoryFileOps({
      '/project/source.nkv': JSON.stringify(createProject('source')),
    });
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: files,
    });

    const saveAs = await store.saveAs({
      filePath: '/project/copy.nkv',
      document: createProject('copy'),
    });
    const reverted = await store.revert<ProjectData>({ filePath: '/project/source.nkv' });

    expect(saveAs.ok).toBe(true);
    expect(files.readText('/project/copy.nkv')).toContain('"name": "copy"');
    expect(reverted.ok).toBe(true);
    expect(reverted.document?.name).toBe('source');
  });

  it('reports backup failure diagnostics', async () => {
    const fileOps = createMemoryFileOps();
    fileOps.writeFile = vi.fn(async () => {
      throw new Error('disk full');
    });
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps,
    });

    const result = await store.backup({
      filePath: '/project/edit.nkv',
      backupPath: '/backup/edit.nkv',
      document: createProject('backup'),
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('backup-failed');
  });

  it('serializes concurrent saves for the same document', async () => {
    const writes: string[] = [];
    const fileOps = createMemoryFileOps();
    fileOps.writeFile = vi.fn(async (filePath, content) => {
      await Promise.resolve();
      writes.push(`${filePath}:${new TextDecoder().decode(content)}`);
    });
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps,
    });

    const first = createProject('first');
    const second = createProject('second');
    await Promise.all([
      store.save({ filePath: '/project/edit.nkv', document: first, atomic: false }),
      store.save({ filePath: '/project/edit.nkv', document: second, atomic: false }),
    ]);

    expect(writes).toHaveLength(2);
    expect(writes[0]).toContain('"name": "first"');
    expect(writes[1]).toContain('"name": "second"');
  });
});

describe('default project format codecs', () => {
  it('registers nkv, nkc, nka, nks, nkp, and nkm', () => {
    const registry = createDefaultProjectFormatCodecRegistry();

    expect(registry.getByExtension('cut.nkv')?.formatId).toBe('nkv');
    expect(registry.getByExtension('canvas.nkc')?.formatId).toBe('nkc');
    expect(registry.getByExtension('audio.nka')?.formatId).toBe('nka');
    expect(registry.getByExtension('sketch.nks')?.formatId).toBe('nks');
    expect(registry.getByExtension('puppet.nkp')?.formatId).toBe('nkp');
    expect(registry.getByExtension('model.nkm')?.formatId).toBe('nkm');
  });

  it('marks future nkm documents read-only', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({
        '/project/model.nkm': JSON.stringify({
          version: 999,
          name: 'Future',
          model: { src: 'hero.glb' },
          faceParams: {},
          customClips: [],
          camera: null,
          viewport: { zoom: 1 },
          editorState: {},
        }),
      }),
    });

    const result = await store.load({ filePath: '/project/model.nkm' });

    expect(result.readOnly).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unsupported-version',
    );
  });

  it('loads .nkm profile: 2d scene authoring data through the model codec', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({
        '/project/scene.nkm': JSON.stringify({
          version: 2,
          name: '2D Scene',
          profile: '2d',
          model: { src: null },
          scene2d: {
            sprites: [{ id: 'sprite-1', assetRef: './hero.png' }],
            tilemaps: [
              {
                id: 'tilemap-1',
                tilesetRef: './tiles.png',
                width: 32,
                height: 18,
                tileWidth: 32,
                tileHeight: 32,
              },
            ],
            lights: [{ id: 'light-1', kind: 'point', intensity: 0.8 }],
            camera: { position: [0, 0], zoom: 1 },
          },
          faceParams: {},
          customClips: [],
          camera: null,
          viewport: { zoom: 1 },
          editorState: {},
        }),
      }),
    });

    const result = await store.load({ filePath: '/project/scene.nkm' });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({
      profile: '2d',
      scene2d: {
        sprites: [{ id: 'sprite-1', assetRef: './hero.png' }],
      },
    });
  });

  it('diagnoses .nkp files that contain generic 2D scene authoring fields', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({
        '/project/wrong.nkp': JSON.stringify({
          version: '2.0',
          name: 'Wrong Domain',
          puppet: { src: './model.moc3', format: 'moc3' },
          tilemaps: [],
          sceneCamera: { position: [0, 0], zoom: 1 },
          parameters: {},
          viewport: { zoom: 1 },
        }),
      }),
    });

    const result = await store.load({ filePath: '/project/wrong.nkp' });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('wrong-domain-field');
    expect(result.diagnostics.map((diagnostic) => diagnostic.path?.join('.'))).toEqual(
      expect.arrayContaining(['tilemaps', 'sceneCamera']),
    );
  });
});

describe('portable source path policy', () => {
  it('contracts workspace sources before save', () => {
    const policy = createNkvSourcePolicy();
    const project = createProject('portable', '/workspace/project/media/clip.mp4');

    const result = applyPortableSourcePathPolicy(project, policy, {
      context: {
        owningWorkspaceRoot: '/workspace/project',
        workspaceRoots: ['/workspace/project'],
        pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
      },
    });

    const element = result.document.tracks[0]?.elements[0];
    expect(element?.type === 'media' ? element.src : undefined).toBe('media/clip.mp4');
    expect(result.diagnostics).toEqual([]);
  });

  it('diagnoses non-portable absolute paths', () => {
    const result = applyPortableSourcePathPolicy(
      createProject('external', '/Volumes/media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
      },
    );

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('non-portable-path');
  });

  it('contracts configured variable root sources', () => {
    const result = applyPortableSourcePathPolicy(
      createProject('variable', '/Volumes/media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([
            ['WORKSPACE', '/workspace/project'],
            ['MEDIA', '/Volumes/media'],
          ]),
        },
      },
    );

    const element = result.document.tracks[0]?.elements[0];
    expect(element?.type === 'media' ? element.src : undefined).toBe('${MEDIA}/clip.mp4');
  });

  it('reports missing variables, missing sources, and unauthorized roots during resolution', () => {
    const missingVariable = resolveProjectSourceDiagnostics(
      createProject('missing-var', '${MEDIA}/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: () => true,
      },
    );
    const missingSource = resolveProjectSourceDiagnostics(
      createProject('missing-source', 'media/missing.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: () => false,
      },
    );
    const unauthorized = resolveProjectSourceDiagnostics(
      createProject('unauthorized', '/workspace/project/media/clip.mp4'),
      createNkvSourcePolicy(),
      {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: () => true,
        isPathAuthorized: () => false,
      },
    );

    expect(missingVariable.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unresolved-variable',
    );
    expect(missingSource.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'missing-source',
    );
    expect(unauthorized.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unauthorized-root',
    );
  });

  it('loads projects after cache deletion when durable sources remain valid', async () => {
    const store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps: createMemoryFileOps({
        '/workspace/project/edit.nkv': JSON.stringify(createProject('cached', 'media/clip.mp4')),
      }),
    });

    const result = await store.load<ProjectData>({
      filePath: '/workspace/project/edit.nkv',
      sourcePolicy: createNkvSourcePolicy(),
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: '/workspace/project',
          workspaceRoots: ['/workspace/project'],
          pathVariables: new Map([['WORKSPACE', '/workspace/project']]),
        },
        fileExists: (filePath) => filePath === '/workspace/project/media/clip.mp4',
      },
    });

    expect(result.ok).toBe(true);
    expect(result.document?.name).toBe('cached');
    expect(result.diagnostics).toEqual([]);
  });

  it('diagnoses runtime and cache handles', () => {
    expect(
      detectRuntimeOrCacheSourceHandle({
        id: 'runtime',
        role: 'media',
        path: 'blob:vscode-runtime',
        fieldPath: ['tracks', 0, 'elements', 0, 'src'],
      })?.code,
    ).toBe('runtime-handle-persisted');
    expect(
      detectRuntimeOrCacheSourceHandle({
        id: 'cache',
        role: 'media',
        path: '/workspace/project/.neko/.cache/proxy/clip.mp4',
        fieldPath: ['tracks', 0, 'elements', 0, 'src'],
      })?.code,
    ).toBe('cache-source-persisted');
  });
});

describe('source descriptor helpers', () => {
  it('lists and replaces nkv timeline sources', () => {
    const project = createProject('timeline', '/workspace/project/media/clip.mp4');
    const descriptors = nkvSourcePathPolicy.listSources(project);
    const replaced = nkvSourcePathPolicy.replaceSources(project, [
      { descriptor: descriptors[0]!, path: 'media/clip.mp4' },
    ]);

    expect(descriptors[0]?.fieldPath).toEqual(['tracks', 0, 'elements', 0, 'src']);
    expect(
      replaced.tracks[0]?.elements[0]?.type === 'media' ? replaced.tracks[0].elements[0].src : '',
    ).toBe('media/clip.mp4');
  });

  it('lists nkp and nkm source fields', () => {
    const nkpSources = nkpSourcePathPolicy.listSources({
      version: '2.0',
      name: 'Puppet',
      puppet: { src: './hero.moc3' },
      parameters: {},
      viewport: { zoom: 1 },
    });
    const nkmSources = nkmSourcePathPolicy.listSources({
      version: 2,
      name: 'Model',
      model: { src: './hero.glb' },
      faceParams: {},
      customClips: [],
      camera: null,
      viewport: { zoom: 1 },
      editorState: {},
    });

    expect(nkpSources.map((source) => source.id)).toContain('puppet.src');
    expect(nkmSources.map((source) => source.id)).toContain('model.src');
  });
});

describe('InMemoryProjectDocumentHost', () => {
  it('tracks dirty, clean, readonly, and error states', () => {
    const host = new InMemoryProjectDocumentHost({
      formatId: 'nkv',
      document: createProject('draft'),
      diagnostics: [],
    });

    host.applyEdit({
      apply: (document) => ({ ...document, name: 'edited' }),
    });
    expect(host.snapshot.state).toBe('dirty');
    expect(host.snapshot.version).toBe(1);
    host.markClean();
    expect(host.snapshot.state).toBe('clean');
    host.markReadonly([
      createProjectFileDiagnostic({ code: 'unsupported-version', message: 'future' }),
    ]);
    expect(host.snapshot.state).toBe('readonly');
    host.markError([createProjectFileDiagnostic({ code: 'write-failed', message: 'nope' })]);
    expect(host.snapshot.state).toBe('error');
  });
});

describe('project source add DTOs', () => {
  it('projects add-source intent to content ingest request', () => {
    const request = toContentIngestRequest({
      requestId: 'add-1',
      kind: 'drag-drop',
      formatId: 'nkv',
      documentUri: 'file:///workspace/project/edit.nkv',
      sourcePath: '/workspace/project/media/clip.mp4',
      browserFile: {
        name: 'clip.mp4',
        type: 'video/mp4',
      },
      destination: {
        kind: 'project',
        projectRoot: '/workspace/project',
        copyMode: 'register',
      },
      caller: 'neko-cut',
    });

    expect(request.mode).toBe('register-existing-source');
    expect(request.sourcePath).toBe('/workspace/project/media/clip.mp4');
    expect(request.fileName).toBe('clip.mp4');
    expect(request.metadata?.['projectFormatId']).toBe('nkv');
  });

  it('handles source add through injected ingest port', async () => {
    const result = await handleProjectSourceAddRequest(
      {
        requestId: 'add-2',
        kind: 'file-picker',
        formatId: 'nkv',
        sourcePath: '/workspace/project/media/clip.mp4',
        destination: {
          kind: 'project',
          projectRoot: '/workspace/project',
          copyMode: 'register',
        },
      },
      {
        ingest: async (request) => ({
          status: 'ready',
          request,
          source: { kind: 'file', path: 'media/clip.mp4' },
          contractedPath: 'media/clip.mp4',
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.durablePath).toBe('media/clip.mp4');
  });

  it('diagnoses Webview-only file names and blob URLs before ingest', async () => {
    const fileNameOnly = await handleProjectSourceAddRequest(
      {
        requestId: 'add-3',
        kind: 'drag-drop',
        formatId: 'nkv',
        browserFile: { name: 'clip.mp4' },
        destination: { kind: 'project', projectRoot: '/workspace/project' },
      },
      { ingest: vi.fn() },
    );
    const blobUrl = await handleProjectSourceAddRequest(
      {
        requestId: 'add-4',
        kind: 'drag-drop',
        formatId: 'nkv',
        sourcePath: 'blob:runtime',
        destination: { kind: 'project', projectRoot: '/workspace/project' },
      },
      { ingest: vi.fn() },
    );

    expect(fileNameOnly.ok).toBe(false);
    expect(fileNameOnly.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'missing-source',
    );
    expect(blobUrl.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'runtime-handle-persisted',
    );
  });
});

function createJsonCodec(formatId: string, extension: string): ProjectFormatCodec<unknown> {
  return {
    formatId,
    fileExtensions: [extension],
    currentVersion: '1',
    load(json) {
      return { document: JSON.parse(json) as unknown, diagnostics: [] };
    },
    save(document) {
      return { content: JSON.stringify(document, null, 2), diagnostics: [] };
    },
  };
}

function createMemoryFileOps(initial: Record<string, string> = {}): ProjectFileOps & {
  readText(filePath: string): string;
} {
  const files = new Map(Object.entries(initial));
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    async readFile(filePath) {
      const content = files.get(filePath);
      if (content === undefined) throw new Error(`missing ${filePath}`);
      return encoder.encode(content);
    },
    async writeFile(filePath, content) {
      files.set(filePath, decoder.decode(content));
    },
    async renameFile(fromPath, toPath) {
      const content = files.get(fromPath);
      if (content === undefined) throw new Error(`missing ${fromPath}`);
      files.set(toPath, content);
      files.delete(fromPath);
    },
    async deleteFile(filePath) {
      files.delete(filePath);
    },
    readText(filePath) {
      return files.get(filePath) ?? '';
    },
  };
}

function createProject(name: string, src?: string): ProjectData {
  return {
    version: '2.0',
    name,
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: src
      ? [
          {
            id: 'track-1',
            name: 'Main',
            type: 'media',
            muted: false,
            locked: false,
            hidden: false,
            isMain: true,
            elements: [
              {
                id: 'element-1',
                type: 'media',
                name: 'Clip',
                src,
                duration: 1,
                startTime: 0,
                trimStart: 0,
                trimEnd: 0,
                transform: {
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0,
                  anchorY: 0,
                },
                opacity: 1,
                blendMode: 'normal',
                effects: [],
                muted: false,
                hidden: false,
                locked: false,
              },
            ],
          },
        ]
      : [],
  };
}

function createNkvSourcePolicy(): PortableSourcePathPolicy<ProjectData> {
  return {
    listSources(document) {
      return document.tracks.flatMap((track, trackIndex) =>
        track.elements.flatMap((element, elementIndex) => {
          if (
            (element.type === 'media' ||
              element.type === 'audio' ||
              element.type === 'scene3d' ||
              element.type === 'puppet') &&
            element.src
          ) {
            return [
              {
                id: element.id,
                role: element.type,
                path: element.src,
                fieldPath: ['tracks', trackIndex, 'elements', elementIndex, 'src'],
                allowRemote: element.type === 'media',
              },
            ];
          }
          return [];
        }),
      );
    },
    replaceSources(document, replacements) {
      const byId = new Map(
        replacements.map((replacement) => [replacement.descriptor.id, replacement.path]),
      );
      return {
        ...document,
        tracks: document.tracks.map((track) => ({
          ...track,
          elements: track.elements.map((element) => {
            const nextPath = byId.get(element.id);
            return nextPath && 'src' in element ? { ...element, src: nextPath } : element;
          }),
        })),
      };
    },
  };
}

void createProjectFileDiagnostic;
