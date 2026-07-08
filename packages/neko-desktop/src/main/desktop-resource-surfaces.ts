import { access, readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  readMediaLibraryLocalSettings,
  readMediaLibrarySettings,
  resolveWorkspaceMediaLibraries,
} from '@neko/host';
import type {
  ResourceBadge,
  ResourceNode,
  ResourceNodeKind,
  ResourcePreviewDescriptor,
  ResourceSurfaceSnapshot,
  ResourceThumbnailDescriptor,
  WorkbenchSurfaceId,
} from '../shared/contracts';
import { normalizeRelativePath } from './workspace-scan';

const GENERATED_INDEX_PATH = ['neko', 'generated', 'index.json'] as const;
const ASSET_LIBRARY_PATH = ['neko', 'assets', 'library.json'] as const;
const CONTENT_SETTINGS_PATH = ['neko', 'settings.json'] as const;
const CONTENT_LOCAL_SETTINGS_PATH = ['.neko', 'settings.local.json'] as const;
const DASHBOARD_ACTIVITY_PATH = ['.neko', 'dashboard-activity.json'] as const;
const PROVIDER_CARDS_PATH = ['.neko', 'providers'] as const;
const WORKSPACE_SKILLS_PATH = ['.neko', 'skills'] as const;
const WORKSPACE_COMMANDS_PATH = ['.neko', 'commands'] as const;

export interface DesktopResourceSurfaceInput {
  readonly workspaceRoot: string;
}

interface SurfaceDescriptor {
  readonly surfaceId: WorkbenchSurfaceId;
  readonly title: string;
  readonly description: string;
}

const SURFACE_DESCRIPTORS: readonly SurfaceDescriptor[] = [
  {
    surfaceId: 'explorer',
    title: 'Project Explorer',
    description: 'Project files, scenes, timelines, and documents.',
  },
  {
    surfaceId: 'assets',
    title: 'Assets',
    description: 'Asset library, media library, and entity-bound resources.',
  },
  {
    surfaceId: 'generations',
    title: 'Generations',
    description: 'AIGC outputs, task results, and render queue entries.',
  },
  {
    surfaceId: 'market',
    title: 'Market / Packages',
    description: 'Installable packages, providers, processors, and trusted market entries.',
  },
  {
    surfaceId: 'skills',
    title: 'Skills',
    description: 'Agent skills, activation state, diagnostics, and capability ownership.',
  },
  {
    surfaceId: 'search',
    title: 'Search',
    description: 'Cross-domain project search results.',
  },
];

export async function createDesktopResourceSurfaces({
  workspaceRoot,
}: DesktopResourceSurfaceInput): Promise<readonly ResourceSurfaceSnapshot[]> {
  const [assetNodes, generationNodes, packageNodes, skillNodes] = await Promise.all([
    readAssetResourceNodes(workspaceRoot),
    readGenerationResourceNodes(workspaceRoot),
    readPackageResourceNodes(workspaceRoot),
    readSkillResourceNodes(workspaceRoot),
  ]);

  const nodesBySurface = new Map<WorkbenchSurfaceId, readonly ResourceNode[]>([
    ['explorer', []],
    ['assets', assetNodes],
    ['generations', generationNodes],
    ['market', packageNodes],
    ['skills', skillNodes],
    ['search', []],
  ]);

  return SURFACE_DESCRIPTORS.map((descriptor) => ({
    ...descriptor,
    nodes: nodesBySurface.get(descriptor.surfaceId) ?? [],
  }));
}

async function readAssetResourceNodes(workspaceRoot: string): Promise<readonly ResourceNode[]> {
  const [libraryJson, workspaceContent] = await Promise.all([
    readOptionalJson(join(workspaceRoot, ...ASSET_LIBRARY_PATH)),
    readWorkspaceContentSettings(workspaceRoot),
  ]);
  const nodes: ResourceNode[] = [];

  if (libraryJson !== undefined) {
    nodes.push(...projectAssetLibraryEntities(libraryJson, workspaceRoot));
  }

  nodes.push(
    ...workspaceContent.mediaLibraries.map(
      (library): ResourceNode => ({
        id: `media-library:${library.variable}`,
        sourceId: 'media-library',
        kind: 'asset',
        label: library.name,
        ref: {
          kind: 'asset',
          id: contractWorkspacePath(library.resolvedPath, workspaceRoot),
          source: 'media-library',
        },
        thumbnail: {
          kind: 'color',
          label: library.variable,
          accent: library.accessible ? '#22c55e' : '#94a3b8',
        },
        preview: {
          kind: 'document',
          summary: library.resolvedPath,
        },
        metadata: {
          status: library.accessible ? 'accessible' : 'missing',
          tags: [
            'media-library',
            library.variable,
            ...(library.overridden ? ['overridden'] : []),
          ],
        },
        badges: [
          {
            tone: library.accessible ? 'success' : 'warning',
            label: library.accessible ? 'Accessible' : 'Missing',
          },
        ],
        actions: [{ id: 'reveal-media-library', label: 'Reveal', risk: 'read' }],
      }),
    ),
  );

  return nodes;
}

async function readGenerationResourceNodes(workspaceRoot: string): Promise<readonly ResourceNode[]> {
  const [generatedIndex, dashboardActivity] = await Promise.all([
    readOptionalJson(join(workspaceRoot, ...GENERATED_INDEX_PATH)),
    readOptionalJson(join(workspaceRoot, ...DASHBOARD_ACTIVITY_PATH)),
  ]);
  return [
    ...(generatedIndex === undefined ? [] : projectGeneratedAssets(generatedIndex, workspaceRoot)),
    ...(dashboardActivity === undefined
      ? []
      : projectDashboardActivityEntries(dashboardActivity, workspaceRoot)),
  ];
}

async function readPackageResourceNodes(workspaceRoot: string): Promise<readonly ResourceNode[]> {
  const providerDirectory = join(workspaceRoot, ...PROVIDER_CARDS_PATH);
  if (!(await pathExists(providerDirectory))) {
    return [];
  }
  const entries = await readdir(providerDirectory, { withFileTypes: true });
  const nodes: ResourceNode[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.card.md')) {
      continue;
    }
    const filePath = join(providerDirectory, entry.name);
    const content = await readFile(filePath, 'utf8');
    const markdown = parseFrontmatterMarkdown(content, filePath);
    const providerId = readFrontmatterString(markdown.frontmatter, 'providerId') ?? entry.name;
    const capabilities = readFrontmatterList(markdown.frontmatter, 'capabilities');
    nodes.push({
      id: `provider-card:${providerId}`,
      sourceId: 'provider-cards',
      kind: 'package',
      label: providerId,
      ref: {
        kind: 'package',
        id: contractWorkspacePath(filePath, workspaceRoot),
        source: 'provider-cards',
      },
      thumbnail: { kind: 'color', label: 'PRV', accent: '#0f766e' },
      preview: {
        kind: 'package',
        summary: readMarkdownHeading(markdown.body) ?? contractWorkspacePath(filePath, workspaceRoot),
      },
      metadata: {
        status: 'configured',
        tags: ['provider-card', ...capabilities],
      },
      badges: [{ tone: 'info', label: 'Provider' }],
      actions: [{ id: 'open-provider-card', label: 'Open', risk: 'read' }],
    });
  }

  return nodes;
}

async function readSkillResourceNodes(workspaceRoot: string): Promise<readonly ResourceNode[]> {
  const [skillNodes, commandNodes] = await Promise.all([
    readWorkspaceSkillNodes(workspaceRoot),
    readWorkspaceCommandNodes(workspaceRoot),
  ]);
  return [...skillNodes, ...commandNodes];
}

async function readWorkspaceSkillNodes(workspaceRoot: string): Promise<readonly ResourceNode[]> {
  const skillsDirectory = join(workspaceRoot, ...WORKSPACE_SKILLS_PATH);
  if (!(await pathExists(skillsDirectory))) {
    return [];
  }
  const entries = await readdir(skillsDirectory, { withFileTypes: true });
  const nodes: ResourceNode[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillFile = join(skillsDirectory, entry.name, 'SKILL.md');
    if (!(await pathExists(skillFile))) {
      continue;
    }
    const content = await readFile(skillFile, 'utf8');
    const markdown = parseFrontmatterMarkdown(content, skillFile);
    const skillName = readFrontmatterString(markdown.frontmatter, 'name') ?? entry.name;
    const description = readFrontmatterString(markdown.frontmatter, 'description');
    const enabled = readFrontmatterBoolean(markdown.frontmatter, 'enabled') ?? true;
    nodes.push(createSkillNode({
      id: `skill:${skillName}`,
      sourceId: 'skills',
      label: skillName,
      description: description ?? readMarkdownHeading(markdown.body) ?? contractWorkspacePath(skillFile, workspaceRoot),
      filePath: skillFile,
      workspaceRoot,
      tags: ['skill'],
      enabled,
    }));
  }

  return nodes;
}

async function readWorkspaceCommandNodes(workspaceRoot: string): Promise<readonly ResourceNode[]> {
  const commandsDirectory = join(workspaceRoot, ...WORKSPACE_COMMANDS_PATH);
  if (!(await pathExists(commandsDirectory))) {
    return [];
  }
  const entries = await readdir(commandsDirectory, { withFileTypes: true });
  const nodes: ResourceNode[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name) !== '.md') {
      continue;
    }
    const commandFile = join(commandsDirectory, entry.name);
    const content = await readFile(commandFile, 'utf8');
    const markdown = parseFrontmatterMarkdown(content, commandFile, { allowMissing: true });
    const fallbackName = basename(entry.name, '.md');
    const commandName =
      readFrontmatterString(markdown.frontmatter, 'command') ??
      readFrontmatterString(markdown.frontmatter, 'name') ??
      fallbackName;
    const description =
      readFrontmatterString(markdown.frontmatter, 'description') ??
      readMarkdownHeading(markdown.body) ??
      contractWorkspacePath(commandFile, workspaceRoot);
    nodes.push(createSkillNode({
      id: `command:${commandName}`,
      sourceId: 'agent-capabilities',
      label: commandName.startsWith('/') ? commandName : `/${commandName}`,
      description,
      filePath: commandFile,
      workspaceRoot,
      tags: ['command-artifact'],
      enabled: readFrontmatterBoolean(markdown.frontmatter, 'enabled') ?? true,
    }));
  }

  return nodes;
}

function createSkillNode(input: {
  readonly id: string;
  readonly sourceId: string;
  readonly label: string;
  readonly description: string;
  readonly filePath: string;
  readonly workspaceRoot: string;
  readonly tags: readonly string[];
  readonly enabled: boolean;
}): ResourceNode {
  return {
    id: input.id,
    sourceId: input.sourceId,
    kind: 'skill',
    label: input.label,
    ref: {
      kind: 'skill',
      id: contractWorkspacePath(input.filePath, input.workspaceRoot),
      source: input.sourceId,
    },
    thumbnail: { kind: 'color', label: input.sourceId === 'agent-capabilities' ? 'CMD' : 'SKL', accent: '#64748b' },
    preview: { kind: 'skill', summary: input.description },
    metadata: {
      status: input.enabled ? 'enabled' : 'disabled',
      tags: [...input.tags],
    },
    badges: [
      {
        tone: input.enabled ? 'success' : 'neutral',
        label: input.enabled ? 'Enabled' : 'Disabled',
      },
    ],
    actions: [{ id: 'open-skill-artifact', label: 'Open', risk: 'read' }],
  };
}

async function readWorkspaceContentSettings(workspaceRoot: string): Promise<{
  readonly mediaLibraries: readonly {
    readonly name: string;
    readonly resolvedPath: string;
    readonly originalPath: string;
    readonly variable: string;
    readonly enabled: boolean;
    readonly overridden: boolean;
    readonly accessible: boolean;
  }[];
}> {
  const settingsPath = join(workspaceRoot, ...CONTENT_SETTINGS_PATH);
  const localSettingsPath = join(workspaceRoot, ...CONTENT_LOCAL_SETTINGS_PATH);
  const settings = readMediaLibrarySettings(
    await readOptionalJson(settingsPath),
    contractWorkspacePath(settingsPath, workspaceRoot),
  );
  const localSettings = readMediaLibraryLocalSettings(
    await readOptionalJson(localSettingsPath),
    contractWorkspacePath(localSettingsPath, workspaceRoot),
  );
  const mediaLibraries = await resolveWorkspaceMediaLibraries({
    settings,
    localSettings,
    workspaceRoot,
    resolvePath: (source) => resolveWorkspaceConfiguredPath(source, workspaceRoot),
    checkAccessible: async (absolutePath) => {
      try {
        const fileStat = await stat(absolutePath);
        return fileStat.isDirectory();
      } catch (_error: unknown) {
        return false;
      }
    },
  });
  return { mediaLibraries };
}

function projectAssetLibraryEntities(value: unknown, workspaceRoot: string): readonly ResourceNode[] {
  const root = assertRecord(value, contractWorkspacePath(join(workspaceRoot, ...ASSET_LIBRARY_PATH), workspaceRoot));
  const entities = root['entities'];
  if (entities === undefined) {
    return [];
  }
  if (!Array.isArray(entities)) {
    throw new Error('neko/assets/library.json entities must be an array.');
  }
  return entities.map((entry, index) => projectAssetLibraryEntity(entry, index, workspaceRoot));
}

function projectAssetLibraryEntity(
  value: unknown,
  index: number,
  workspaceRoot: string,
): ResourceNode {
  const entity = assertRecord(value, `neko/assets/library.json entities[${index}]`);
  const id = readRequiredString(entity, 'id', `neko/assets/library.json entities[${index}]`);
  const name = readRequiredString(entity, 'name', `neko/assets/library.json entities[${index}]`);
  const category = readOptionalString(entity, 'category') ?? 'asset';
  const description = readOptionalString(entity, 'description') ?? name;
  const tags = readStringArray(entity['tags']);
  const defaultFile = readFirstEntityFile(entity);
  return {
    id: `asset-library:${id}`,
    sourceId: category === 'entity' ? 'entities' : 'assets',
    kind: readAssetNodeKind(category),
    label: name,
    ref: {
      kind: readAssetNodeKind(category),
      id,
      source: category === 'entity' ? 'entities' : 'assets',
    },
    thumbnail: {
      kind: 'color',
      label: readThumbnailLabel(category),
      accent: readAssetAccent(category),
    },
    preview: {
      kind: readPreviewKind(defaultFile?.mediaType ?? category),
      summary: defaultFile?.path ?? description,
    },
    metadata: {
      mediaType: defaultFile?.mediaType,
      status: defaultFile?.status,
      tags: tags.length > 0 ? tags : [category],
    },
    badges: [{ tone: 'info', label: category }],
    actions: [{ id: 'open-asset', label: 'Open', risk: 'read' }],
  };
}

function projectGeneratedAssets(value: unknown, workspaceRoot: string): readonly ResourceNode[] {
  const root = assertRecord(value, contractWorkspacePath(join(workspaceRoot, ...GENERATED_INDEX_PATH), workspaceRoot));
  const assets = root['assets'];
  if (assets === undefined) {
    return [];
  }
  if (!Array.isArray(assets)) {
    throw new Error('neko/generated/index.json assets must be an array.');
  }
  return assets.map((asset, index) => projectGeneratedAsset(asset, index, workspaceRoot));
}

function projectGeneratedAsset(value: unknown, index: number, workspaceRoot: string): ResourceNode {
  const asset = assertRecord(value, `neko/generated/index.json assets[${index}]`);
  const id = readRequiredString(asset, 'id', `neko/generated/index.json assets[${index}]`);
  const path = readRequiredString(asset, 'path', `neko/generated/index.json assets[${index}]`);
  const mimeType = readOptionalString(asset, 'mimeType');
  const prompt = readOptionalString(asset, 'prompt');
  const width = readOptionalNumber(asset, 'width');
  const height = readOptionalNumber(asset, 'height');
  const model = readOptionalString(asset, 'model');
  const contractedPath = contractWorkspacePath(path, workspaceRoot);
  return {
    id: `generated:${id}`,
    sourceId: 'generation-outputs',
    kind: 'generation',
    label: basename(path),
    ref: {
      kind: 'generation',
      id: contractedPath,
      source: 'generation-outputs',
    },
    thumbnail: {
      kind: 'color',
      label: readGeneratedThumbnailLabel(mimeType),
      accent: '#06b6d4',
    },
    preview: {
      kind: readPreviewKind(mimeType ?? 'image'),
      summary: prompt ?? contractedPath,
    },
    metadata: {
      mediaType: mimeType,
      dimensions: width && height ? `${width}x${height}` : undefined,
      status: 'generated',
      tags: ['generated', ...(model ? [model] : [])],
    },
    badges: [{ tone: 'success', label: 'Generated' }],
    actions: [{ id: 'open-generated-asset', label: 'Open', risk: 'read' }],
  };
}

function projectDashboardActivityEntries(
  value: unknown,
  workspaceRoot: string,
): readonly ResourceNode[] {
  const root = assertRecord(value, contractWorkspacePath(join(workspaceRoot, ...DASHBOARD_ACTIVITY_PATH), workspaceRoot));
  const entries = root['entries'];
  if (entries === undefined) {
    return [];
  }
  if (!Array.isArray(entries)) {
    throw new Error('.neko/dashboard-activity.json entries must be an array.');
  }
  return entries.map((entry, index) => projectDashboardActivityEntry(entry, index));
}

function projectDashboardActivityEntry(value: unknown, index: number): ResourceNode {
  const entry = assertRecord(value, `.neko/dashboard-activity.json entries[${index}]`);
  const taskId = readRequiredString(entry, 'taskId', `.neko/dashboard-activity.json entries[${index}]`);
  const title = readOptionalString(entry, 'title') ?? taskId;
  const source = readOptionalString(entry, 'source') ?? 'dashboard';
  const status = readOptionalString(entry, 'status') ?? 'unknown';
  const outputs = Array.isArray(entry['outputs']) ? entry['outputs'].length : 0;
  return {
    id: `dashboard-activity:${taskId}`,
    sourceId: 'render-queue',
    kind: 'generation',
    label: title,
    ref: {
      kind: 'generation',
      id: taskId,
      source: 'render-queue',
    },
    thumbnail: { kind: 'color', label: 'RUN', accent: '#8b5cf6' },
    preview: {
      kind: 'document',
      summary: outputs > 0 ? `${outputs} outputs` : source,
    },
    metadata: { status, tags: ['dashboard-activity', source] },
    badges: [{ tone: status === 'done' ? 'success' : 'info', label: status }],
    actions: [{ id: 'open-dashboard-activity', label: 'Open', risk: 'read' }],
  };
}

async function readOptionalJson(filePath: string): Promise<unknown | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as unknown;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (_error: unknown) {
    return false;
  }
}

function resolveWorkspaceConfiguredPath(source: string, workspaceRoot: string): string {
  const withWorkspace = source
    .replaceAll('${A}', workspaceRoot)
    .replaceAll('${WORKSPACE}', workspaceRoot)
    .replaceAll('${PROJECT}', workspaceRoot);
  return isAbsolute(withWorkspace) ? withWorkspace : resolve(workspaceRoot, withWorkspace);
}

function contractWorkspacePath(filePath: string, workspaceRoot: string): string {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(workspaceRoot, filePath);
  const relativePath = relative(workspaceRoot, absolutePath);
  if (
    relativePath.length === 0 ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  ) {
    return normalizeRelativePath(relativePath);
  }
  return absolutePath;
}

function parseFrontmatterMarkdown(
  content: string,
  filePath: string,
  options: { readonly allowMissing?: boolean } = {},
): { readonly frontmatter: ReadonlyMap<string, string>; readonly body: string } {
  if (!content.startsWith('---\n')) {
    if (options.allowMissing) {
      return { frontmatter: new Map(), body: content };
    }
    throw new Error(`Markdown frontmatter is required: ${filePath}`);
  }
  const endIndex = content.indexOf('\n---', 4);
  if (endIndex < 0) {
    throw new Error(`Markdown frontmatter is not closed: ${filePath}`);
  }
  return {
    frontmatter: parseSimpleFrontmatter(content.slice(4, endIndex), filePath),
    body: content.slice(endIndex + 4).trim(),
  };
}

function parseSimpleFrontmatter(content: string, filePath: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Unsupported frontmatter line in ${filePath}: ${rawLine}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result.set(key, stripQuotes(value));
  }
  return result;
}

function readFrontmatterString(
  frontmatter: ReadonlyMap<string, string>,
  key: string,
): string | undefined {
  const value = frontmatter.get(key)?.trim();
  return value && !value.startsWith('[') ? stripQuotes(value) : undefined;
}

function readFrontmatterBoolean(
  frontmatter: ReadonlyMap<string, string>,
  key: string,
): boolean | undefined {
  const value = frontmatter.get(key);
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} frontmatter value must be boolean.`);
}

function readFrontmatterList(
  frontmatter: ReadonlyMap<string, string>,
  key: string,
): readonly string[] {
  const value = frontmatter.get(key);
  if (!value) {
    return [];
  }
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return [stripQuotes(value)];
  }
  return value
    .slice(1, -1)
    .split(',')
    .map((item) => stripQuotes(item.trim()))
    .filter((item) => item.length > 0);
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readMarkdownHeading(body: string): string | undefined {
  return body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '))
    ?.slice(2)
    .trim();
}

function assertRecord(value: unknown, sourceLabel: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${sourceLabel} must be a JSON object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function readRequiredString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  sourceLabel: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${sourceLabel}.${key} must be a non-empty string.`);
  }
  return value;
}

function readOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readOptionalNumber(
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function readFirstEntityFile(
  entity: Readonly<Record<string, unknown>>,
): { readonly path: string; readonly mediaType?: string; readonly status?: string } | undefined {
  const variants = entity['variants'];
  if (!Array.isArray(variants)) {
    return undefined;
  }
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
      continue;
    }
    const files = (variant as Readonly<Record<string, unknown>>)['files'];
    if (!Array.isArray(files)) {
      continue;
    }
    for (const file of files) {
      if (!file || typeof file !== 'object' || Array.isArray(file)) {
        continue;
      }
      const record = file as Readonly<Record<string, unknown>>;
      const path = readOptionalString(record, 'path');
      if (!path) {
        continue;
      }
      return {
        path,
        mediaType: readOptionalString(record, 'mediaType'),
        status: readOptionalString(record, 'status'),
      };
    }
  }
  return undefined;
}

function readAssetNodeKind(category: string): ResourceNodeKind {
  return category === 'entity' ? 'entity' : 'asset';
}

function readPreviewKind(source: string): ResourcePreviewDescriptor['kind'] {
  if (source.includes('image')) return 'image';
  if (source.includes('video')) return 'video';
  if (source.includes('audio')) return 'audio';
  if (source.includes('model') || source.includes('scene')) return 'scene';
  if (source.includes('skill')) return 'skill';
  if (source.includes('package')) return 'package';
  return 'document';
}

function readThumbnailLabel(source: string): string {
  if (source.includes('document')) return 'DOC';
  if (source.includes('image')) return 'IMG';
  if (source.includes('audio')) return 'AUD';
  if (source.includes('video')) return 'VID';
  if (source.includes('character')) return 'CHR';
  return 'AST';
}

function readGeneratedThumbnailLabel(mimeType: string | undefined): string {
  if (mimeType?.includes('video')) return 'VID';
  if (mimeType?.includes('audio')) return 'AUD';
  return 'IMG';
}

function readAssetAccent(category: string): string {
  if (category.includes('document')) return '#64748b';
  if (category.includes('image')) return '#06b6d4';
  if (category.includes('audio')) return '#22c55e';
  if (category.includes('video')) return '#3b82f6';
  if (category.includes('character')) return '#db2777';
  return '#64748b';
}
