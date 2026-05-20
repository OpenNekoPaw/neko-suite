import * as path from 'node:path';
import type {
  AssetManifest,
  CharacterAssetExportResult,
  CharacterAssetMediaKind,
  CharacterSingleAssetExportRequest,
  NkpProjectData,
} from '@neko/shared';

interface ZipEntryLike {
  readonly entryName: string;
  readonly isDirectory: boolean;
}

interface ZipLike {
  getEntries(): ZipEntryLike[];
  getEntry(entryName: string): ZipEntryLike | null;
  readFile(entry: string | ZipEntryLike): Buffer | null;
  addFile(entryName: string, data: Buffer): void;
  toBuffer(): Buffer;
}

type ZipConstructor = new (data?: Buffer) => ZipLike;

export interface PuppetAssetExportFileSystem {
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  readonly createDirectory: (dirPath: string) => Promise<void>;
}

export interface PuppetAssetExportServiceOptions {
  readonly fs: PuppetAssetExportFileSystem;
  readonly zipConstructor?: ZipConstructor;
  readonly now?: () => Date;
}

type PuppetExportKind = 'model' | 'motions' | 'config';
type PuppetAssetExportMediaKind = Extract<
  CharacterAssetMediaKind,
  'puppet-model' | 'puppet-motion' | 'puppet-config'
>;

interface PuppetExportSpec {
  readonly kind: PuppetExportKind;
  readonly mediaKind: PuppetAssetExportMediaKind;
  readonly defaultSuffix: string;
  readonly archivePrefix: string;
}

const PUPPET_EXPORT_SPECS: Record<PuppetExportKind, PuppetExportSpec> = {
  model: {
    kind: 'model',
    mediaKind: 'puppet-model',
    defaultSuffix: '-model.zip',
    archivePrefix: 'model',
  },
  motions: {
    kind: 'motions',
    mediaKind: 'puppet-motion',
    defaultSuffix: '-motions.zip',
    archivePrefix: 'motions',
  },
  config: {
    kind: 'config',
    mediaKind: 'puppet-config',
    defaultSuffix: '-config.zip',
    archivePrefix: 'config',
  },
};

export class PuppetAssetExportService {
  private readonly fs: PuppetAssetExportFileSystem;
  private readonly zipConstructor: ZipConstructor;
  private readonly now: () => Date;

  constructor(options: PuppetAssetExportServiceOptions) {
    this.fs = options.fs;
    this.zipConstructor = options.zipConstructor ?? loadAdmZipConstructor();
    this.now = options.now ?? (() => new Date());
  }

  async exportModel(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    return this.exportPackage(PUPPET_EXPORT_SPECS.model, request);
  }

  async exportMotions(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    return this.exportPackage(PUPPET_EXPORT_SPECS.motions, request);
  }

  async exportConfig(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    return this.exportPackage(PUPPET_EXPORT_SPECS.config, request);
  }

  defaultOutputPath(sourcePath: string, kind: PuppetExportKind): string {
    const spec = PUPPET_EXPORT_SPECS[kind];
    const parsed = path.parse(sourcePath);
    const stem = parsed.name.replace(/\.nkp\.puppet$/i, '');
    return path.join(parsed.dir, `${stem}${spec.defaultSuffix}`);
  }

  private async exportPackage(
    spec: PuppetExportSpec,
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    const sourcePath = path.resolve(request.sourcePath);
    const outputPath = path.resolve(request.outputPath);
    const sourceProject = await this.readProject(sourcePath);
    const name =
      request.name ?? sourceProject.name ?? path.basename(sourcePath, path.extname(sourcePath));
    const exportedAt = this.now().toISOString();
    const zip = new this.zipConstructor();
    const diagnostics: string[] = [];
    const exportedFiles: Array<{ path: string; size: number }> = [];

    if (sourceProject.puppet.bundle) {
      await this.addBundleBackedEntries(
        zip,
        sourceProject,
        sourcePath,
        spec,
        exportedFiles,
        diagnostics,
      );
    } else if (sourceProject.puppet.src) {
      await this.addDiskBackedEntries(
        zip,
        sourceProject,
        sourcePath,
        spec,
        exportedFiles,
        diagnostics,
      );
    } else {
      diagnostics.push(
        'No puppet source was available; exported manifest references project metadata only.',
      );
    }

    const manifest = this.createManifest({
      name,
      outputPath,
      sourcePath,
      mediaKind: spec.mediaKind,
      exportedAt,
      fileSize: exportedFiles.reduce((total, file) => total + file.size, 0),
    });
    const packageInfo = {
      format: 'neko-puppet-asset-package',
      version: 1,
      kind: spec.kind,
      source: {
        projectPath: sourcePath,
        bundlePath: sourceProject.puppet.bundle?.path,
        storageMode: sourceProject.puppet.bundle ? 'bundle-memory' : 'disk',
      },
      files: exportedFiles.map((file) => file.path),
      generatedAt: exportedAt,
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
    zip.addFile('package.json', Buffer.from(JSON.stringify(packageInfo, null, 2), 'utf-8'));
    await this.fs.createDirectory(path.dirname(outputPath));
    await this.fs.writeFile(outputPath, zip.toBuffer());

    return {
      format: 'asset-package',
      outputPath,
      manifest,
      files: [
        {
          path: 'manifest.json',
          role: 'manifest',
          mediaKind: spec.mediaKind,
          dimension:
            spec.kind === 'model' ? 'model' : spec.kind === 'motions' ? 'motion' : 'config',
        },
        ...exportedFiles.map((file) => ({
          path: file.path,
          role:
            spec.kind === 'model'
              ? ('model' as const)
              : spec.kind === 'motions'
                ? ('motion' as const)
                : ('config' as const),
          mediaKind: spec.mediaKind,
          dimension:
            spec.kind === 'model'
              ? ('model' as const)
              : spec.kind === 'motions'
                ? ('motion' as const)
                : ('config' as const),
        })),
      ],
      ...(diagnostics.length > 0 ? { diagnostics } : {}),
    };
  }

  private async addBundleBackedEntries(
    zip: ZipLike,
    project: NkpProjectData,
    projectPath: string,
    spec: PuppetExportSpec,
    exportedFiles: Array<{ path: string; size: number }>,
    diagnostics: string[],
  ): Promise<void> {
    const bundle = project.puppet.bundle;
    if (!bundle) return;
    const bundlePath = resolveProjectRelativePath(projectPath, bundle.path);
    const sourceZip = new this.zipConstructor(Buffer.from(await this.fs.readFile(bundlePath)));
    const entries = selectBundleEntries(project, spec.kind);

    for (const entryPath of entries) {
      const entry = sourceZip.getEntry(entryPath);
      if (!entry || entry.isDirectory) {
        diagnostics.push(`Skipped missing bundle entry: ${entryPath}`);
        continue;
      }

      const bytes = sourceZip.readFile(entry);
      if (!bytes) {
        diagnostics.push(`Skipped unreadable bundle entry: ${entryPath}`);
        continue;
      }

      const targetPath = `${spec.archivePrefix}/${entryPath}`;
      zip.addFile(targetPath, bytes);
      exportedFiles.push({ path: targetPath, size: bytes.byteLength });
    }
  }

  private async addDiskBackedEntries(
    zip: ZipLike,
    project: NkpProjectData,
    projectPath: string,
    spec: PuppetExportSpec,
    exportedFiles: Array<{ path: string; size: number }>,
    diagnostics: string[],
  ): Promise<void> {
    if (spec.kind !== 'model') {
      diagnostics.push(
        'No independent motion/config files were recorded for this disk-backed puppet.',
      );
      return;
    }

    const src = project.puppet.src;
    if (!src) return;
    const modelPath = resolveProjectRelativePath(projectPath, src);
    const bytes = await this.fs.readFile(modelPath);
    const targetPath = `model/${path.basename(modelPath)}`;
    const buffer = Buffer.from(bytes);
    zip.addFile(targetPath, buffer);
    exportedFiles.push({ path: targetPath, size: buffer.byteLength });
  }

  private async readProject(sourcePath: string): Promise<NkpProjectData> {
    if (path.extname(sourcePath).toLowerCase() === '.moc3') {
      return {
        version: '1.0',
        name: path.basename(sourcePath, path.extname(sourcePath)),
        puppet: { src: sourcePath, format: 'moc3' },
        parameters: {},
        viewport: { zoom: 1 },
      };
    }

    const raw = await this.fs.readFile(sourcePath);
    return JSON.parse(Buffer.from(raw).toString('utf-8')) as NkpProjectData;
  }

  private createManifest(input: {
    readonly name: string;
    readonly outputPath: string;
    readonly sourcePath: string;
    readonly mediaKind: PuppetAssetExportMediaKind;
    readonly exportedAt: string;
    readonly fileSize: number;
  }): AssetManifest {
    return {
      id: `local/${slugify(input.name)}-${input.mediaKind}`,
      name: input.name,
      version: '1.0.0',
      type: 'media',
      source: {
        kind: 'local',
        path: input.outputPath,
      },
      distributionKind: 'archive',
      typeMetadata: {
        type: 'media',
        data: {
          mediaKind: input.mediaKind,
          fileSize: input.fileSize,
        },
      },
      distribution: {
        license: 'UNSPECIFIED',
        author: 'local',
        tags: ['puppet', input.mediaKind],
        checksum: 'local-export',
      },
      intent: {
        useCases: ['character-asset-export'],
        description: `Exported from ${input.sourcePath}`,
      },
      createdAt: Date.parse(input.exportedAt),
      updatedAt: Date.parse(input.exportedAt),
    };
  }
}

function selectBundleEntries(project: NkpProjectData, kind: PuppetExportKind): readonly string[] {
  const bundleIndex = project.bundleIndex;
  if (!bundleIndex) {
    return [];
  }

  switch (kind) {
    case 'model':
      return unique([
        bundleIndex.moc.entryPath,
        ...bundleIndex.textures.map((texture) => texture.locator.entryPath),
      ]);
    case 'motions':
      return unique(bundleIndex.motions.map((motion) => motion.locator.entryPath));
    case 'config':
      return unique([
        ...bundleIndex.expressions.map((expression) => expression.locator.entryPath),
        ...(bundleIndex.physics ? [bundleIndex.physics.entryPath] : []),
      ]);
  }
}

function resolveProjectRelativePath(projectPath: string, ref: string): string {
  if (path.isAbsolute(ref)) return ref;
  return path.resolve(path.dirname(projectPath), ref);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'puppet-asset'
  );
}

function loadAdmZipConstructor(): ZipConstructor {
  const loaded = require('adm-zip') as unknown;
  if (typeof loaded !== 'function') {
    throw new Error('adm-zip module did not provide a constructor.');
  }
  return loaded as ZipConstructor;
}
