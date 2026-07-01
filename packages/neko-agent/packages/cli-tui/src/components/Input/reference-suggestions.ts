import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Dirent } from 'node:fs';
import { isMentionExcludedPath } from '@neko/agent';
import type { AgentReferenceCandidate, AgentReferenceContributor } from '@neko/shared';
import type { InputSuggestionOption } from './input-suggestions';

export interface TuiReferenceSuggestionOptions {
  readonly workspaceRoot: string;
  readonly limit?: number;
  readonly maxDepth?: number;
  readonly excludedDirectories?: readonly string[];
  readonly extraReferences?: readonly TuiMentionReferenceCandidate[];
  readonly referenceContributors?: readonly AgentReferenceContributor[];
}

export type TuiMentionReferenceKind =
  'file' | 'asset' | 'media' | 'entity' | 'canvas-node' | 'character' | 'scene';

export type TuiMentionReferenceSource =
  'workspace' | 'asset-library' | 'media-library' | 'entity-graph' | 'story' | 'canvas';

export type TuiMentionMediaType = 'video' | 'audio' | 'image' | 'sequence' | 'text' | 'document';

export interface TuiMentionReferenceCandidate {
  readonly kind: TuiMentionReferenceKind;
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly filePath?: string;
  readonly source?: TuiMentionReferenceSource;
  readonly mediaType?: TuiMentionMediaType;
  readonly entityType?: string;
  readonly searchText?: string;
  readonly insertText?: string;
}

interface WorkspaceFileCandidate {
  readonly relativePath: string;
  readonly size: number;
}

interface LocalLibraryReferenceCandidate extends WorkspaceFileCandidate {
  readonly kind: 'asset' | 'media';
  readonly source: 'asset-library' | 'media-library';
  readonly mediaType: TuiMentionMediaType;
  readonly libraryLabel: string;
}

interface LocalLibraryRoot {
  readonly relativeDir: string;
  readonly kind: 'asset' | 'media';
  readonly source: 'asset-library' | 'media-library';
  readonly label: string;
}

const DEFAULT_REFERENCE_LIMIT = 80;
const DEFAULT_REFERENCE_MAX_DEPTH = 4;
const LOCAL_LIBRARY_MAX_DEPTH = 5;
const DEFAULT_LOCAL_LIBRARY_ROOTS: readonly LocalLibraryRoot[] = [
  { relativeDir: 'assets', kind: 'asset', source: 'asset-library', label: 'asset-library' },
  { relativeDir: 'neko/assets', kind: 'asset', source: 'asset-library', label: 'asset-library' },
  { relativeDir: '.neko/assets', kind: 'asset', source: 'asset-library', label: 'asset-library' },
  { relativeDir: 'generated', kind: 'asset', source: 'asset-library', label: 'generated-assets' },
  {
    relativeDir: 'neko/generated',
    kind: 'asset',
    source: 'asset-library',
    label: 'generated-assets',
  },
  {
    relativeDir: '.neko/generated',
    kind: 'asset',
    source: 'asset-library',
    label: 'generated-assets',
  },
  { relativeDir: 'media', kind: 'media', source: 'media-library', label: 'media-library' },
  { relativeDir: 'neko/media', kind: 'media', source: 'media-library', label: 'media-library' },
  { relativeDir: '.neko/media', kind: 'media', source: 'media-library', label: 'media-library' },
];

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.exr',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.psd',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
]);
const VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
]);
const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.aiff',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.opus',
  '.wav',
]);
const DOCUMENT_EXTENSIONS = new Set([
  '.csv',
  '.doc',
  '.docx',
  '.json',
  '.md',
  '.pdf',
  '.rtf',
  '.txt',
  '.xls',
  '.xlsx',
  '.yaml',
  '.yml',
]);

export async function createTuiReferenceSuggestions(
  options: TuiReferenceSuggestionOptions,
): Promise<readonly InputSuggestionOption[]> {
  const root = path.resolve(options.workspaceRoot);
  const limit = options.limit ?? DEFAULT_REFERENCE_LIMIT;
  const localLibraryCandidates = await listLocalLibraryReferenceFiles(root, {
    limit,
    maxDepth: LOCAL_LIBRARY_MAX_DEPTH,
  });
  const contributedReferenceSuggestions = await listContributedReferenceSuggestions({
    contributors: options.referenceContributors ?? [],
    workspaceRoot: root,
    limit,
  });
  const extraReferenceSuggestions = (options.extraReferences ?? []).map(
    mentionReferenceCandidateToSuggestion,
  );
  const pathBackedLibraryRefs = new Set<string>();
  for (const candidate of localLibraryCandidates) {
    pathBackedLibraryRefs.add(candidate.relativePath);
  }
  for (const candidate of options.extraReferences ?? []) {
    const relativePath =
      candidate.filePath && isTerminalSafeReferencePath(candidate.filePath)
        ? normalizeTerminalPath(candidate.filePath)
        : undefined;
    if (relativePath) {
      pathBackedLibraryRefs.add(relativePath);
    }
  }

  const remainingFileLimit = Math.max(
    0,
    limit -
      localLibraryCandidates.length -
      contributedReferenceSuggestions.length -
      extraReferenceSuggestions.length,
  );
  const files = await listWorkspaceReferenceFiles(root, {
    limit: limit,
    maxDepth: options.maxDepth ?? DEFAULT_REFERENCE_MAX_DEPTH,
    excludedDirectories: options.excludedDirectories,
  });
  const workspaceFileSuggestions = files
    .filter((file) => !pathBackedLibraryRefs.has(file.relativePath))
    .slice(0, remainingFileLimit)
    .map(workspaceFileCandidateToSuggestion);

  return [
    ...localLibraryCandidates.map(localLibraryCandidateToSuggestion),
    ...contributedReferenceSuggestions,
    ...extraReferenceSuggestions,
    ...workspaceFileSuggestions,
  ].slice(0, limit);
}

async function listContributedReferenceSuggestions(input: {
  readonly contributors: readonly AgentReferenceContributor[];
  readonly workspaceRoot: string;
  readonly limit: number;
}): Promise<readonly InputSuggestionOption[]> {
  const suggestions: InputSuggestionOption[] = [];
  for (const contributor of input.contributors) {
    if (suggestions.length >= input.limit) {
      break;
    }
    const result = await contributor.search({
      query: '',
      limit: input.limit - suggestions.length,
      workspaceRoot: input.workspaceRoot,
    });
    for (const candidate of result.candidates) {
      suggestions.push(agentReferenceCandidateToSuggestion(candidate));
      if (suggestions.length >= input.limit) {
        break;
      }
    }
  }
  return suggestions;
}

async function listWorkspaceReferenceFiles(
  workspaceRoot: string,
  options: {
    readonly limit: number;
    readonly maxDepth: number;
    readonly excludedDirectories?: readonly string[];
  },
): Promise<readonly WorkspaceFileCandidate[]> {
  const results: WorkspaceFileCandidate[] = [];

  async function walk(directory: string, relativeDirectory: string, depth: number): Promise<void> {
    if (results.length >= options.limit || depth > options.maxDepth) {
      return;
    }

    let entries: readonly Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    const ordered = [...entries].sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const entry of ordered) {
      if (results.length >= options.limit) {
        break;
      }

      const relativePath = toPosixPath(path.join(relativeDirectory, entry.name));
      if (isMentionExcludedPath(relativePath, options.excludedDirectories)) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      let stat: { readonly size: number };
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        continue;
      }

      results.push({ relativePath, size: stat.size });
    }
  }

  await walk(workspaceRoot, '', 0);
  return results;
}

async function listLocalLibraryReferenceFiles(
  workspaceRoot: string,
  options: {
    readonly limit: number;
    readonly maxDepth: number;
  },
): Promise<readonly LocalLibraryReferenceCandidate[]> {
  const results: LocalLibraryReferenceCandidate[] = [];
  const seen = new Set<string>();

  for (const root of DEFAULT_LOCAL_LIBRARY_ROOTS) {
    if (results.length >= options.limit) break;
    const absoluteRoot = path.join(workspaceRoot, root.relativeDir);
    if (!(await directoryExists(absoluteRoot))) {
      continue;
    }

    const files = await listLibraryRootFiles({
      absoluteRoot,
      relativeRoot: root.relativeDir,
      limit: options.limit - results.length,
      maxDepth: options.maxDepth,
    });

    for (const file of files) {
      if (seen.has(file.relativePath)) {
        continue;
      }
      const mediaType = detectMentionMediaType(file.relativePath);
      if (!mediaType) {
        continue;
      }
      seen.add(file.relativePath);
      results.push({
        ...file,
        kind: root.kind,
        source: root.source,
        mediaType,
        libraryLabel: root.label,
      });
    }
  }

  return results;
}

async function listLibraryRootFiles(input: {
  readonly absoluteRoot: string;
  readonly relativeRoot: string;
  readonly limit: number;
  readonly maxDepth: number;
}): Promise<readonly WorkspaceFileCandidate[]> {
  const results: WorkspaceFileCandidate[] = [];

  async function walk(directory: string, relativeDirectory: string, depth: number): Promise<void> {
    if (results.length >= input.limit || depth > input.maxDepth) {
      return;
    }

    let entries: readonly Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    const ordered = [...entries].sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const entry of ordered) {
      if (results.length >= input.limit) {
        break;
      }
      if (isLocalLibraryExcludedName(entry.name)) {
        continue;
      }

      const relativePath = toPosixPath(path.join(relativeDirectory, entry.name));
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      let stat: { readonly size: number };
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        continue;
      }
      results.push({ relativePath, size: stat.size });
    }
  }

  await walk(input.absoluteRoot, input.relativeRoot, 0);
  return results;
}

function workspaceFileCandidateToSuggestion(file: WorkspaceFileCandidate): InputSuggestionOption {
  return {
    trigger: '@' as const,
    name: file.relativePath,
    matchText: file.relativePath,
    description: `workspace file · ${formatByteSize(file.size)}`,
    kind: 'file',
    insertText: `${formatMentionInsertText(file.relativePath)} `,
  };
}

function localLibraryCandidateToSuggestion(
  file: LocalLibraryReferenceCandidate,
): InputSuggestionOption {
  return {
    trigger: '@' as const,
    name: file.relativePath,
    matchText: [
      file.relativePath,
      path.basename(file.relativePath),
      file.kind,
      file.source,
      file.mediaType,
      file.libraryLabel,
    ].join(' '),
    description: `${file.libraryLabel} · ${file.mediaType} · ${formatByteSize(file.size)}`,
    kind: file.kind,
    insertText: `${formatMentionInsertText(file.relativePath)} `,
  };
}

function mentionReferenceCandidateToSuggestion(
  candidate: TuiMentionReferenceCandidate,
): InputSuggestionOption {
  const safeFilePath =
    candidate.filePath && isTerminalSafeReferencePath(candidate.filePath)
      ? normalizeTerminalPath(candidate.filePath)
      : undefined;
  const stableRef = candidate.id ?? safeFilePath ?? candidate.label;
  return {
    trigger: '@' as const,
    name: candidate.label,
    matchText: [
      candidate.label,
      candidate.id,
      candidate.description,
      safeFilePath,
      candidate.source,
      candidate.mediaType,
      candidate.entityType,
      candidate.searchText,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' '),
    description: formatMentionCandidateDescription(candidate, safeFilePath),
    kind: candidate.kind,
    insertText:
      candidate.insertText ??
      `${formatMentionInsertText(safeFilePath ?? `${candidate.kind}:${stableRef}`)} `,
  };
}

function agentReferenceCandidateToSuggestion(
  candidate: AgentReferenceCandidate,
): InputSuggestionOption {
  const safePath =
    candidate.path && isTerminalSafeReferencePath(candidate.path)
      ? normalizeTerminalPath(candidate.path)
      : undefined;
  const insertText = candidate.insertText.endsWith(' ')
    ? candidate.insertText
    : `${candidate.insertText} `;
  return {
    trigger: '@' as const,
    name: candidate.label,
    matchText: [
      candidate.label,
      candidate.id,
      candidate.description,
      candidate.source,
      candidate.kind,
      safePath,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' '),
    description: [candidate.source, candidate.kind, candidate.description, safePath]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' · '),
    kind: toTuiMentionReferenceKind(candidate.kind),
    insertText,
  };
}

function toTuiMentionReferenceKind(kind: AgentReferenceCandidate['kind']): TuiMentionReferenceKind {
  switch (kind) {
    case 'asset':
      return 'asset';
    case 'media':
      return 'media';
    case 'canvas':
      return 'canvas-node';
    case 'story-scene':
      return 'scene';
    case 'document':
    case 'artifact':
    case 'file':
      return 'file';
  }
}

function formatMentionCandidateDescription(
  candidate: TuiMentionReferenceCandidate,
  safeFilePath: string | undefined,
): string {
  return [
    candidate.source,
    candidate.mediaType,
    candidate.entityType,
    candidate.description,
    safeFilePath,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' · ');
}

function formatMentionInsertText(relativePath: string): string {
  if (/[\s"@]/.test(relativePath)) {
    return `@"${relativePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `@${relativePath}`;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}

function detectMentionMediaType(filePath: string): TuiMentionMediaType | null {
  const extension = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  return null;
}

function isLocalLibraryExcludedName(name: string): boolean {
  return (
    name === '.cache' || name === '.DS_Store' || name === 'node_modules' || name === 'thumbnails'
  );
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function isTerminalSafeReferencePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (/^(?:blob|data|file|https?|vscode-webview|webview):/i.test(normalized)) {
    return false;
  }
  if (
    path.isAbsolute(normalized) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.startsWith('//')
  ) {
    return false;
  }
  return !normalized.includes('/.neko/.cache/');
}

function normalizeTerminalPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}
