import * as path from 'node:path';
import * as vscode from 'vscode';
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityOccurrenceRef,
  DashboardCreativeEntityRef,
  DashboardCreativeEntitySource,
  NekoStoryAPI,
  NekoStoryScriptIndex,
  ProjectIndexFreshness,
  ProjectSearchItem,
  ProjectSearchItemKind,
  ProjectSearchResult,
} from '@neko/shared';
import {
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityDetail,
  isDashboardCreativeEntitySource,
  type DashboardCreativeEntitySourceRequest,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  aggregateCharacterEvidenceFreshness,
  dedupeCharacterEvidenceChunks,
  normalizeCharacterEvidenceBudget,
  normalizeCharacterEvidenceTokens,
  scoreCharacterEvidenceChunk,
  trimCharacterEvidenceChunks,
  type CharacterEvidenceAuthority,
  type CharacterEvidenceBundle,
  type CharacterEvidenceChunk,
  type CharacterEvidenceLoader,
  type CharacterEvidenceOmission,
  type CharacterEvidenceRequest,
  type CharacterEvidenceSourceKind,
  type CharacterEvidenceSourceRef,
} from '@neko/agent/runtime';
import { PROJECT_SEARCH_QUERY_COMMAND } from '../services/projectSearch/commands';
import { getLogger } from '../base';

export interface CharacterEvidenceDashboardDetailReader {
  listDetails(entityRef: CreativeEntityRef): Promise<readonly DashboardCreativeEntityDetail[]>;
}

export interface CharacterEvidenceOccurrenceReader {
  listOccurrences(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityOccurrenceProjection[]>;
}

export interface CharacterEvidenceProjectSearchReader {
  search(input: CharacterEvidenceProjectSearchInput): Promise<readonly ProjectSearchItem[]>;
}

export interface CharacterEvidenceStoryIndexReader {
  getScriptIndex(filePath: string): Promise<NekoStoryScriptIndex | undefined>;
}

export interface CharacterEvidenceTextReader {
  readTextFile(filePath: string): Promise<string>;
}

export interface CharacterEvidenceProjectSearchInput {
  readonly projectRoot: string;
  readonly query: string;
  readonly entityRef: CreativeEntityRef;
  readonly limit: number;
}

export interface CharacterEvidenceLoaderOptions {
  readonly projectRoot: string;
  readonly dashboardReader?: CharacterEvidenceDashboardDetailReader;
  readonly occurrenceReader?: CharacterEvidenceOccurrenceReader;
  readonly projectSearchReader?: CharacterEvidenceProjectSearchReader;
  readonly storyIndexReader?: CharacterEvidenceStoryIndexReader;
  readonly textReader?: CharacterEvidenceTextReader;
  readonly maxWindowLines?: number;
  readonly maxLocators?: number;
  readonly supportedExtensions?: readonly string[];
  readonly logger?: Pick<ReturnType<typeof getLogger>, 'debug' | 'warn'>;
}

export interface CharacterEvidenceResolvedProjectPath {
  readonly filePath: string;
  readonly projectRelativePath: string;
}

interface CharacterEvidenceLocator {
  readonly id: string;
  readonly sourceKind: CharacterEvidenceSourceKind;
  readonly label?: string;
  readonly providerId?: string;
  readonly rawLocation?: string;
  readonly candidatePath?: string;
  readonly allowAbsolutePath: boolean;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly authority: CharacterEvidenceAuthority;
  readonly freshness: ProjectIndexFreshness;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

interface CharacterEvidencePathResolutionInput {
  readonly projectRoot: string;
  readonly candidatePath: string;
  readonly allowAbsolutePath: boolean;
  readonly supportedExtensions?: readonly string[];
}

interface ParsedCharacterEvidenceLocation {
  readonly candidatePath: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

interface CharacterEvidenceLineRange {
  readonly startLine: number;
  readonly endLine: number;
  readonly capped: boolean;
}

const logger = getLogger('CharacterEvidenceLoader');
const DEFAULT_MAX_WINDOW_LINES = 120;
const DEFAULT_MAX_LOCATORS = 96;
const DEFAULT_PROJECT_SEARCH_LIMIT = 24;
const DEFAULT_SUPPORTED_EXTENSIONS = ['.fountain', '.spmd', '.md', '.txt', '.nekostory'] as const;
const PROJECT_SEARCH_LOCATOR_KINDS: readonly ProjectSearchItemKind[] = [
  'story-scene',
  'story-section',
  'script-role',
];

export function createCharacterEvidenceLoader(
  options: CharacterEvidenceLoaderOptions,
): CharacterEvidenceLoader {
  const loader = new ExtensionCharacterEvidenceLoader(options);
  return {
    loadEvidence: (request) => loader.loadEvidence(request),
  };
}

export function createDefaultCharacterEvidenceLoader(projectRoot: string): CharacterEvidenceLoader {
  return createCharacterEvidenceLoader({ projectRoot });
}

export function resolveCharacterEvidenceProjectPath(
  input: CharacterEvidencePathResolutionInput,
): CharacterEvidenceResolvedProjectPath | null {
  const candidate = input.candidatePath.trim();
  if (!candidate) return null;
  if (/^[a-z]+:\/\//i.test(candidate)) return null;

  const supportedExtensions = input.supportedExtensions ?? DEFAULT_SUPPORTED_EXTENSIONS;
  const rawPath = stripLocationSuffix(candidate);
  if (!isSupportedCharacterEvidencePath(rawPath, supportedExtensions)) {
    return null;
  }

  if (path.isAbsolute(rawPath) && !input.allowAbsolutePath) {
    return null;
  }

  const filePath = path.normalize(
    path.isAbsolute(rawPath) ? rawPath : path.join(input.projectRoot, rawPath),
  );
  if (!isPathInsideProject(input.projectRoot, filePath)) {
    return null;
  }

  return {
    filePath,
    projectRelativePath: normalizeProjectRelativePath(path.relative(input.projectRoot, filePath)),
  };
}

export function parseCharacterEvidenceLocation(
  location: string,
): ParsedCharacterEvidenceLocation | null {
  const trimmed = location.trim();
  if (!trimmed) return null;

  const rangeMatch = /^(.*?):(\d+)(?:-(\d+))?(?::\d+)?$/.exec(trimmed);
  if (!rangeMatch) return { candidatePath: trimmed };

  const candidatePath = rangeMatch[1]?.trim();
  const lineStart = readPositiveInteger(rangeMatch[2]);
  const lineEnd = readPositiveInteger(rangeMatch[3]) ?? lineStart;
  if (!candidatePath || lineStart === undefined) {
    return null;
  }

  return {
    candidatePath,
    lineStart,
    lineEnd: lineEnd !== undefined && lineEnd >= lineStart ? lineEnd : lineStart,
  };
}

class ExtensionCharacterEvidenceLoader implements CharacterEvidenceLoader {
  private readonly projectRoot: string;
  private readonly dashboardReader: CharacterEvidenceDashboardDetailReader;
  private readonly occurrenceReader: CharacterEvidenceOccurrenceReader | undefined;
  private readonly projectSearchReader: CharacterEvidenceProjectSearchReader;
  private readonly storyIndexReader: CharacterEvidenceStoryIndexReader;
  private readonly textReader: CharacterEvidenceTextReader;
  private readonly maxWindowLines: number;
  private readonly maxLocators: number;
  private readonly supportedExtensions: readonly string[];
  private readonly logger: Pick<ReturnType<typeof getLogger>, 'debug' | 'warn'>;

  constructor(options: CharacterEvidenceLoaderOptions) {
    this.projectRoot = options.projectRoot;
    this.dashboardReader =
      options.dashboardReader ?? createDashboardCharacterEvidenceDetailReader(options.projectRoot);
    this.occurrenceReader = options.occurrenceReader;
    this.projectSearchReader =
      options.projectSearchReader ?? createVSCodeProjectSearchEvidenceReader();
    this.storyIndexReader = options.storyIndexReader ?? createVSCodeStoryIndexReader();
    this.textReader = options.textReader ?? createVSCodeCharacterEvidenceTextReader();
    this.maxWindowLines = options.maxWindowLines ?? DEFAULT_MAX_WINDOW_LINES;
    this.maxLocators = options.maxLocators ?? DEFAULT_MAX_LOCATORS;
    this.supportedExtensions = options.supportedExtensions ?? DEFAULT_SUPPORTED_EXTENSIONS;
    this.logger = options.logger ?? logger;
  }

  async loadEvidence(request: CharacterEvidenceRequest): Promise<CharacterEvidenceBundle> {
    const budget = normalizeCharacterEvidenceBudget(request.budget);
    const omitted: CharacterEvidenceOmission[] = [];
    const entityRef = normalizeEntityRefProjectRoot(request.entityRef, request.projectRoot);
    const details = await this.loadDashboardDetails(entityRef, omitted);
    const profileTokens = collectProfileTokens(entityRef, details);
    const locators = await this.collectLocators({
      request: { ...request, entityRef },
      details,
      profileTokens,
      omitted,
    });
    const chunks = await this.loadChunks({
      request: { ...request, entityRef, budget },
      locators,
      profileTokens,
      omitted,
    });
    const deduped = dedupeCharacterEvidenceChunks(chunks);
    const trimmed = trimCharacterEvidenceChunks({ chunks: deduped, budget });
    const allOmitted = [...omitted, ...trimmed.omitted];
    const freshness = aggregateCharacterEvidenceFreshness([
      ...trimmed.chunks.map((chunk) => chunk.freshness),
      ...locators.map((locator) => locator.freshness),
    ]);

    return {
      entityRef,
      mode: request.mode,
      query: request.query,
      chunks: trimmed.chunks,
      omitted: allOmitted,
      freshness,
      budget,
    };
  }

  private async loadDashboardDetails(
    entityRef: CreativeEntityRef,
    omitted: CharacterEvidenceOmission[],
  ): Promise<readonly DashboardCreativeEntityDetail[]> {
    try {
      return await this.dashboardReader.listDetails(entityRef);
    } catch (error) {
      omitted.push({
        reason: 'unavailable',
        message: `Dashboard detail evidence is unavailable: ${formatUnknownError(error)}`,
      });
      return [];
    }
  }

  private async collectLocators(input: {
    readonly request: CharacterEvidenceRequest;
    readonly details: readonly DashboardCreativeEntityDetail[];
    readonly profileTokens: readonly string[];
    readonly omitted: CharacterEvidenceOmission[];
  }): Promise<readonly CharacterEvidenceLocator[]> {
    const locators: CharacterEvidenceLocator[] = [
      ...(input.request.seedSourceRefs ?? []).flatMap(sourceRefToLocator),
      ...input.details.flatMap((detail) => dashboardDetailToLocators(detail)),
    ];

    if (this.occurrenceReader) {
      try {
        locators.push(
          ...(await this.occurrenceReader.listOccurrences(input.request.entityRef)).flatMap(
            occurrenceProjectionToLocator,
          ),
        );
      } catch (error) {
        input.omitted.push({
          reason: 'unavailable',
          message: `Entity occurrence evidence is unavailable: ${formatUnknownError(error)}`,
        });
      }
    }

    locators.push(...(await this.collectProjectSearchLocators(input)));
    locators.push(...(await this.collectStorySceneLocators(locators, input.profileTokens)));

    const deduped = dedupeLocators(locators).slice(0, this.maxLocators);
    for (const locator of deduped) {
      if (locator.freshness === 'fresh' || locator.freshness === 'partial') continue;
      input.omitted.push({
        reason: 'stale',
        sourceRef: locatorToSourceRef(locator),
        message: `Evidence locator freshness is ${locator.freshness}; using available fallback evidence only when it can be read safely.`,
      });
    }
    return deduped;
  }

  private async collectProjectSearchLocators(input: {
    readonly request: CharacterEvidenceRequest;
    readonly details: readonly DashboardCreativeEntityDetail[];
    readonly omitted: CharacterEvidenceOmission[];
  }): Promise<readonly CharacterEvidenceLocator[]> {
    const searchQuery = buildEvidenceSearchQuery(input.request, input.details);
    if (!searchQuery) return [];

    try {
      const items = await this.projectSearchReader.search({
        projectRoot: input.request.projectRoot,
        query: searchQuery,
        entityRef: input.request.entityRef,
        limit: DEFAULT_PROJECT_SEARCH_LIMIT,
      });
      return items.flatMap(projectSearchItemToLocator);
    } catch (error) {
      input.omitted.push({
        reason: 'unavailable',
        message: `Project search evidence locators are unavailable: ${formatUnknownError(error)}`,
      });
      return [];
    }
  }

  private async collectStorySceneLocators(
    locators: readonly CharacterEvidenceLocator[],
    profileTokens: readonly string[],
  ): Promise<readonly CharacterEvidenceLocator[]> {
    const byFile = new Map<string, CharacterEvidenceLocator[]>();
    for (const locator of locators) {
      const candidatePath = locator.candidatePath ?? parseCandidatePath(locator.rawLocation);
      if (!candidatePath) continue;
      const resolved = resolveCharacterEvidenceProjectPath({
        projectRoot: this.projectRoot,
        candidatePath,
        allowAbsolutePath: locator.allowAbsolutePath,
        supportedExtensions: this.supportedExtensions,
      });
      if (!resolved) continue;
      const existing = byFile.get(resolved.filePath) ?? [];
      byFile.set(resolved.filePath, [...existing, locator]);
    }

    const sceneLocators: CharacterEvidenceLocator[] = [];
    for (const [filePath, fileLocators] of byFile) {
      const index = await this.safeGetScriptIndex(filePath);
      if (!index) continue;
      const matchedScenes = new Set<string>();
      for (const locator of fileLocators) {
        const scene = findSceneForLocator(index, locator, profileTokens);
        if (!scene || matchedScenes.has(scene.sceneId)) continue;
        matchedScenes.add(scene.sceneId);
        sceneLocators.push({
          id: `story-scene:${filePath}:${scene.sceneId}`,
          sourceKind: 'story-script-index',
          label: scene.heading || scene.sceneTitle,
          providerId: 'neko-story',
          candidatePath: filePath,
          allowAbsolutePath: true,
          lineStart: scene.line_start + 1,
          lineEnd: scene.line_end + 1,
          authority: 'indexed',
          freshness: 'fresh',
          metadata: {
            sceneId: scene.sceneId,
            source: 'script-index',
          },
        });
      }
    }

    return sceneLocators;
  }

  private async safeGetScriptIndex(filePath: string): Promise<NekoStoryScriptIndex | undefined> {
    try {
      return await this.storyIndexReader.getScriptIndex(filePath);
    } catch (error) {
      this.logger.debug('Character evidence Story index unavailable', {
        filePath,
        error: formatUnknownError(error),
      });
      return undefined;
    }
  }

  private async loadChunks(input: {
    readonly request: CharacterEvidenceRequest;
    readonly locators: readonly CharacterEvidenceLocator[];
    readonly profileTokens: readonly string[];
    readonly omitted: CharacterEvidenceOmission[];
  }): Promise<readonly CharacterEvidenceChunk[]> {
    const chunks: CharacterEvidenceChunk[] = [];
    const transcriptTokens = normalizeCharacterEvidenceTokens(
      (input.request.transcript ?? [])
        .slice(-6)
        .map((message) => message.content)
        .join(' '),
    );
    const queryTokens = normalizeCharacterEvidenceTokens(input.request.query);

    for (const locator of input.locators) {
      const resolved = this.resolveLocatorPath(locator, input.omitted);
      if (!resolved) continue;

      const text = await this.safeReadText(resolved, locator, input.omitted);
      if (text === undefined) continue;

      const lines = text.split(/\r?\n/);
      if (lines.length === 0) {
        input.omitted.push({
          reason: 'empty',
          sourceRef: locatorToSourceRef(locator, resolved),
          message: `Evidence source is empty: ${resolved.projectRelativePath}`,
        });
        continue;
      }

      const range = resolveLineRange(locator, lines.length, this.maxWindowLines);
      const chunkText = renderEvidenceChunkText({
        relativePath: resolved.projectRelativePath,
        label: locator.label,
        range,
        lines,
      });
      if (!chunkText.trim()) {
        input.omitted.push({
          reason: 'empty',
          sourceRef: locatorToSourceRef(locator, resolved),
          message: `Evidence range is empty: ${resolved.projectRelativePath}`,
        });
        continue;
      }

      if (range.capped) {
        input.omitted.push({
          reason: 'budget',
          sourceRef: locatorToSourceRef(locator, resolved, range),
          message: `Evidence range was capped to ${this.maxWindowLines} lines.`,
        });
      }

      const sourceRef = locatorToSourceRef(locator, resolved, range);
      const chunkWithoutRelevance = {
        id: characterEvidenceChunkId(sourceRef),
        text: chunkText,
        sourceRefs: [sourceRef],
        authority: locator.authority,
        freshness: locator.freshness,
        metadata: locator.metadata,
      };
      const chunk: CharacterEvidenceChunk = {
        ...chunkWithoutRelevance,
        relevance: scoreCharacterEvidenceChunk({
          chunk: chunkWithoutRelevance,
          queryTokens,
          entityTokens: input.profileTokens,
          transcriptTokens,
        }),
      };
      chunks.push(chunk);
    }

    return chunks;
  }

  private resolveLocatorPath(
    locator: CharacterEvidenceLocator,
    omitted: CharacterEvidenceOmission[],
  ): CharacterEvidenceResolvedProjectPath | null {
    const candidatePath = locator.candidatePath ?? parseCandidatePath(locator.rawLocation);
    if (!candidatePath) {
      omitted.push({
        reason: 'malformed-source',
        sourceRef: locatorToSourceRef(locator),
        message: `Evidence locator is missing a readable path: ${locator.rawLocation ?? locator.id}`,
      });
      return null;
    }

    const resolved = resolveCharacterEvidenceProjectPath({
      projectRoot: this.projectRoot,
      candidatePath,
      allowAbsolutePath: locator.allowAbsolutePath,
      supportedExtensions: this.supportedExtensions,
    });
    if (!resolved) {
      const sourcePath = stripLocationSuffix(candidatePath);
      omitted.push({
        reason: isSupportedCharacterEvidencePath(sourcePath, this.supportedExtensions)
          ? 'safety'
          : 'unsupported-source',
        sourceRef: locatorToSourceRef(locator),
        message: `Evidence source is outside project scope or unsupported: ${candidatePath}`,
      });
      return null;
    }
    return resolved;
  }

  private async safeReadText(
    resolved: CharacterEvidenceResolvedProjectPath,
    locator: CharacterEvidenceLocator,
    omitted: CharacterEvidenceOmission[],
  ): Promise<string | undefined> {
    try {
      return await this.textReader.readTextFile(resolved.filePath);
    } catch (error) {
      omitted.push({
        reason: 'missing-source',
        sourceRef: locatorToSourceRef(locator, resolved),
        message: `Evidence source could not be read: ${resolved.projectRelativePath}`,
        metadata: { error: formatUnknownError(error) },
      });
      return undefined;
    }
  }
}

function createDashboardCharacterEvidenceDetailReader(
  projectRoot: string,
): CharacterEvidenceDashboardDetailReader {
  return {
    async listDetails(entityRef) {
      const sources = await loadDashboardCreativeEntitySources({ projectRoot });
      const details: DashboardCreativeEntityDetail[] = [];
      for (const source of orderDashboardSourcesForEntityRef(sources, entityRef)) {
        for (const ref of dashboardRefsForEntity(projectRoot, source.source, entityRef)) {
          try {
            const detail = await source.getDetail(ref);
            if (isDashboardCreativeEntityDetail(detail)) {
              details.push(detail);
              break;
            }
          } catch (error) {
            logger.debug('Character evidence Dashboard detail source failed', {
              source: source.source,
              entityId: entityRef.entityId,
              error: formatUnknownError(error),
            });
          }
        }
      }
      return details;
    },
  };
}

function createVSCodeProjectSearchEvidenceReader(): CharacterEvidenceProjectSearchReader {
  return {
    async search(input) {
      const result = await vscode.commands.executeCommand<ProjectSearchResult>(
        PROJECT_SEARCH_QUERY_COMMAND,
        {
          text: input.query,
          mode: 'agent-tool',
          projectRoot: input.projectRoot,
          kinds: PROJECT_SEARCH_LOCATOR_KINDS,
          partitions: ['story-symbols'],
          freshness: 'allow-stale',
          limit: input.limit,
        },
      );
      return (result?.items ?? []).filter((item) => item.projectRoot === input.projectRoot);
    },
  };
}

function createVSCodeStoryIndexReader(): CharacterEvidenceStoryIndexReader {
  return {
    async getScriptIndex(filePath) {
      const api = await getStoryApi();
      return api?.getScriptIndex(filePath);
    },
  };
}

function createVSCodeCharacterEvidenceTextReader(): CharacterEvidenceTextReader {
  return {
    async readTextFile(filePath) {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      return new TextDecoder().decode(raw);
    },
  };
}

async function loadDashboardCreativeEntitySources(
  request: DashboardCreativeEntitySourceRequest,
): Promise<readonly DashboardCreativeEntitySource[]> {
  const commands = [
    DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
    DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  ] as const;
  const sources: DashboardCreativeEntitySource[] = [];
  for (const command of commands) {
    try {
      const source = await vscode.commands.executeCommand<unknown>(command, request);
      if (isDashboardCreativeEntitySource(source)) {
        sources.push(source);
      }
    } catch (error) {
      logger.debug('Character evidence Dashboard source unavailable', {
        command,
        error: formatUnknownError(error),
      });
    }
  }
  return sources;
}

async function getStoryApi(): Promise<NekoStoryAPI | undefined> {
  try {
    const extension = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    if (!extension) return undefined;
    return extension.isActive ? extension.exports : await extension.activate();
  } catch {
    return undefined;
  }
}

function dashboardDetailToLocators(
  detail: DashboardCreativeEntityDetail,
): readonly CharacterEvidenceLocator[] {
  return detail.occurrences.flatMap((occurrence) => {
    if (occurrence.source !== 'script') return [];
    return dashboardOccurrenceToLocator(detail, occurrence);
  });
}

function dashboardOccurrenceToLocator(
  detail: DashboardCreativeEntityDetail,
  occurrence: DashboardCreativeEntityOccurrenceRef,
): readonly CharacterEvidenceLocator[] {
  const parsed = parseCharacterEvidenceLocation(occurrence.location);
  if (!parsed) {
    return [
      {
        id: `dashboard:${detail.ref.source}:${occurrence.location}`,
        sourceKind: 'dashboard-detail',
        label: occurrence.label,
        providerId: detail.ref.source,
        rawLocation: occurrence.location,
        allowAbsolutePath: false,
        authority: 'confirmed',
        freshness: detail.freshness,
        metadata: {
          occurrenceRole: occurrence.role,
          dashboardSource: detail.ref.source,
        },
      },
    ];
  }

  return [
    {
      id: `dashboard:${detail.ref.source}:${occurrence.location}`,
      sourceKind: 'dashboard-detail',
      label: occurrence.label,
      providerId: detail.ref.source,
      rawLocation: occurrence.location,
      candidatePath: parsed.candidatePath,
      allowAbsolutePath: false,
      lineStart: parsed.lineStart,
      lineEnd: parsed.lineEnd,
      authority: 'confirmed',
      freshness: detail.freshness,
      metadata: {
        occurrenceRole: occurrence.role,
        dashboardSource: detail.ref.source,
      },
    },
  ];
}

function occurrenceProjectionToLocator(
  occurrence: CreativeEntityOccurrenceProjection,
): readonly CharacterEvidenceLocator[] {
  const parsed = parseCharacterEvidenceLocation(occurrence.source.sourceRef ?? occurrence.location);
  return [
    {
      id: `occurrence:${occurrence.source.providerId ?? occurrence.source.sourceId}:${occurrence.location}`,
      sourceKind: 'entity-occurrence',
      label: occurrence.label,
      providerId: occurrence.source.providerId ?? occurrence.source.sourceId,
      rawLocation: occurrence.source.sourceRef ?? occurrence.location,
      ...(parsed ? { candidatePath: parsed.candidatePath } : {}),
      allowAbsolutePath: false,
      ...(parsed?.lineStart !== undefined ? { lineStart: parsed.lineStart } : {}),
      ...(parsed?.lineEnd !== undefined ? { lineEnd: parsed.lineEnd } : {}),
      authority: occurrence.source.sourceKind === 'story' ? 'confirmed' : 'indexed',
      freshness: occurrence.source.freshness ?? 'fresh',
      metadata: {
        occurrenceRole: occurrence.role,
        sourceKind: occurrence.source.sourceKind,
      },
    },
  ];
}

function projectSearchItemToLocator(item: ProjectSearchItem): readonly CharacterEvidenceLocator[] {
  const candidatePath =
    readString(item.navigationData?.['filePath']) ??
    item.source.projectRelativePath ??
    item.source.filePath ??
    item.filePath;
  if (!candidatePath) return [];

  const lineStart =
    readLineFromProjectSearchItem(item, 'lineStart') ?? readLineFromProjectSearchItem(item, 'line');
  const lineEnd = readLineFromProjectSearchItem(item, 'lineEnd') ?? lineStart;

  return [
    {
      id: `project-search:${item.id}`,
      sourceKind: 'project-search',
      label: item.label,
      providerId: item.source.sourceId ?? item.source.partition,
      candidatePath,
      allowAbsolutePath: true,
      ...(lineStart !== undefined ? { lineStart } : {}),
      ...(lineEnd !== undefined ? { lineEnd } : {}),
      authority:
        item.kind === 'story-scene' || item.kind === 'script-role' ? 'indexed' : 'suggested',
      freshness: item.freshness,
      metadata: {
        itemKind: item.kind,
        sourcePartition: item.source.partition,
      },
    },
  ];
}

function sourceRefToLocator(
  sourceRef: CharacterEvidenceSourceRef,
): readonly CharacterEvidenceLocator[] {
  const candidatePath = sourceRef.projectRelativePath ?? sourceRef.filePath ?? sourceRef.location;
  if (!candidatePath) return [];
  return [
    {
      id: sourceRef.id,
      sourceKind: sourceRef.kind,
      label: sourceRef.label,
      providerId: sourceRef.providerId,
      rawLocation: sourceRef.location,
      candidatePath,
      allowAbsolutePath: Boolean(sourceRef.filePath),
      lineStart: sourceRef.lineStart,
      lineEnd: sourceRef.lineEnd,
      authority: 'indexed',
      freshness: sourceRef.freshness ?? 'fresh',
      metadata: sourceRef.metadata,
    },
  ];
}

function findSceneForLocator(
  index: NekoStoryScriptIndex,
  locator: CharacterEvidenceLocator,
  profileTokens: readonly string[],
): NekoStoryScriptIndex['scenes'][number] | undefined {
  if (locator.lineStart !== undefined) {
    const zeroBasedLine = Math.max(0, locator.lineStart - 1);
    const lineScene = index.scenes.find(
      (scene) => scene.line_start <= zeroBasedLine && scene.line_end >= zeroBasedLine,
    );
    if (lineScene) return lineScene;
  }

  const tokenSet = new Set(profileTokens);
  return index.scenes.find((scene) =>
    scene.sceneCharacters.some((name) =>
      normalizeCharacterEvidenceTokens(name).some((token) => tokenSet.has(token)),
    ),
  );
}

function resolveLineRange(
  locator: CharacterEvidenceLocator,
  totalLines: number,
  maxWindowLines: number,
): CharacterEvidenceLineRange {
  const cappedWindow = Math.max(1, maxWindowLines);
  const requestedStart = clampLine(locator.lineStart ?? 1, totalLines);
  const requestedEnd = clampLine(locator.lineEnd ?? requestedStart, totalLines);
  const startLine = Math.min(requestedStart, requestedEnd);
  let endLine = Math.max(requestedStart, requestedEnd);

  if (locator.lineEnd === undefined && locator.lineStart !== undefined) {
    const halfWindow = Math.floor(cappedWindow / 2);
    const start = Math.max(1, locator.lineStart - halfWindow);
    const end = Math.min(totalLines, start + cappedWindow - 1);
    return {
      startLine: start,
      endLine: end,
      capped:
        end - start + 1 < Math.min(totalLines, cappedWindow) ? false : totalLines > cappedWindow,
    };
  }

  const requestedCount = endLine - startLine + 1;
  if (requestedCount > cappedWindow) {
    endLine = startLine + cappedWindow - 1;
    return { startLine, endLine, capped: true };
  }

  return { startLine, endLine, capped: false };
}

function renderEvidenceChunkText(input: {
  readonly relativePath: string;
  readonly label?: string;
  readonly range: CharacterEvidenceLineRange;
  readonly lines: readonly string[];
}): string {
  const selected = input.lines.slice(input.range.startLine - 1, input.range.endLine);
  const numbered = selected.map((line, index) => `${input.range.startLine + index}: ${line}`);
  return [
    `Script file: ${input.relativePath}`,
    `Lines: ${input.range.startLine}-${input.range.endLine}`,
    'Evidence:',
    ...numbered,
  ].join('\n');
}

function locatorToSourceRef(
  locator: CharacterEvidenceLocator,
  resolved?: CharacterEvidenceResolvedProjectPath,
  range?: CharacterEvidenceLineRange,
): CharacterEvidenceSourceRef {
  return {
    id: locator.id,
    kind: locator.sourceKind,
    ...(locator.label ? { label: locator.label } : {}),
    ...(locator.providerId ? { providerId: locator.providerId } : {}),
    ...(locator.rawLocation ? { location: locator.rawLocation } : {}),
    ...(resolved?.projectRelativePath ? { projectRelativePath: resolved.projectRelativePath } : {}),
    ...(resolved?.filePath ? { filePath: resolved.filePath } : {}),
    ...(range?.startLine !== undefined ? { lineStart: range.startLine } : {}),
    ...(range?.endLine !== undefined ? { lineEnd: range.endLine } : {}),
    freshness: locator.freshness,
    ...(locator.metadata ? { metadata: locator.metadata } : {}),
  };
}

function characterEvidenceChunkId(sourceRef: CharacterEvidenceSourceRef): string {
  return [
    sourceRef.kind,
    sourceRef.projectRelativePath ?? sourceRef.filePath ?? sourceRef.location ?? sourceRef.id,
    sourceRef.lineStart ?? '',
    sourceRef.lineEnd ?? '',
  ].join(':');
}

function buildEvidenceSearchQuery(
  request: CharacterEvidenceRequest,
  details: readonly DashboardCreativeEntityDetail[],
): string {
  return [
    request.query,
    request.entityRef.entityId,
    ...details.flatMap((detail) => [detail.label, ...detail.aliases]),
  ]
    .filter((value) => value.trim().length > 0)
    .join(' ');
}

function collectProfileTokens(
  entityRef: CreativeEntityRef,
  details: readonly DashboardCreativeEntityDetail[],
): readonly string[] {
  return normalizeCharacterEvidenceTokens([
    entityRef.entityId,
    ...details.flatMap((detail) => [detail.label, ...detail.aliases]),
  ]);
}

function dedupeLocators(
  locators: readonly CharacterEvidenceLocator[],
): readonly CharacterEvidenceLocator[] {
  const seen = new Set<string>();
  const deduped: CharacterEvidenceLocator[] = [];
  for (const locator of locators) {
    const key = [
      locator.sourceKind,
      locator.candidatePath ?? locator.rawLocation ?? locator.id,
      locator.lineStart ?? '',
      locator.lineEnd ?? '',
      locator.label ?? '',
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(locator);
  }
  return deduped;
}

function orderDashboardSourcesForEntityRef(
  sources: readonly DashboardCreativeEntitySource[],
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntitySource[] {
  return [...sources].sort((left, right) => {
    const leftRank = dashboardSourceRank(left.source, entityRef);
    const rightRank = dashboardSourceRank(right.source, entityRef);
    return leftRank - rightRank || left.source.localeCompare(right.source);
  });
}

function dashboardSourceRank(source: string, entityRef: CreativeEntityRef): number {
  if (entityRef.source && entityRef.source === source) return 0;
  if (source === 'neko-story') return 1;
  if (source === 'neko-entity') return 2;
  return 3;
}

function dashboardRefsForEntity(
  projectRoot: string,
  source: string,
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntityRef[] {
  const base = {
    source,
    entityId: entityRef.entityId,
    entityKind: entityRef.entityKind,
    projectRoot,
  } satisfies Omit<DashboardCreativeEntityRef, 'sourceEntityId'>;
  return [
    { ...base, sourceEntityId: `entity:${entityRef.entityId}` },
    { ...base, sourceEntityId: entityRef.entityId },
    { ...base, sourceEntityId: `candidate:${entityRef.entityKind}:${entityRef.entityId}` },
  ];
}

function parseCandidatePath(location: string | undefined): string | undefined {
  if (!location) return undefined;
  return parseCharacterEvidenceLocation(location)?.candidatePath;
}

function stripLocationSuffix(candidatePath: string): string {
  const parsed = parseCharacterEvidenceLocation(candidatePath);
  return parsed?.candidatePath ?? candidatePath;
}

function isSupportedCharacterEvidencePath(
  filePath: string,
  supportedExtensions: readonly string[],
): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return supportedExtensions.includes(extension);
}

function isPathInsideProject(projectRoot: string, filePath: string): boolean {
  const relative = path.relative(projectRoot, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeProjectRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function clampLine(line: number, totalLines: number): number {
  return Math.min(Math.max(1, line), Math.max(1, totalLines));
}

function readLineFromProjectSearchItem(
  item: ProjectSearchItem,
  field: 'line' | 'lineStart' | 'lineEnd',
): number | undefined {
  const value = readNumber(item.navigationData?.[field]) ?? readNumber(item.metadata?.[field]);
  if (value === undefined) return undefined;
  return value >= 0 ? Math.floor(value) + 1 : undefined;
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeEntityRefProjectRoot(
  entityRef: CreativeEntityRef,
  projectRoot: string,
): CreativeEntityRef {
  return {
    ...entityRef,
    projectRoot,
  };
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
