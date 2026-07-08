import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  classifyWorkspaceResourceName,
  isWorkbenchWorkspaceMediaFileKind,
  readWorkspaceResourceThumbnailLabel,
} from '@neko/workbench-core';
import type {
  DesktopEditorAdapterDescriptor,
  WorkspaceFileScmStatus,
  WorkspaceFileKind,
  WorkspaceFileNode,
  WorkspaceFileThumbnailDescriptor,
  WorkspaceFileTreeSnapshot,
} from '../shared/contracts';
import { createDesktopFeatureEditorAdapterDescriptorForFileName } from '../shared/feature-webview-adapters';

export const NEKO_RESOURCE_SCHEME = 'neko-resource';

const MAX_WORKSPACE_TREE_NODES = 5000;
const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', 'node_modules']);
const EXCLUDED_FILE_NAMES = new Set(['.DS_Store']);

export interface WorkspaceTreeScanOptions {
  readonly maxNodes?: number;
  readonly scmStatusByPath?: ReadonlyMap<string, WorkspaceFileScmStatus>;
}

interface WorkspaceTreeScanState {
  readonly root: string;
  readonly maxNodes: number;
  readonly scmStatusByPath: ReadonlyMap<string, WorkspaceFileScmStatus>;
  totalFileCount: number;
  directoryCount: number;
  mediaFileCount: number;
  scannedNodeCount: number;
  truncated: boolean;
  selectedFileId?: string;
}

const execFileAsync = promisify(execFile);

export async function createWorkspaceFileTreeSnapshot(
  workspaceRoot: string,
  options: WorkspaceTreeScanOptions = {},
): Promise<WorkspaceFileTreeSnapshot> {
  const root = resolve(workspaceRoot);
  const scmStatusByPath = options.scmStatusByPath ?? (await readGitScmStatusByPath(root));
  const state: WorkspaceTreeScanState = {
    root,
    maxNodes: options.maxNodes ?? MAX_WORKSPACE_TREE_NODES,
    scmStatusByPath,
    totalFileCount: 0,
    directoryCount: 0,
    mediaFileCount: 0,
    scannedNodeCount: 0,
    truncated: false,
  };
  const nodes = await readDirectoryNodes(root, state);

  return {
    rootName: basename(root) || root,
    rootRef: { kind: 'file', id: '.', source: 'workspace-files' },
    nodes,
    ...(state.selectedFileId ? { selectedFileId: state.selectedFileId } : {}),
    totalFileCount: state.totalFileCount,
    directoryCount: state.directoryCount,
    mediaFileCount: state.mediaFileCount,
    truncated: state.truncated,
  };
}

export function createWorkspaceResourceUrl(relativePath: string): string {
  return `${NEKO_RESOURCE_SCHEME}://workspace/${encodeURIComponent(normalizeRelativePath(relativePath))}`;
}

export function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}

async function readDirectoryNodes(
  directoryPath: string,
  state: WorkspaceTreeScanState,
): Promise<readonly WorkspaceFileNode[]> {
  if (state.scannedNodeCount >= state.maxNodes) {
    state.truncated = true;
    return [];
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sortedEntries = entries
    .filter((entry) => !shouldSkipEntryName(entry.name, entry.isDirectory()))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  const nodes: WorkspaceFileNode[] = [];

  for (const entry of sortedEntries) {
    if (state.scannedNodeCount >= state.maxNodes) {
      state.truncated = true;
      break;
    }

    const absolutePath = join(directoryPath, entry.name);
    const relativePath = normalizeRelativePath(relative(state.root, absolutePath));
    if (shouldSkipWorkspaceRelativePath(relativePath, entry.isDirectory())) {
      continue;
    }
    if (entry.isDirectory()) {
      const directoryStat = await stat(absolutePath);
      state.scannedNodeCount += 1;
      state.directoryCount += 1;
      const children = await readDirectoryNodes(absolutePath, state);
      nodes.push({
        id: toWorkspaceNodeId(relativePath),
        name: entry.name,
        relativePath,
        kind: 'directory',
        modifiedAt: directoryStat.mtime.toISOString(),
        childCount: children.length,
        children,
      });
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const fileStat = await stat(absolutePath);
    const kind = classifyWorkspaceFile(entry.name);
    const editor = createEditorAdapterDescriptor(entry.name, kind);
    const thumbnail = createThumbnailDescriptor(kind, relativePath);
    const scmStatus = state.scmStatusByPath.get(relativePath);
    const node: WorkspaceFileNode = {
      id: toWorkspaceNodeId(relativePath),
      name: entry.name,
      relativePath,
      kind,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      ...(scmStatus ? { scmStatus } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      ...(editor ? { editor } : {}),
    };

    state.scannedNodeCount += 1;
    state.totalFileCount += 1;
    if (isMediaFileKind(kind)) {
      state.mediaFileCount += 1;
    }
    if (!state.selectedFileId && editor) {
      state.selectedFileId = node.id;
    }
    nodes.push(node);
  }

  return nodes;
}

async function readGitScmStatusByPath(
  workspaceRoot: string,
): Promise<ReadonlyMap<string, WorkspaceFileScmStatus>> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', workspaceRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
      },
    );
    return parseGitPorcelainStatus(stdout);
  } catch (_error: unknown) {
    return new Map();
  }
}

function parseGitPorcelainStatus(output: string): ReadonlyMap<string, WorkspaceFileScmStatus> {
  const statusByPath = new Map<string, WorkspaceFileScmStatus>();
  const entries = output.split('\0').filter((entry) => entry.length > 0);

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) {
      continue;
    }

    const code = entry.slice(0, 2);
    const path = normalizeRelativePath(entry.slice(3));
    const status = readGitStatusCode(code);
    if (status) {
      statusByPath.set(path, status);
    }

    if (code.includes('R') || code.includes('C')) {
      index += 1;
    }
  }

  return statusByPath;
}

function readGitStatusCode(code: string): WorkspaceFileScmStatus | undefined {
  if (code === '??') return 'untracked';
  if (code === '!!') return 'ignored';
  if (code.includes('U')) return 'conflicted';
  if (code.includes('A')) return 'added';
  if (code.includes('M')) return 'modified';
  if (code.includes('D')) return 'deleted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('C')) return 'copied';
  return undefined;
}

function shouldSkipEntryName(name: string, directory: boolean): boolean {
  if (directory) {
    return EXCLUDED_DIRECTORY_NAMES.has(name);
  }
  return EXCLUDED_FILE_NAMES.has(name);
}

function shouldSkipWorkspaceRelativePath(relativePath: string, directory: boolean): boolean {
  if (!directory) {
    return false;
  }
  return relativePath === '.neko/.cache' || relativePath.startsWith('.neko/.cache/');
}

function toWorkspaceNodeId(relativePath: string): string {
  return `workspace:${relativePath}`;
}

function classifyWorkspaceFile(name: string): WorkspaceFileKind {
  return classifyWorkspaceResourceName(name);
}

function createThumbnailDescriptor(
  kind: WorkspaceFileKind,
  relativePath: string,
): WorkspaceFileThumbnailDescriptor | undefined {
  if (kind === 'image') {
    return { kind: 'image', label: 'IMG', url: createWorkspaceResourceUrl(relativePath) };
  }
  if (kind === 'video') {
    return { kind: 'video', label: 'VID', url: createWorkspaceResourceUrl(relativePath) };
  }
  if (kind === 'audio') {
    return { kind: 'audio', label: 'AUD' };
  }
  if (kind === 'model') {
    return { kind: 'model', label: '3D' };
  }
  return { kind: 'icon', label: readThumbnailLabel(kind) };
}

function readThumbnailLabel(kind: WorkspaceFileKind): string {
  return readWorkspaceResourceThumbnailLabel(kind);
}

function createEditorAdapterDescriptor(
  name: string,
  kind: WorkspaceFileKind,
): DesktopEditorAdapterDescriptor | undefined {
  const featureAdapter = createDesktopFeatureEditorAdapterDescriptorForFileName(name);
  if (featureAdapter) {
    return featureAdapter;
  }
  switch (kind) {
    case 'story':
    case 'document':
    case 'config':
      return createDesktopNativeCodeEditorDescriptor();
    case 'canvas':
    case 'timeline':
    case 'audio-project':
    case 'sketch':
    case 'model':
    case 'puppet':
    case 'image':
    case 'video':
    case 'audio':
    case 'archive':
    case 'directory':
    case 'unknown':
      return undefined;
  }
}

function createDesktopNativeCodeEditorDescriptor(): DesktopEditorAdapterDescriptor {
  return {
    kind: 'code',
    panelKind: 'code-editor',
    label: 'Text',
    packageName: 'neko-desktop',
    implementedInVsCodeWebview: false,
    desktopRuntime: 'desktop-native',
  };
}

function isMediaFileKind(kind: WorkspaceFileKind): boolean {
  return isWorkbenchWorkspaceMediaFileKind(kind);
}
