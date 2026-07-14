import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ProjectFileOps } from '@neko/shared/project-file-io';
import type {
  ReadWorkspaceFileRequest,
  ReadWorkspaceFileResult,
  WriteWorkspaceFileRequest,
  WriteWorkspaceFileResult,
} from '../shared/contracts';

const DEFAULT_MAX_TEXT_FILE_BYTES = 256 * 1024;

export interface HomeProjectFileIoAdapterOptions {
  readonly workspaceRoot: string;
  readonly maxTextFileBytes?: number;
}

export interface HomeProjectFileIoAdapter {
  readonly workspaceRoot: string;
  readonly fileOps: ProjectFileOps;
  resolveWorkspacePath(filePath: string): string;
  toWorkspaceRelativePath(filePath: string): string;
  readWorkspaceTextFile(request: ReadWorkspaceFileRequest): Promise<ReadWorkspaceFileResult>;
  writeWorkspaceTextFile(request: WriteWorkspaceFileRequest): Promise<WriteWorkspaceFileResult>;
}

export function createHomeProjectFileIoAdapter(
  options: HomeProjectFileIoAdapterOptions,
): HomeProjectFileIoAdapter {
  const workspaceRoot = resolve(options.workspaceRoot);
  const maxTextFileBytes = options.maxTextFileBytes ?? DEFAULT_MAX_TEXT_FILE_BYTES;

  function resolveWorkspacePath(filePath: string): string {
    return resolveHomeWorkspacePath(workspaceRoot, filePath);
  }

  function toWorkspaceRelativePath(filePath: string): string {
    return normalizeWorkspaceRelativePath(relative(workspaceRoot, resolveWorkspacePath(filePath)));
  }

  const fileOps: ProjectFileOps = {
    readFile: async (filePath) => readFile(resolveWorkspacePath(filePath)),
    writeFile: async (filePath, content) => {
      const absolutePath = resolveWorkspacePath(filePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
    },
    deleteFile: async (filePath) => {
      await rm(resolveWorkspacePath(filePath));
    },
    renameFile: async (fromPath, toPath, renameOptions) => {
      const fromAbsolutePath = resolveWorkspacePath(fromPath);
      const toAbsolutePath = resolveWorkspacePath(toPath);
      if (!renameOptions?.overwrite) {
        await assertPathDoesNotExist(toAbsolutePath);
      }
      await mkdir(dirname(toAbsolutePath), { recursive: true });
      await rename(fromAbsolutePath, toAbsolutePath);
    },
  };

  return {
    workspaceRoot,
    fileOps,
    resolveWorkspacePath,
    toWorkspaceRelativePath,
    async readWorkspaceTextFile(request) {
      const content = await fileOps.readFile(request.relativePath);
      const truncated = content.byteLength > maxTextFileBytes;
      const selectedContent = truncated ? content.subarray(0, maxTextFileBytes) : content;
      return {
        relativePath: toWorkspaceRelativePath(request.relativePath),
        content: new TextDecoder().decode(selectedContent),
        encoding: 'utf8',
        truncated,
      };
    },
    async writeWorkspaceTextFile(request) {
      const bytes = new TextEncoder().encode(request.content);
      await fileOps.writeFile(request.relativePath, bytes);
      return {
        relativePath: toWorkspaceRelativePath(request.relativePath),
        encoding: 'utf8',
        bytesWritten: bytes.byteLength,
        written: true,
      };
    },
  };
}

export function resolveHomeWorkspacePath(workspaceRoot: string, filePath: string): string {
  if (filePath.trim().length === 0) {
    throw new Error('Workspace file path is required.');
  }

  const root = resolve(workspaceRoot);
  const candidate = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const relativeToWorkspace = relative(root, candidate);

  if (
    relativeToWorkspace.length === 0 ||
    relativeToWorkspace.startsWith('..') ||
    isAbsolute(relativeToWorkspace)
  ) {
    throw new Error(`Workspace file path is outside the workspace: ${filePath}`);
  }

  return candidate;
}

function normalizeWorkspaceRelativePath(path: string): string {
  return path.split(sep).join('/');
}

async function assertPathDoesNotExist(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.F_OK);
  } catch (error: unknown) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  throw new Error(`Workspace file already exists: ${filePath}`);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error['code'] === code;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
