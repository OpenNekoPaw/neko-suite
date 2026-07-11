import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZipModule from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import type { PerceptualAssetRef } from '@neko/shared';
import { createGeneratedAssetResourceRef } from '@neko/shared/content-access';
import { createNodeContentAccessRuntime } from '../node-content-access-runtime';
import { createNodeHostAdapter } from '../node-host-adapter';
import { createNodePerceptionAssetLoader } from '../node-perception-asset-loader';
import { createNodeWorkspaceContentHostAdapter } from '../node-workspace-content-host';

const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('createNodePerceptionAssetLoader', () => {
  it('loads media library image refs as provider-ready data URLs', async () => {
    const workDir = createTempDir();
    const mediaRoot = createTempDir();
    const imageBytes = Buffer.from('image-bytes');
    fs.mkdirSync(path.join(workDir, 'neko'), { recursive: true });
    fs.mkdirSync(path.join(mediaRoot, 'images'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ name: 'Assets', path: mediaRoot, variable: 'A' }],
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(mediaRoot, 'images', 'frame.png'), imageBytes);

    const loader = createNodePerceptionAssetLoader(
      createNodeContentAccessRuntime({
        host: createNodeWorkspaceContentHostAdapter({ workDir }),
      }),
    );

    const result = await loader.load({
      assetId: 'asset-1',
      uri: '${A}/images/frame.png',
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('loads generated assets by ResourceRef instead of the display URI', async () => {
    const workDir = createTempDir();
    const generatedPath = path.join(workDir, 'neko/generated/image/asset-1.png');
    const imageBytes = Buffer.from('generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const resourceRef = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '${WORKSPACE}/neko/generated/image/asset-1.png',
      mimeType: 'image/png',
    });
    const loader = createNodePerceptionAssetLoader(
      createNodeContentAccessRuntime({
        host: createNodeWorkspaceContentHostAdapter({ workDir }),
      }),
    );

    const result = await loader.load({
      assetId: 'asset-1',
      uri: 'generated-assets/non-existent-display-label.png',
      mimeType: 'image/png',
      resourceRef,
    });

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('preserves audio payload kind for media library audio refs', async () => {
    const workDir = createTempDir();
    const mediaRoot = createTempDir();
    const audioBytes = Buffer.from('audio-bytes');
    fs.mkdirSync(path.join(workDir, 'neko'), { recursive: true });
    fs.mkdirSync(path.join(mediaRoot, 'audios'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ name: 'Assets', path: mediaRoot, variable: 'A' }],
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(mediaRoot, 'audios', 'dialogue.wav'), audioBytes);

    const loader = createNodePerceptionAssetLoader(
      createNodeContentAccessRuntime({
        host: createNodeWorkspaceContentHostAdapter({ workDir }),
      }),
    );

    const result = await loader.load({
      assetId: 'audio-1',
      uri: '${A}/audios/dialogue.wav',
      mimeType: 'audio/wav',
    });

    expect(result).toEqual({
      kind: 'audio',
      url: `data:audio/wav;base64,${audioBytes.toString('base64')}`,
      mimeType: 'audio/wav',
    });
  });

  it('loads document-entry refs through the TUI content access runtime', async () => {
    const workDir = createTempDir();
    const archivePath = path.join(workDir, 'book.epub');
    const imageBytes = Buffer.from('document-image-bytes');
    const archive = new (AdmZipModule as unknown as AdmZipConstructor)();
    archive.addFile('OPS/images/page-1.jpg', imageBytes);
    archive.writeZip(archivePath);
    const loader = createNodePerceptionAssetLoader(
      createNodeContentAccessRuntime({
        host: createNodeHostAdapter({ workDir }),
      }),
    );
    const documentAsset: PerceptualAssetRef = {
      assetId: 'doc-image-1',
      uri: 'book.epub#OPS/images/page-1.jpg',
      mimeType: 'image/jpeg',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: archivePath, format: 'epub' },
        entryPath: 'OPS/images/page-1.jpg',
        versionPolicy: 'versioned-export',
      },
    };

    const result = await loader.load(documentAsset);

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/jpeg;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/jpeg',
    });
  });
});

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-node-perception-asset-'));
  createdPaths.push(dir);
  return dir;
}

interface AdmZipConstructor {
  new (): {
    addFile(entryPath: string, bytes: Buffer): void;
    writeZip(filePath: string): void;
  };
}
