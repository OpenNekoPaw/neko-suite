import * as crypto from 'crypto';
import * as path from 'path';
import type {
  BundleArchiveEntryMetadata,
  NkpProjectData,
  PuppetAuxiliaryJsonData,
  PuppetExternalTextureData,
} from '@neko/shared';
import { parseLive2dModel3Manifest, type Live2dBundleManifest } from './model3Manifest';

interface AdmZipEntryHeaderLike {
  readonly size?: number;
  readonly compressedSize?: number;
}

interface AdmZipEntryLike {
  readonly entryName: string;
  readonly isDirectory: boolean;
  readonly header?: AdmZipEntryHeaderLike;
}

interface AdmZipLike {
  getEntries(): AdmZipEntryLike[];
  getEntry(entryName: string): AdmZipEntryLike | null;
  readFile(entry: string | AdmZipEntryLike): Buffer | null;
  readAsText(entry: string | AdmZipEntryLike): string;
}

type AdmZipConstructor = new (data: Buffer) => AdmZipLike;

export interface Live2dBundleRuntimeData {
  readonly mocData: string;
  readonly textures: readonly PuppetExternalTextureData[];
  readonly auxiliary: PuppetAuxiliaryJsonData;
}

export interface Live2dBundleLoadResult {
  readonly projectData: NkpProjectData;
  readonly manifest: Live2dBundleManifest;
  readonly runtime: Live2dBundleRuntimeData;
}

export interface Live2dBundleLoaderOptions {
  readonly zipConstructor?: AdmZipConstructor;
  readonly now?: () => Date;
}

export class Live2dBundleLoader {
  private readonly zipConstructor: AdmZipConstructor;
  private readonly now: () => Date;

  constructor(options: Live2dBundleLoaderOptions = {}) {
    this.zipConstructor = options.zipConstructor ?? loadAdmZipConstructor();
    this.now = options.now ?? (() => new Date());
  }

  loadLive2dBundle(bundlePath: string, bytes: Uint8Array): Live2dBundleLoadResult {
    const zipBytes = Buffer.from(bytes);
    const zip = new this.zipConstructor(zipBytes);
    const entries = zip.getEntries();
    const archiveEntries = entries.map(entryToMetadata);
    const manifestEntry = findModel3Entry(entries);
    if (!manifestEntry) {
      throw new Error('Live2D ZIP does not contain model3.json.');
    }

    const model3Json = zip.readAsText(manifestEntry);
    const manifestResult = parseLive2dModel3Manifest({
      bundlePath,
      manifestEntryPath: manifestEntry.entryName,
      model3Json,
      archiveEntries,
      contentHash: `sha256:${crypto.createHash('sha256').update(zipBytes).digest('hex')}`,
      generatedAt: this.now().toISOString(),
    });
    if (!manifestResult.ok) {
      throw new Error(
        manifestResult.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
      );
    }

    const manifest = manifestResult.manifest;
    const mocBytes = this.readRequiredEntry(zip, manifest.moc.entryPath);
    const runtime: Live2dBundleRuntimeData = {
      mocData: mocBytes.toString('base64'),
      textures: manifest.textures.map((texture) => ({
        index: texture.index,
        data: this.readRequiredEntry(zip, texture.locator.entryPath).toString('base64'),
        mimeType: 'image/png',
        name: texture.name,
        locator: texture.locator,
      })),
      auxiliary: {
        motions: manifest.motions.map((motion) => [
          motion.name,
          this.readRequiredEntry(zip, motion.locator.entryPath).toString('utf-8'),
        ]),
        expressions: manifest.expressions.map((expression) => [
          expression.name,
          this.readRequiredEntry(zip, expression.locator.entryPath).toString('utf-8'),
        ]),
        physics: manifest.physics
          ? this.readRequiredEntry(zip, manifest.physics.entryPath).toString('utf-8')
          : undefined,
      },
    };

    return {
      projectData: {
        version: '1.0',
        name: projectNameFromBundlePath(bundlePath),
        puppet: {
          src: null,
          format: 'moc3',
          bundle: manifest.bundle,
        },
        bundleIndex: manifest.bundleIndex,
        parameters: {},
        viewport: { zoom: 1 },
      },
      manifest,
      runtime,
    };
  }

  private readRequiredEntry(zip: AdmZipLike, entryPath: string): Buffer {
    const bytes = zip.readFile(entryPath);
    if (!bytes) {
      throw new Error(`Live2D bundle entry could not be read: ${entryPath}`);
    }
    return bytes;
  }
}

function loadAdmZipConstructor(): AdmZipConstructor {
  const loaded = require('adm-zip') as unknown;
  if (typeof loaded !== 'function') {
    throw new Error('adm-zip module did not provide a constructor.');
  }
  return loaded as AdmZipConstructor;
}

function findModel3Entry(entries: readonly AdmZipEntryLike[]): AdmZipEntryLike | null {
  const model3Entries = entries
    .filter((entry) => !entry.isDirectory && /(?:^|\/)[^/]+\.model3\.json$/i.test(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  return model3Entries[0] ?? null;
}

function entryToMetadata(entry: AdmZipEntryLike): BundleArchiveEntryMetadata {
  return {
    entryPath: entry.entryName,
    uncompressedSize: entry.header?.size ?? 0,
    compressedSize: entry.header?.compressedSize,
    directory: entry.isDirectory,
  };
}

function projectNameFromBundlePath(bundlePath: string): string {
  return path.basename(bundlePath).replace(/\.zip$/i, '') || 'Live2D Puppet';
}
