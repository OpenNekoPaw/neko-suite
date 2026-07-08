import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { constants as fsConstants, type Dirent } from 'node:fs';
import { isMentionExcludedPath } from '@neko/agent';
import type {
  AgentReferenceCandidate,
  AgentReferenceContributor,
  AssetEntity,
  ResolvedMediaLibrary,
} from '@neko/shared';
import type { InputSuggestionOption } from './input-suggestions';
import { formatTuiLabel, getTuiLabels } from '../../core/tui-locale';
import { createNodeWorkspaceContentPolicy } from '../../host/node-workspace-content-host';

export interface TuiReferenceSuggestionOptions {
  readonly workspaceRoot: string;
  readonly query?: string;
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

interface LocalLibraryScanRoot {
  readonly absoluteRoot: string;
  readonly displayRoot: string;
  readonly kind: 'asset' | 'media';
  readonly source: 'asset-library' | 'media-library';
  readonly label: string;
}

interface AssetLibraryFile {
  readonly entities: readonly AssetEntity[];
}

interface SearchIndexEntry {
  readonly filePath?: string;
  readonly fileName?: string;
  readonly libraryName?: string;
  readonly mediaType?: string;
}

interface SearchIndexFile {
  readonly entries: readonly SearchIndexEntry[];
}

type AssetLibraryEntityFile = AssetEntity['variants'][number]['files'][number];

const DEFAULT_REFERENCE_LIMIT = 80;
const DEFAULT_REFERENCE_MAX_DEPTH = 4;
const LOCAL_LIBRARY_MAX_DEPTH = 5;
const ASSET_LIBRARY_FILE = path.join('neko', 'assets', 'library.json');
const SEARCH_INDEX_CACHE_FILE = path.join('.neko', '.cache', 'search-index.json');
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
  const query = normalizeSuggestionQuery(options.query);
  const resolvedMediaLibraries = await readResolvedMediaLibraries(root);
  const localLibraryCandidates = await listLocalLibraryReferenceFiles(root, {
    limit,
    maxDepth: LOCAL_LIBRARY_MAX_DEPTH,
    resolvedMediaLibraries,
    query,
  });
  const assetLibraryCandidates = await listAssetLibraryReferenceCandidates(root, {
    limit,
    query,
  });
  const searchIndexCandidates = await listSearchIndexReferenceCandidates(root, {
    limit,
    resolvedMediaLibraries,
    query,
  });
  const contributedReferenceSuggestions = await listContributedReferenceSuggestions({
    contributors: options.referenceContributors ?? [],
    workspaceRoot: root,
    limit,
    query,
  });
  const assetLibrarySuggestions = assetLibraryCandidates.map(mentionReferenceCandidateToSuggestion);
  const searchIndexSuggestions = searchIndexCandidates.map(mentionReferenceCandidateToSuggestion);
  const extraReferenceSuggestions = (options.extraReferences ?? []).map(
    mentionReferenceCandidateToSuggestion,
  );
  const pathBackedLibraryRefs = new Set<string>();
  for (const candidate of localLibraryCandidates) {
    pathBackedLibraryRefs.add(candidate.relativePath);
  }
  for (const candidate of [
    ...assetLibraryCandidates,
    ...searchIndexCandidates,
    ...(options.extraReferences ?? []),
  ]) {
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
    query
      ? limit
      : limit -
          localLibraryCandidates.length -
          assetLibrarySuggestions.length -
          searchIndexSuggestions.length -
          contributedReferenceSuggestions.length -
          extraReferenceSuggestions.length,
  );
  const files = await listWorkspaceReferenceFiles(root, {
    limit: limit,
    maxDepth: options.maxDepth ?? DEFAULT_REFERENCE_MAX_DEPTH,
    excludedDirectories: options.excludedDirectories,
    query,
  });
  const workspaceFileSuggestions = files
    .filter((file) => !pathBackedLibraryRefs.has(file.relativePath))
    .slice(0, remainingFileLimit)
    .map(workspaceFileCandidateToSuggestion);

  const suggestions = [
    ...localLibraryCandidates.map(localLibraryCandidateToSuggestion),
    ...assetLibrarySuggestions,
    ...searchIndexSuggestions,
    ...contributedReferenceSuggestions,
    ...extraReferenceSuggestions,
    ...workspaceFileSuggestions,
  ]
    .filter(uniqueSuggestion());

  return (query
    ? suggestions
        .filter((suggestion) => matchesSuggestionQuery(suggestion, query))
        .sort((left, right) => compareSuggestionByQuery(left, right, query))
    : suggestions
  ).slice(0, limit);
}

async function listContributedReferenceSuggestions(input: {
  readonly contributors: readonly AgentReferenceContributor[];
  readonly workspaceRoot: string;
  readonly limit: number;
  readonly query?: string;
}): Promise<readonly InputSuggestionOption[]> {
  const suggestions: InputSuggestionOption[] = [];
  for (const contributor of input.contributors) {
    if (suggestions.length >= input.limit) {
      break;
    }
    const result = await contributor.search({
      query: input.query ?? '',
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
    readonly query?: string;
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

      if (options.query && !matchesQuery(relativePath, options.query)) {
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
    readonly resolvedMediaLibraries?: readonly ResolvedMediaLibrary[];
    readonly query?: string;
  },
): Promise<readonly LocalLibraryReferenceCandidate[]> {
  const results: LocalLibraryReferenceCandidate[] = [];
  const seen = new Set<string>();
  const configuredMediaLibraryRoots = listConfiguredMediaLibraryRoots(
    options.resolvedMediaLibraries ?? (await readResolvedMediaLibraries(workspaceRoot)),
  );
  const scanRoots: LocalLibraryScanRoot[] = [
    ...configuredMediaLibraryRoots,
    ...DEFAULT_LOCAL_LIBRARY_ROOTS.map((root) => ({
      absoluteRoot: path.join(workspaceRoot, root.relativeDir),
      displayRoot: root.relativeDir,
      kind: root.kind,
      source: root.source,
      label: root.label,
    })),
  ];

  for (const root of scanRoots) {
    if (results.length >= options.limit) break;
    if (!(await directoryExists(root.absoluteRoot))) {
      continue;
    }

    const files = await listLibraryRootFiles({
      absoluteRoot: root.absoluteRoot,
      relativeRoot: root.displayRoot,
      limit: options.limit - results.length,
      maxDepth: options.maxDepth,
      query: options.query,
    });

    for (const file of files) {
      if (seen.has(file.relativePath)) {
        continue;
      }
      const mediaType = detectMentionMediaType(file.relativePath);
      if (!mediaType) {
        continue;
      }
      if (options.query && !matchesQuery(file.relativePath, options.query)) {
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

function listConfiguredMediaLibraryRoots(
  libraries: readonly ResolvedMediaLibrary[],
): readonly LocalLibraryScanRoot[] {
  return libraries
    .filter((library) => library.enabled && library.accessible)
    .map((library) => ({
      absoluteRoot: library.resolvedPath,
      displayRoot: formatPathVariableReference(library.variable),
      kind: 'media' as const,
      source: 'media-library' as const,
      label: library.name,
    }));
}

async function listAssetLibraryReferenceCandidates(
  workspaceRoot: string,
  options: {
    readonly limit: number;
    readonly query?: string;
  },
): Promise<readonly TuiMentionReferenceCandidate[]> {
  const library = await readAssetLibraryFile(path.join(workspaceRoot, ASSET_LIBRARY_FILE));
  if (!library) {
    return [];
  }

  const candidates: TuiMentionReferenceCandidate[] = [];
  for (const entity of library.entities) {
    if (candidates.length >= options.limit) {
      break;
    }
    const files = readAssetEntityFiles(entity);
    const firstFile = files[0];
    const mediaType = firstFile ? toTuiMentionMediaType(firstFile.mediaType) : undefined;
    const filePath =
      firstFile?.path && isTerminalSafeReferencePath(firstFile.path) ? firstFile.path : undefined;

    const candidate: TuiMentionReferenceCandidate = {
      kind: 'asset',
      id: entity.id,
      label: entity.name,
      source: 'asset-library',
      ...(mediaType ? { mediaType } : {}),
      ...(filePath ? { filePath } : {}),
      description: formatAssetLibraryDescription(entity),
      searchText: formatAssetLibrarySearchText(entity, files),
      insertText: `@asset:${entity.id} `,
    };
    if (!options.query || matchesMentionCandidateQuery(candidate, options.query)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function listSearchIndexReferenceCandidates(
  workspaceRoot: string,
  options: {
    readonly limit: number;
    readonly resolvedMediaLibraries: readonly ResolvedMediaLibrary[];
    readonly query?: string;
  },
): Promise<readonly TuiMentionReferenceCandidate[]> {
  const index = await readSearchIndexFile(path.join(workspaceRoot, SEARCH_INDEX_CACHE_FILE));
  if (!index) {
    return [];
  }

  const candidates: TuiMentionReferenceCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of index.entries) {
    if (candidates.length >= options.limit) {
      break;
    }
    const durableRef = resolveSearchIndexDurableReference(entry, options.resolvedMediaLibraries);
    if (!durableRef || seen.has(durableRef)) {
      continue;
    }
    seen.add(durableRef);

    const mediaType = toTuiMentionMediaType(entry.mediaType) ?? detectMentionMediaType(durableRef);
    const label = entry.fileName ?? path.basename(durableRef);
    const candidate: TuiMentionReferenceCandidate = {
      kind: toSearchIndexMentionKind(mediaType),
      label,
      source: 'media-library',
      ...(mediaType ? { mediaType } : {}),
      filePath: durableRef,
      ...(entry.libraryName ? { description: entry.libraryName } : {}),
      searchText: [label, durableRef, entry.libraryName, entry.mediaType]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' '),
      insertText: `${formatMentionInsertText(durableRef)} `,
    };
    if (!options.query || matchesMentionCandidateQuery(candidate, options.query)) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

async function readResolvedMediaLibraries(
  workspaceRoot: string,
): Promise<readonly ResolvedMediaLibrary[]> {
  return createNodeWorkspaceContentPolicy({ workDir: workspaceRoot }).mediaLibraries;
}

async function readOptionalJsonFile(filePath: string): Promise<unknown | undefined> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw new Error(`Failed to read ${filePath}: ${formatUnknownError(error)}`);
  }

  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse ${filePath}: ${formatUnknownError(error)}`);
  }
}

async function readAssetLibraryFile(filePath: string): Promise<AssetLibraryFile | undefined> {
  const value = await readOptionalJsonFile(filePath);
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${ASSET_LIBRARY_FILE} must contain a JSON object.`);
  }
  const entities = value['entities'];
  if (entities === undefined) {
    return { entities: [] };
  }
  if (!Array.isArray(entities)) {
    throw new Error(`${ASSET_LIBRARY_FILE}.entities must be an array.`);
  }
  return {
    entities: entities.map((entity, index) => readAssetEntity(entity, index)),
  };
}

function readAssetEntity(value: unknown, index: number): AssetEntity {
  if (!isRecord(value)) {
    throw new Error(`${ASSET_LIBRARY_FILE}.entities[${index}] must be a JSON object.`);
  }
  if (!isAssetEntity(value)) {
    throw new Error(
      `${ASSET_LIBRARY_FILE}.entities[${index}] must be a valid asset entity with id, name, category, metadata, variants, tags, usageCount, createdAt, and updatedAt.`,
    );
  }
  return value;
}

function isAssetEntity(value: unknown): value is AssetEntity {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    typeof value['name'] === 'string' &&
    value['name'].length > 0 &&
    typeof value['category'] === 'string' &&
    value['category'].length > 0 &&
    isRecord(value['metadata']) &&
    Array.isArray(value['variants']) &&
    Array.isArray(value['tags']) &&
    value['tags'].every((tag) => typeof tag === 'string') &&
    typeof value['usageCount'] === 'number' &&
    typeof value['createdAt'] === 'number' &&
    typeof value['updatedAt'] === 'number'
  );
}

async function readSearchIndexFile(filePath: string): Promise<SearchIndexFile | undefined> {
  const value = await readOptionalJsonFile(filePath);
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${SEARCH_INDEX_CACHE_FILE} must contain a JSON object.`);
  }
  const entries = value['entries'];
  if (entries === undefined) {
    return { entries: [] };
  }
  if (!Array.isArray(entries)) {
    throw new Error(`${SEARCH_INDEX_CACHE_FILE}.entries must be an array.`);
  }
  return {
    entries: entries.map((entry, index) => readSearchIndexEntry(entry, index)),
  };
}

function readSearchIndexEntry(value: unknown, index: number): SearchIndexEntry {
  if (!isRecord(value)) {
    throw new Error(`${SEARCH_INDEX_CACHE_FILE}.entries[${index}] must be a JSON object.`);
  }
  return {
    ...readOptionalStringProperty(
      value,
      'filePath',
      `${SEARCH_INDEX_CACHE_FILE}.entries[${index}]`,
    ),
    ...readOptionalStringProperty(
      value,
      'fileName',
      `${SEARCH_INDEX_CACHE_FILE}.entries[${index}]`,
    ),
    ...readOptionalStringProperty(
      value,
      'libraryName',
      `${SEARCH_INDEX_CACHE_FILE}.entries[${index}]`,
    ),
    ...readOptionalStringProperty(
      value,
      'mediaType',
      `${SEARCH_INDEX_CACHE_FILE}.entries[${index}]`,
    ),
  };
}

function readOptionalStringProperty(
  value: Record<string, unknown>,
  key: keyof SearchIndexEntry,
  sourceLabel: string,
): Partial<SearchIndexEntry> {
  const property = value[key];
  if (property === undefined) {
    return {};
  }
  if (typeof property !== 'string') {
    throw new Error(`${sourceLabel}.${key} must be a string.`);
  }
  return property.length > 0 ? { [key]: property } : {};
}

async function listLibraryRootFiles(input: {
  readonly absoluteRoot: string;
  readonly relativeRoot: string;
  readonly limit: number;
  readonly maxDepth: number;
  readonly query?: string;
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

      if (input.query && !matchesQuery(relativePath, input.query)) {
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
  const labels = getTuiLabels();
  return {
    trigger: '@' as const,
    name: file.relativePath,
    matchText: file.relativePath,
    description: `${labels.referenceSources['workspace file']} · ${formatByteSize(file.size)}`,
    kind: 'file',
    insertText: `${formatMentionInsertText(file.relativePath)} `,
  };
}

function localLibraryCandidateToSuggestion(
  file: LocalLibraryReferenceCandidate,
): InputSuggestionOption {
  const labels = getTuiLabels();
  const libraryLabel = formatTuiLabel(labels.referenceSources, file.libraryLabel);
  const mediaType = formatTuiLabel(labels.mediaCategories, file.mediaType);
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
      libraryLabel,
      mediaType,
    ].join(' '),
    description: `${libraryLabel} · ${mediaType} · ${formatByteSize(file.size)}`,
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
  const labels = getTuiLabels();
  const safePath =
    candidate.path && isTerminalSafeReferencePath(candidate.path)
      ? normalizeTerminalPath(candidate.path)
      : undefined;
  const source = formatTuiLabel(labels.referenceSources, candidate.source);
  const kind = formatTuiLabel(labels.suggestionKinds, candidate.kind);
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
      source,
      kind,
      safePath,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' '),
    description: [source, kind, candidate.description, safePath]
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
    case 'entity':
      return 'entity';
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
  const labels = getTuiLabels();
  return [
    candidate.source ? formatTuiLabel(labels.referenceSources, candidate.source) : undefined,
    candidate.mediaType ? formatTuiLabel(labels.mediaCategories, candidate.mediaType) : undefined,
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

function readAssetEntityFiles(entity: AssetEntity): readonly AssetLibraryEntityFile[] {
  return entity.variants.flatMap((variant) => (Array.isArray(variant.files) ? variant.files : []));
}

function formatAssetLibraryDescription(entity: AssetEntity): string {
  return [entity.category, entity.description, entity.tags.join(', ')]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

function formatAssetLibrarySearchText(
  entity: AssetEntity,
  files: readonly AssetLibraryEntityFile[],
): string {
  return [
    entity.id,
    entity.name,
    entity.category,
    entity.description,
    ...(entity.tags ?? []),
    ...(entity.aliases ?? []),
    ...files.flatMap((file) => [file.id, file.name, file.path, file.mediaType]),
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}

function toTuiMentionMediaType(value: unknown): TuiMentionMediaType | undefined {
  switch (value) {
    case 'video':
    case 'audio':
    case 'image':
    case 'sequence':
    case 'text':
    case 'document':
      return value;
    default:
      return undefined;
  }
}

function toSearchIndexMentionKind(mediaType: TuiMentionMediaType | null | undefined) {
  return mediaType === 'document' || mediaType === 'text' ? 'file' : 'media';
}

function resolveSearchIndexDurableReference(
  entry: SearchIndexEntry,
  libraries: readonly ResolvedMediaLibrary[],
): string | undefined {
  if (!entry.filePath) {
    return undefined;
  }
  if (isTerminalSafeReferencePath(entry.filePath)) {
    return normalizeTerminalPath(entry.filePath);
  }
  return contractMediaLibraryPath(entry.filePath, libraries);
}

function contractMediaLibraryPath(
  filePath: string,
  libraries: readonly ResolvedMediaLibrary[],
): string | undefined {
  const absolutePath = path.resolve(filePath);
  const roots = libraries
    .filter((library) => library.enabled)
    .flatMap((library) => [
      { variable: library.variable, root: library.resolvedPath },
      { variable: library.variable, root: library.originalPath },
    ])
    .filter((entry) => path.isAbsolute(entry.root))
    .map((entry) => ({ ...entry, root: path.resolve(entry.root) }))
    .sort((left, right) => right.root.length - left.root.length);

  for (const entry of roots) {
    const relative = path.relative(entry.root, absolutePath);
    if (relative === '') {
      return formatPathVariableReference(entry.variable);
    }
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return `${formatPathVariableReference(entry.variable)}/${toPosixPath(relative)}`;
    }
  }
  return undefined;
}

function uniqueSuggestion(): (suggestion: InputSuggestionOption) => boolean {
  const seen = new Set<string>();
  return (suggestion) => {
    const key = suggestion.insertText ?? `${suggestion.kind ?? 'unknown'}:${suggestion.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };
}

function normalizeSuggestionQuery(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/^@+/, '').trim();
  return trimmed && trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function matchesMentionCandidateQuery(
  candidate: TuiMentionReferenceCandidate,
  query: string,
): boolean {
  return matchesQuery(
    [
      candidate.label,
      candidate.id,
      candidate.description,
      candidate.filePath,
      candidate.source,
      candidate.mediaType,
      candidate.entityType,
      candidate.searchText,
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' '),
    query,
  );
}

function matchesSuggestionQuery(suggestion: InputSuggestionOption, query: string): boolean {
  return matchesQuery([suggestion.name, suggestion.matchText].filter(Boolean).join(' '), query);
}

function compareSuggestionByQuery(
  left: InputSuggestionOption,
  right: InputSuggestionOption,
  query: string,
): number {
  const scoreDiff = scoreSuggestionQuery(left, query) - scoreSuggestionQuery(right, query);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }
  return left.name.localeCompare(right.name);
}

function scoreSuggestionQuery(suggestion: InputSuggestionOption, query: string): number {
  const name = suggestion.name.toLowerCase();
  const basename = path.basename(name);
  const matchText = (suggestion.matchText ?? '').toLowerCase();
  if (name === query || basename === query) return 0;
  if (name.startsWith(query) || basename.startsWith(query)) return 1;
  if (name.includes(`/${query}`) || basename.includes(query)) return 2;
  if (name.includes(query)) return 3;
  if (matchText.includes(query)) return 4;
  return 100;
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function isLocalLibraryExcludedName(name: string): boolean {
  return (
    name === '.cache' || name === '.DS_Store' || name === 'node_modules' || name === 'thumbnails'
  );
}

function formatPathVariableReference(variable: string): string {
  return '${' + variable + '}';
}

async function isReadableDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return false;
    }
    await fs.access(dirPath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFileNotFoundError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
