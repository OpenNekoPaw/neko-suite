import * as path from 'node:path';
import type {
  AssetManifest,
  CharacterAssetExportResult,
  CharacterAssetMediaKind,
  CharacterSingleAssetExportRequest,
  EasingType,
  NkmProjectData,
} from '@neko/shared';

export interface ModelAssetExportFileSystem {
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly writeFile: (filePath: string, data: Uint8Array) => Promise<void>;
  readonly createDirectory: (dirPath: string) => Promise<void>;
}

export interface ModelAssetExportServiceOptions {
  readonly fs: ModelAssetExportFileSystem;
  readonly now?: () => Date;
}

type ModelExportKind = 'motions' | 'config';
type ModelAssetExportMediaKind = Extract<CharacterAssetMediaKind, 'model-motion' | 'model-config'>;

interface ModelExportSpec {
  readonly kind: ModelExportKind;
  readonly mediaKind: ModelAssetExportMediaKind;
  readonly defaultSuffix: string;
  readonly extension: string;
}

const MODEL_EXPORT_SPECS: Record<ModelExportKind, ModelExportSpec> = {
  motions: {
    kind: 'motions',
    mediaKind: 'model-motion',
    defaultSuffix: '-motions.nkma',
    extension: '.nkma',
  },
  config: {
    kind: 'config',
    mediaKind: 'model-config',
    defaultSuffix: '-config.nkmc',
    extension: '.nkmc',
  },
};

export class ModelAssetExportService {
  private readonly fs: ModelAssetExportFileSystem;
  private readonly now: () => Date;

  constructor(options: ModelAssetExportServiceOptions) {
    this.fs = options.fs;
    this.now = options.now ?? (() => new Date());
  }

  async exportMotions(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    const project = await this.readProject(request.sourcePath);
    const exportedAt = this.now().toISOString();
    const artifact = {
      format: 'nkma',
      version: 1,
      name: request.name ?? `${project.name} Motions`,
      source: {
        projectPath: path.resolve(request.sourcePath),
        modelSrc: project.model.src,
      },
      clips: project.customClips ?? [],
      generatedAt: exportedAt,
    };
    return this.writeArtifact({
      request,
      spec: MODEL_EXPORT_SPECS.motions,
      project,
      artifact,
      fileSize: Buffer.byteLength(JSON.stringify(artifact), 'utf-8'),
      exportedAt,
    });
  }

  async exportConfig(
    request: CharacterSingleAssetExportRequest,
  ): Promise<CharacterAssetExportResult> {
    const project = await this.readProject(request.sourcePath);
    const exportedAt = this.now().toISOString();
    const artifact = {
      format: 'nkmc',
      version: 1,
      name: request.name ?? `${project.name} Config`,
      source: {
        projectPath: path.resolve(request.sourcePath),
        modelSrc: project.model.src,
      },
      faceParams: project.faceParams ?? {},
      camera: project.camera ?? null,
      viewport: project.viewport ?? { zoom: 1 },
      editorState: project.editorState ?? {},
      generatedAt: exportedAt,
    };
    return this.writeArtifact({
      request,
      spec: MODEL_EXPORT_SPECS.config,
      project,
      artifact,
      fileSize: Buffer.byteLength(JSON.stringify(artifact), 'utf-8'),
      exportedAt,
    });
  }

  defaultOutputPath(sourcePath: string, kind: ModelExportKind): string {
    const spec = MODEL_EXPORT_SPECS[kind];
    const parsed = path.parse(sourcePath);
    return path.join(parsed.dir, `${parsed.name}${spec.defaultSuffix}`);
  }

  private async writeArtifact(input: {
    readonly request: CharacterSingleAssetExportRequest;
    readonly spec: ModelExportSpec;
    readonly project: NkmProjectData;
    readonly artifact: Record<string, unknown>;
    readonly fileSize: number;
    readonly exportedAt: string;
  }): Promise<CharacterAssetExportResult> {
    const outputPath = path.resolve(input.request.outputPath);
    await this.fs.createDirectory(path.dirname(outputPath));
    const artifactBytes = Buffer.from(`${JSON.stringify(input.artifact, null, 2)}\n`, 'utf-8');
    await this.fs.writeFile(outputPath, artifactBytes);

    const manifest = this.createManifest({
      name: input.request.name ?? input.project.name,
      outputPath,
      sourcePath: path.resolve(input.request.sourcePath),
      mediaKind: input.spec.mediaKind,
      fileSize: input.fileSize,
      exportedAt: input.exportedAt,
    });
    const manifestPath = `${outputPath}.manifest.json`;
    await this.fs.writeFile(
      manifestPath,
      Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8'),
    );

    return {
      format: input.spec.kind === 'motions' ? 'model-motion' : 'model-config',
      outputPath,
      manifest,
      files: [
        {
          path: outputPath,
          role: input.spec.kind === 'motions' ? 'motion' : 'config',
          mediaKind: input.spec.mediaKind,
          dimension: input.spec.kind === 'motions' ? 'motion' : 'config',
        },
        {
          path: manifestPath,
          role: 'manifest',
          mediaKind: input.spec.mediaKind,
          dimension: input.spec.kind === 'motions' ? 'motion' : 'config',
        },
      ],
    };
  }

  private async readProject(sourcePath: string): Promise<NkmProjectData> {
    const raw = await this.fs.readFile(path.resolve(sourcePath));
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(raw).toString('utf-8'));
    } catch (error) {
      throw new Error(`Invalid .nkm project JSON: ${formatError(error)}`);
    }
    return parseNkmProjectData(parsed);
  }

  private createManifest(input: {
    readonly name: string;
    readonly outputPath: string;
    readonly sourcePath: string;
    readonly mediaKind: ModelAssetExportMediaKind;
    readonly fileSize: number;
    readonly exportedAt: string;
  }): AssetManifest {
    return {
      id: `local/${slugify(input.name)}-${input.mediaKind}`,
      name: input.name,
      version: '1.0.0',
      type: 'media',
      source: { kind: 'local', path: input.outputPath },
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
        tags: ['model', input.mediaKind],
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

function parseNkmProjectData(value: unknown): NkmProjectData {
  if (!isRecord(value)) {
    throw new Error('Invalid .nkm project: root must be an object.');
  }

  return {
    version: parseVersion(value.version),
    name: parseNonEmptyString(value.name, 'name'),
    profile: parseNkmProfile(value.profile, 'profile'),
    model: parseModelRef(value.model),
    scene2d: parseOptionalRecord(value.scene2d, 'scene2d'),
    live: parseOptionalRecord(value.live, 'live'),
    faceParams: parseFaceParams(value.faceParams, 'faceParams'),
    customClips: parseCustomClips(value.customClips, 'customClips'),
    camera: parseCamera(value.camera, 'camera'),
    viewport: parseViewport(value.viewport, 'viewport'),
    editorState: parseEditorState(value.editorState, 'editorState'),
  };
}

function parseNkmProfile(value: unknown, field: string): NkmProjectData['profile'] {
  if (value === undefined) return undefined;
  if (value === '2d' || value === '3d' || value === 'live') return value;
  throw new Error(`Invalid .nkm project: ${field} must be 2d, 3d, or live.`);
}

function parseVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('Invalid .nkm project: version must be a positive integer.');
  }
  return value;
}

function parseModelRef(value: unknown): NkmProjectData['model'] {
  if (!isRecord(value)) {
    throw new Error('Invalid .nkm project: model must be an object.');
  }
  if (typeof value.src === 'string' || value.src === null) {
    return { src: value.src };
  }
  throw new Error('Invalid .nkm project: model.src must be a string or null.');
}

function parseOptionalRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  return value;
}

function parseFaceParams(value: unknown, field: string): Record<string, number> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  const params: Record<string, number> = {};
  for (const [key, param] of Object.entries(value)) {
    if (typeof param !== 'number' || !Number.isFinite(param)) {
      throw new Error(`Invalid .nkm project: ${field}.${key} must be a finite number.`);
    }
    params[key] = param;
  }
  return params;
}

function parseCustomClips(value: unknown, field: string): NkmProjectData['customClips'] {
  if (value === undefined) return [];
  if (!isUnknownArray(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an array.`);
  }
  return value.map((clip, index) => parseCustomClip(clip, `${field}[${index}]`));
}

function parseCustomClip(value: unknown, field: string): NkmProjectData['customClips'][number] {
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  return {
    name: parseNonEmptyString(value.name, `${field}.name`),
    duration: parseFiniteNumber(value.duration, `${field}.duration`),
    channels: parseAnimationChannels(value.channels, `${field}.channels`),
  };
}

function parseAnimationChannels(
  value: unknown,
  field: string,
): NkmProjectData['customClips'][number]['channels'] {
  if (!isUnknownArray(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an array.`);
  }
  return value.map((channel, index) => parseAnimationChannel(channel, `${field}[${index}]`));
}

function parseAnimationChannel(
  value: unknown,
  field: string,
): NkmProjectData['customClips'][number]['channels'][number] {
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  return {
    targetNode: parseNonEmptyString(value.targetNode, `${field}.targetNode`),
    property: parseAnimationProperty(value.property, `${field}.property`),
    keyframes: parseKeyframes(value.keyframes, `${field}.keyframes`),
  };
}

function parseAnimationProperty(
  value: unknown,
  field: string,
): NkmProjectData['customClips'][number]['channels'][number]['property'] {
  switch (value) {
    case 'translation':
    case 'rotation':
    case 'scale':
    case 'morph_weights':
      return value;
    default:
      throw new Error(
        `Invalid .nkm project: ${field} must be translation, rotation, scale, or morph_weights.`,
      );
  }
}

function parseKeyframes(
  value: unknown,
  field: string,
): NkmProjectData['customClips'][number]['channels'][number]['keyframes'] {
  if (!isUnknownArray(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an array.`);
  }
  return value.map((keyframe, index) => parseKeyframe(keyframe, `${field}[${index}]`));
}

function parseKeyframe(
  value: unknown,
  field: string,
): NkmProjectData['customClips'][number]['channels'][number]['keyframes'][number] {
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  return {
    id: parseNonEmptyString(value.id, `${field}.id`),
    timestamp: parseFiniteNumber(value.timestamp, `${field}.timestamp`),
    values: parseFiniteNumberArray(value.values, `${field}.values`),
    easing: parseEasing(value.easing, `${field}.easing`),
  };
}

function parseEasing(value: unknown, field: string): EasingType {
  switch (value) {
    case 'linear':
    case 'ease-in-quad':
    case 'ease-out-quad':
    case 'ease-in-out-quad':
    case 'ease-in-cubic':
    case 'ease-out-cubic':
    case 'ease-in-out-cubic':
    case 'ease-in-quart':
    case 'ease-out-quart':
    case 'ease-in-out-quart':
    case 'ease-in-quint':
    case 'ease-out-quint':
    case 'ease-in-out-quint':
    case 'ease-in-sine':
    case 'ease-out-sine':
    case 'ease-in-out-sine':
    case 'ease-in-expo':
    case 'ease-out-expo':
    case 'ease-in-out-expo':
    case 'ease-in-circ':
    case 'ease-out-circ':
    case 'ease-in-out-circ':
    case 'ease-in-back':
    case 'ease-out-back':
    case 'ease-in-out-back':
    case 'ease-in-elastic':
    case 'ease-out-elastic':
    case 'ease-in-out-elastic':
    case 'ease-in-bounce':
    case 'ease-out-bounce':
    case 'ease-in-out-bounce':
    case 'bezier':
    case 'ease-in':
    case 'ease-out':
    case 'ease-in-out':
      return value;
    default:
      throw new Error(`Invalid .nkm project: ${field} must be a supported easing value.`);
  }
}

function parseCamera(value: unknown, field: string): NkmProjectData['camera'] {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object or null.`);
  }
  return {
    position: parseVec3Tuple(value.position, `${field}.position`),
    target: parseVec3Tuple(value.target, `${field}.target`),
    up: parseVec3Tuple(value.up, `${field}.up`),
    fov: parseFiniteNumber(value.fov, `${field}.fov`),
  };
}

function parseViewport(value: unknown, field: string): NkmProjectData['viewport'] {
  if (value === undefined) return { zoom: 1 };
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  return {
    zoom: parseFiniteNumber(value.zoom, `${field}.zoom`),
  };
}

function parseEditorState(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an object.`);
  }
  return value;
}

function parseVec3Tuple(value: unknown, field: string): [number, number, number] {
  if (!isUnknownArray(value) || value.length !== 3) {
    throw new Error(`Invalid .nkm project: ${field} must contain 3 numbers.`);
  }
  return [
    parseFiniteNumber(value[0], `${field}[0]`),
    parseFiniteNumber(value[1], `${field}[1]`),
    parseFiniteNumber(value[2], `${field}[2]`),
  ];
}

function parseFiniteNumberArray(value: unknown, field: string): number[] {
  if (!isUnknownArray(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be an array.`);
  }
  return value.map((item, index) => parseFiniteNumber(item, `${field}[${index}]`));
}

function parseFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid .nkm project: ${field} must be a finite number.`);
  }
  return value;
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid .nkm project: ${field} must be a non-empty string.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'model-asset'
  );
}
