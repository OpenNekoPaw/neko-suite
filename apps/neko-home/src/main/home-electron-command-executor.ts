import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  NEKO_COMMANDS,
  createNekoCommandRegistry,
  type NekoCommandExecutor,
  type NekoResourceDownloadResult,
  type NekoWorkspaceCommandMediaType,
  type NekoWorkspaceFileCandidate,
} from '@neko/host';
import { buildUserConfigTemplate, getUserConfigPath, getWorkspaceConfigPath } from '@neko/platform/config/index';
import { buildSvgDownloadPlan, createOpenFilePlan } from '@neko/platform/files';
import { detectMediaType, isDocumentFile, isMediaFile } from '@neko/shared';
import type { HomeProjectFileIoAdapter } from './home-workspace-file-io';

const MAX_SEARCH_CANDIDATES = 2000;
const DEFAULT_SEARCH_LIMIT = 30;
const WORKSPACE_CONFIG_TEMPLATE = [
  '# Neko Agent workspace config',
  '#',
  '# Keep project-scoped defaults, skill source settings, and workspace-safe',
  '# overrides here. User providers and credentials belong in ~/.neko/config.toml.',
  '',
].join('\n');

export interface ElectronShellPort {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
  startDrag?(item: { readonly file: string; readonly icon: string }): void;
}

export interface ElectronSaveDialogPort {
  showSaveDialog(options: {
    readonly defaultPath?: string;
    readonly filters?: readonly { readonly name: string; readonly extensions: readonly string[] }[];
  }): Promise<{ readonly canceled: boolean; readonly filePath?: string }>;
}

export interface ElectronHomeCommandExecutorOptions {
  readonly workspaceRoot: string;
  readonly getProjectFileIo: () => HomeProjectFileIoAdapter;
  readonly shell: ElectronShellPort;
  readonly dialog: ElectronSaveDialogPort;
  readonly homeDir?: string;
}

interface HomeProjectFileSearchPlan {
  readonly filter: string;
  readonly limit: number;
}

export function createElectronHomeCommandExecutor(
  options: ElectronHomeCommandExecutorOptions,
): NekoCommandExecutor {
  const workspaceRoot = resolve(options.workspaceRoot);
  const homeDir = options.homeDir ?? os.homedir();
  const registry = createNekoCommandRegistry();

  registry.register(NEKO_COMMANDS.workspaceSearchFiles, async (payload) => ({
    files: await searchElectronProjectFiles(workspaceRoot, {
      filter: payload.filter,
      limit: payload.limit ?? DEFAULT_SEARCH_LIMIT,
    }),
  }));
  registry.register(NEKO_COMMANDS.configOpenUser, async () => {
    const configPath = getUserConfigPath();
    await ensureTextFile(configPath, buildUserConfigTemplate());
    await openPathOrThrow(options.shell, configPath);
  });
  registry.register(NEKO_COMMANDS.configOpenWorkspace, async () => {
    const configPath = getWorkspaceConfigPath(workspaceRoot);
    await ensureTextFile(configPath, WORKSPACE_CONFIG_TEMPLATE);
    await openPathOrThrow(options.shell, configPath);
  });
  registry.register(NEKO_COMMANDS.workspaceOpenFile, async (payload) => {
    const plan = createOpenFilePlan(payload.path);
    if (!plan) return;
    const filePath = resolveOpenPath(options.getProjectFileIo(), plan.cleanPath);
    await openPathOrThrow(options.shell, filePath);
  });
  registry.register(NEKO_COMMANDS.workspaceRevealFile, async (payload) => {
    options.shell.showItemInFolder(resolveOpenPath(options.getProjectFileIo(), payload.path));
  });
  registry.register(NEKO_COMMANDS.resourceReveal, async (payload) => {
    options.shell.showItemInFolder(
      resolveOpenPath(options.getProjectFileIo(), payload.path ?? payload.resourceId),
    );
  });
  registry.register(NEKO_COMMANDS.externalOpenUrl, async (payload) => {
    assertAllowedExternalUrl(payload.url);
    await options.shell.openExternal(payload.url);
  });
  registry.register(NEKO_COMMANDS.resourceDownloadSvg, async (payload) => {
    const plan = buildSvgDownloadPlan({
      svg: payload.svg,
      filename: payload.filename,
    });
    if (!plan) {
      return { saved: false };
    }
    const result = await options.dialog.showSaveDialog({
      defaultPath: join(homeDir, 'Downloads', plan.defaultFileName),
      filters: plan.filters,
    });
    if (result.canceled || !result.filePath) {
      return { saved: false };
    }
    await mkdir(dirname(result.filePath), { recursive: true });
    await writeFile(result.filePath, plan.content, 'utf-8');
    return { saved: true, filePath: result.filePath } satisfies NekoResourceDownloadResult;
  });
  registry.register(NEKO_COMMANDS.dragStart, async (payload) => {
    if (!options.shell.startDrag) {
      throw new Error('Electron drag broker is not connected.');
    }
    const file = resolveOpenPath(options.getProjectFileIo(), payload.path);
    options.shell.startDrag({ file, icon: file });
  });

  return registry;
}

async function searchElectronProjectFiles(
  workspaceRoot: string,
  plan: HomeProjectFileSearchPlan,
): Promise<readonly NekoWorkspaceFileCandidate[]> {
  const candidates: NekoWorkspaceFileCandidate[] = [];
  await collectWorkspaceSearchCandidates(workspaceRoot, workspaceRoot, plan, candidates);
  return candidates
    .sort((left, right) => compareWorkspaceFileCandidates(left, right, plan))
    .slice(0, plan.limit);
}

async function collectWorkspaceSearchCandidates(
  workspaceRoot: string,
  directoryPath: string,
  plan: HomeProjectFileSearchPlan,
  candidates: NekoWorkspaceFileCandidate[],
): Promise<void> {
  if (candidates.length >= MAX_SEARCH_CANDIDATES) return;

  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name, entry.isDirectory())) continue;
    const absolutePath = join(directoryPath, entry.name);
    const relativePath = normalizeRelativePath(relative(workspaceRoot, absolutePath));
    if (shouldSkipWorkspaceRelativePath(relativePath, entry.isDirectory())) continue;

    if (entry.isDirectory()) {
      await collectWorkspaceSearchCandidates(workspaceRoot, absolutePath, plan, candidates);
      continue;
    }
    if (!entry.isFile() || !matchesSearchPlan(relativePath, plan)) continue;

    const mediaType = toWorkspaceCommandMediaType(
      !isWorkspaceCodeFile(relativePath) &&
        (isMediaFile(relativePath) || isDocumentFile(relativePath))
        ? detectMediaType(relativePath)
        : undefined,
    );
    candidates.push({
      path: relativePath,
      name: basename(relativePath),
      type: 'file',
      source: 'workspace',
      icon: iconForWorkspaceFile(relativePath, mediaType),
      ...(mediaType ? { mediaType } : {}),
    });
    if (candidates.length >= MAX_SEARCH_CANDIDATES) return;
  }
}

function matchesSearchPlan(relativePath: string, plan: HomeProjectFileSearchPlan): boolean {
  const filter = plan.filter.trim().toLowerCase();
  return filter.length === 0 || relativePath.toLowerCase().includes(filter);
}

function compareWorkspaceFileCandidates(
  left: NekoWorkspaceFileCandidate,
  right: NekoWorkspaceFileCandidate,
  plan: HomeProjectFileSearchPlan,
): number {
  const filter = plan.filter.trim().toLowerCase();
  const rankOrder =
    scoreWorkspaceFileCandidate(left.path, filter) -
    scoreWorkspaceFileCandidate(right.path, filter);
  if (rankOrder !== 0) return rankOrder;

  const depthOrder = getPathDepth(left.path) - getPathDepth(right.path);
  if (depthOrder !== 0) return depthOrder;

  return left.path.localeCompare(right.path, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function scoreWorkspaceFileCandidate(relativePath: string, filter: string): number {
  if (!filter) return 0;
  const path = relativePath.toLowerCase();
  const fileName = basename(path);
  if (fileName === filter) return 0;
  if (fileName.startsWith(filter)) return 1;
  if (path.includes(`/${filter}`)) return 2;
  if (fileName.includes(filter)) return 3;
  if (path.includes(filter)) return 4;
  return 5;
}

function getPathDepth(relativePath: string): number {
  return relativePath.split(/[\\/]/u).filter(Boolean).length;
}

function iconForWorkspaceFile(
  filePath: string,
  mediaType: NekoWorkspaceCommandMediaType | undefined,
): string {
  if (mediaType === 'video') return 'video';
  if (mediaType === 'audio') return 'audio';
  if (mediaType === 'image') return 'image';
  if (mediaType === 'sequence') return 'sequence';
  if (mediaType === 'document') return 'document';
  if (mediaType === 'text') return 'TXT';

  const extension = extname(filePath).replace(/^\./u, '').toLowerCase();
  if (extension === 'ts' || extension === 'tsx' || extension === 'js' || extension === 'jsx') {
    return 'TS';
  }
  if (extension === 'rs') return 'RS';
  if (extension === 'json' || extension === 'jsonc') return '{}';
  if (extension === 'md' || extension === 'mdx') return 'MD';
  if (extension === 'css' || extension === 'scss' || extension === 'less') return '#';
  return 'file';
}

function toWorkspaceCommandMediaType(
  mediaType: ReturnType<typeof detectMediaType> | undefined,
): NekoWorkspaceCommandMediaType | undefined {
  if (
    mediaType === 'video' ||
    mediaType === 'audio' ||
    mediaType === 'image' ||
    mediaType === 'sequence' ||
    mediaType === 'text' ||
    mediaType === 'document'
  ) {
    return mediaType;
  }
  return undefined;
}

function isWorkspaceCodeFile(filePath: string): boolean {
  const extension = extname(filePath).replace(/^\./u, '').toLowerCase();
  return [
    'ts',
    'tsx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'rs',
    'go',
    'py',
    'java',
    'kt',
    'swift',
    'json',
    'jsonc',
    'css',
    'scss',
    'less',
    'html',
    'xml',
  ].includes(extension);
}

async function ensureTextFile(filePath: string, template: string): Promise<void> {
  if (existsSync(filePath)) return;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, template, 'utf-8');
}

function resolveOpenPath(projectFileIo: HomeProjectFileIoAdapter, filePath: string): string {
  if (filePath.trim().length === 0) {
    throw new Error('File path is required.');
  }
  return isAbsolute(filePath) ? resolve(filePath) : projectFileIo.resolveWorkspacePath(filePath);
}

async function openPathOrThrow(shell: ElectronShellPort, filePath: string): Promise<void> {
  const message = await shell.openPath(filePath);
  if (message.trim().length > 0) {
    throw new Error(message);
  }
}

function assertAllowedExternalUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'mailto:') {
    throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`);
  }
}

function shouldSkipEntry(name: string, directory: boolean): boolean {
  if (directory) {
    return name === '.git' || name === 'node_modules';
  }
  return name === '.DS_Store';
}

function shouldSkipWorkspaceRelativePath(relativePath: string, directory: boolean): boolean {
  return directory && (relativePath === '.neko/.cache' || relativePath.startsWith('.neko/.cache/'));
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}
