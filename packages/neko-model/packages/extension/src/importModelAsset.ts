import * as path from 'path';
import { isRecord, readNonEmptyString } from '@neko/shared/vscode/extension/command-args';

export const SUPPORTED_MODEL_ASSET_EXTENSIONS = ['.glb', '.gltf', '.vrm'] as const;

export type SupportedModelAssetExtension = (typeof SUPPORTED_MODEL_ASSET_EXTENSIONS)[number];

export interface ModelImportAssetArgs {
  readonly path: string;
  readonly name?: string;
}

export interface ModelProjectImportPlanInput {
  readonly sourcePath: string;
  readonly documentPath: string;
  readonly workspaceFolderPaths?: readonly string[];
}

export interface ModelImportConflictPathInput {
  readonly targetPath: string;
  readonly nonce: string | number;
  readonly attempt?: number;
}

export type ModelProjectImportPlan =
  | {
      readonly action: 'useSource';
      readonly sourcePath: string;
      readonly importPath: string;
      readonly projectModelSrc: string;
    }
  | {
      readonly action: 'copy';
      readonly sourcePath: string;
      readonly importPath: string;
      readonly importDirectory: string;
      readonly projectModelSrc: string;
    };

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
  return {
    status: 'valid',
    payload: {
      path: assetPath,
      ...(name ? { name } : {}),
    },
  };
}

export function validateModelAssetPath(assetPath: string): ModelAssetPathValidation {
  const extension = path.extname(assetPath).toLowerCase();
  return isSupportedModelAssetExtension(extension)
    ? { supported: true, extension }
    : { supported: false, extension };
}

export function createModelProjectImportPlan(
  input: ModelProjectImportPlanInput,
): ModelProjectImportPlan {
  const sourcePath = path.resolve(input.sourcePath);
  const documentPath = path.resolve(input.documentPath);
  const documentDir = path.dirname(documentPath);
  const workspaceFolderPaths = input.workspaceFolderPaths ?? [];
  const readableRoots = [
    documentDir,
    ...workspaceFolderPaths.map((folderPath) => path.resolve(folderPath)),
  ];

  if (readableRoots.some((root) => isPathInsideOrEqual(sourcePath, root))) {
    return {
      action: 'useSource',
      sourcePath,
      importPath: sourcePath,
      projectModelSrc: formatModelProjectSrc(path.relative(documentDir, sourcePath)),
    };
  }

  const importRoot =
    findContainingWorkspaceFolder(documentPath, workspaceFolderPaths) ?? documentDir;
  const importDirectory = path.join(importRoot, '.neko', 'imports', 'models');
  const importPath = path.join(importDirectory, path.basename(sourcePath));

  return {
    action: 'copy',
    sourcePath,
    importPath,
    importDirectory,
    projectModelSrc: formatModelProjectSrc(path.relative(documentDir, importPath)),
  };
}

export function formatModelProjectSrc(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.startsWith('./') || normalized.startsWith('../')) return normalized;
  return `./${normalized}`;
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

function findContainingWorkspaceFolder(
  filePath: string,
  workspaceFolderPaths: readonly string[],
): string | undefined {
  const containingFolders = workspaceFolderPaths
    .map((folderPath) => path.resolve(folderPath))
    .filter((folderPath) => isPathInsideOrEqual(filePath, folderPath))
    .sort((left, right) => right.length - left.length);

  return containingFolders[0];
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
