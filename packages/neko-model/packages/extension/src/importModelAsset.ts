import * as path from 'path';
import type { NekoProjectAuthoringTarget } from '@neko/shared';
import { isRecord, readNonEmptyString } from '@neko/shared/vscode/extension/command-args';

export const SUPPORTED_MODEL_ASSET_EXTENSIONS = ['.glb', '.gltf', '.vrm'] as const;

export type SupportedModelAssetExtension = (typeof SUPPORTED_MODEL_ASSET_EXTENSIONS)[number];

export interface ModelImportAssetArgs {
  readonly path: string;
  readonly name?: string;
  readonly documentUri?: string;
  readonly target?: NekoProjectAuthoringTarget;
  readonly reveal?: boolean;
}

export interface ModelImportConflictPathInput {
  readonly targetPath: string;
  readonly nonce: string | number;
  readonly attempt?: number;
}

export type ModelImportAssetArgsParseResult =
  | {
      readonly status: 'missing';
    }
  | {
      readonly status: 'invalid';
      readonly reason: 'unsupportedFormat';
      readonly path: string;
      readonly extension: string;
    }
  | {
      readonly status: 'valid';
      readonly payload: ModelImportAssetArgs;
    };

export type ModelAssetPathValidation =
  | {
      readonly supported: true;
      readonly extension: SupportedModelAssetExtension;
    }
  | {
      readonly supported: false;
      readonly extension: string;
    };

export function parseModelImportAssetArgs(args: unknown): ModelImportAssetArgsParseResult {
  if (!isRecord(args)) return { status: 'missing' };

  const assetPath = readNonEmptyString(args.path);
  if (!assetPath) return { status: 'missing' };

  const validation = validateModelAssetPath(assetPath);
  if (!validation.supported) {
    return {
      status: 'invalid',
      reason: 'unsupportedFormat',
      path: assetPath,
      extension: validation.extension,
    };
  }

  const name = readNonEmptyString(args.name);
  const documentUri = readNonEmptyString(args.documentUri);
  const target = readModelImportTarget(args.target);
  const reveal = typeof args.reveal === 'boolean' ? args.reveal : undefined;
  return {
    status: 'valid',
    payload: {
      path: assetPath,
      ...(name ? { name } : {}),
      ...(documentUri ? { documentUri } : {}),
      ...(target ? { target } : {}),
      ...(reveal !== undefined ? { reveal } : {}),
    },
  };
}

export function validateModelAssetPath(assetPath: string): ModelAssetPathValidation {
  const extension = path.extname(assetPath).toLowerCase();
  return isSupportedModelAssetExtension(extension)
    ? { supported: true, extension }
    : { supported: false, extension };
}

export function createModelImportConflictPath(input: ModelImportConflictPathInput): string {
  const parsed = path.parse(input.targetPath);
  const attemptSuffix = input.attempt === undefined ? '' : `-${input.attempt}`;
  return path.join(
    parsed.dir,
    `${parsed.name}-${String(input.nonce)}${attemptSuffix}${parsed.ext}`,
  );
}

export function getSupportedModelAssetFileExtensions(): readonly string[] {
  return SUPPORTED_MODEL_ASSET_EXTENSIONS.map((extension) => extension.slice(1));
}

export function formatSupportedModelAssetExtensions(): string {
  return SUPPORTED_MODEL_ASSET_EXTENSIONS.join(', ');
}

function isSupportedModelAssetExtension(value: string): value is SupportedModelAssetExtension {
  return SUPPORTED_MODEL_ASSET_EXTENSIONS.includes(value as SupportedModelAssetExtension);
}

function readModelImportTarget(value: unknown): NekoProjectAuthoringTarget | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  const documentUri = readNonEmptyString(value.documentUri);
  const title = readNonEmptyString(value.title);
  const reveal = typeof value.reveal === 'boolean' ? value.reveal : undefined;
  if (kind !== undefined && kind !== 'active' && kind !== 'file' && kind !== 'new') {
    return undefined;
  }
  if (!kind && !documentUri && !title && reveal === undefined) return undefined;
  return {
    ...(kind ? { kind } : {}),
    ...(documentUri ? { documentUri } : {}),
    ...(title ? { title } : {}),
    ...(reveal !== undefined ? { reveal } : {}),
  };
}
