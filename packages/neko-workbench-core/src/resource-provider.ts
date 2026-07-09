import type {
  WorkbenchContributionOwner,
  WorkbenchDiagnostic,
  WorkbenchResourceNodeProjection,
  WorkbenchResourceRuntimeProjection,
  WorkbenchStableResourceRef,
} from './types';
import {
  WorkbenchContributionRegistrationError,
  assertPortableResourceNode,
  assertPortableResourceRef,
} from './registry';

export type WorkbenchResourceSurfaceId =
  | 'explorer'
  | 'assets'
  | 'generations'
  | 'market'
  | 'skills'
  | 'search'
  | 'custom';

export type WorkbenchResourceProviderKind =
  | 'domain-provider'
  | 'plugin-provider'
  | 'bootstrap-temporary';

export type WorkbenchWorkspaceFileKind =
  | 'directory'
  | 'image'
  | 'video'
  | 'audio'
  | 'model'
  | 'puppet'
  | 'canvas'
  | 'timeline'
  | 'audio-project'
  | 'sketch'
  | 'story'
  | 'document'
  | 'archive'
  | 'config'
  | 'unknown';

export interface WorkbenchResourceProviderMetadata {
  readonly providerId: string;
  readonly ownerId: string;
  readonly owner?: WorkbenchContributionOwner;
  readonly surfaceId: WorkbenchResourceSurfaceId;
  readonly providerKind: WorkbenchResourceProviderKind;
  readonly label?: string;
}

export interface WorkbenchWorkspaceTreeResourceNode {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly kind: WorkbenchWorkspaceFileKind;
  readonly stableRef: WorkbenchStableResourceRef;
  readonly runtimeProjections?: readonly WorkbenchResourceRuntimeProjection[];
  readonly children?: readonly WorkbenchWorkspaceTreeResourceNode[];
}

export interface WorkbenchResourceProviderSnapshot {
  readonly provider: WorkbenchResourceProviderMetadata;
  readonly nodes: readonly WorkbenchWorkspaceTreeResourceNode[];
  readonly resourceNodes?: readonly WorkbenchResourceNodeProjection[];
  readonly diagnostics: readonly WorkbenchDiagnostic[];
  readonly truncated: boolean;
}

export interface WorkbenchWorkspaceTreeResourceNodeInput {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly kind?: WorkbenchWorkspaceFileKind;
  readonly stableRef?: WorkbenchStableResourceRef;
  readonly runtimeProjections?: readonly WorkbenchResourceRuntimeProjection[];
  readonly children?: readonly WorkbenchWorkspaceTreeResourceNodeInput[];
}

export interface WorkbenchResourceRuntimeProjectionInput {
  readonly kind: WorkbenchResourceRuntimeProjection['kind'];
  readonly uri?: string;
  readonly descriptorId?: string;
}

export function createWorkspaceStableResourceRef(
  relativePath: string,
  source = 'workspace-files',
): WorkbenchStableResourceRef {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  return {
    kind: 'file',
    id: normalizedPath.length > 0 ? normalizedPath : '.',
    source,
  };
}

export function createWorkbenchResourceRuntimeProjection(
  input: WorkbenchResourceRuntimeProjectionInput,
): WorkbenchResourceRuntimeProjection {
  if (!input.uri && !input.descriptorId) {
    throw new Error('Workbench runtime projection requires a uri or descriptorId.');
  }
  return {
    kind: input.kind,
    ...(input.uri ? { uri: input.uri } : {}),
    ...(input.descriptorId ? { descriptorId: input.descriptorId } : {}),
    currentSessionOnly: true,
  };
}

export function createWorkbenchThumbnailRuntimeProjection(
  uri: string,
): WorkbenchResourceRuntimeProjection {
  if (uri.trim().length === 0) {
    throw new Error('Workbench thumbnail runtime projection uri is required.');
  }
  return createWorkbenchResourceRuntimeProjection({
    kind: 'thumbnail',
    uri,
  });
}

export function createWorkspaceTreeResourceNode(
  input: WorkbenchWorkspaceTreeResourceNodeInput,
): WorkbenchWorkspaceTreeResourceNode {
  const kind = input.kind ?? classifyWorkspaceResourceName(input.name);
  const stableRef = input.stableRef ?? createWorkspaceStableResourceRef(input.relativePath);
  const node: WorkbenchWorkspaceTreeResourceNode = {
    id: input.id,
    name: input.name,
    relativePath: normalizeWorkspaceRelativePath(input.relativePath),
    kind,
    stableRef,
    ...(input.runtimeProjections ? { runtimeProjections: input.runtimeProjections } : {}),
    ...(input.children
      ? { children: input.children.map((child) => createWorkspaceTreeResourceNode(child)) }
      : {}),
  };
  assertPortableWorkspaceTreeResourceNode(node);
  return node;
}

export function validateWorkbenchResourceProviderSnapshot(
  snapshot: WorkbenchResourceProviderSnapshot,
): void {
  if (snapshot.provider.providerId.trim().length === 0) {
    throw resourceProviderError('invalidProviderId', 'Resource provider id is required.', snapshot);
  }
  if (snapshot.provider.ownerId.trim().length === 0) {
    throw resourceProviderError('invalidProviderOwner', 'Resource provider owner id is required.', snapshot);
  }
  if (snapshot.provider.owner && snapshot.provider.owner.id !== snapshot.provider.ownerId) {
    throw resourceProviderError(
      'invalidProviderOwner',
      'Resource provider owner id must match owner metadata.',
      snapshot,
    );
  }
  for (const node of snapshot.nodes) {
    assertPortableWorkspaceTreeResourceNode(node);
  }
  for (const node of snapshot.resourceNodes ?? []) {
    assertPortableResourceNode(node);
  }
}

export function classifyWorkspaceResourceName(name: string): WorkbenchWorkspaceFileKind {
  const lowerName = name.toLowerCase();
  const extension = readLowercaseExtension(name);
  if (isLive2dPuppetFileName(lowerName)) return 'puppet';
  if (extension === '.nkc') return 'canvas';
  if (extension === '.nkv') return 'timeline';
  if (extension === '.nka') return 'audio-project';
  if (extension === '.nks') return 'sketch';
  if (extension === '.nkp' || extension === '.moc3') return 'puppet';
  if (extension === '.nkm') return 'model';
  if (extension === '.fountain' || extension === '.md' || extension === '.txt') return 'story';
  if (['.glb', '.gltf', '.fbx', '.obj'].includes(extension)) return 'model';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(extension)) return 'image';
  if (['.mp4', '.mov', '.m4v', '.webm', '.mkv'].includes(extension)) return 'video';
  if (['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'].includes(extension)) return 'audio';
  if (['.zip', '.7z', '.tar', '.gz'].includes(extension)) return 'archive';
  if (['.json', '.jsonl', '.toml', '.yaml', '.yml'].includes(extension)) return 'config';
  if (['.js', '.ts', '.tsx', '.html', '.css'].includes(extension)) return 'document';
  return 'unknown';
}

export function isWorkbenchWorkspaceMediaFileKind(kind: WorkbenchWorkspaceFileKind): boolean {
  return (
    kind === 'image' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'model' ||
    kind === 'puppet'
  );
}

export function readWorkspaceResourceThumbnailLabel(kind: WorkbenchWorkspaceFileKind): string {
  const labels: Readonly<Record<WorkbenchWorkspaceFileKind, string>> = {
    directory: 'DIR',
    image: 'IMG',
    video: 'VID',
    audio: 'AUD',
    model: '3D',
    puppet: 'PUP',
    canvas: 'NKC',
    timeline: 'NKV',
    'audio-project': 'NKA',
    sketch: 'NKS',
    story: 'TXT',
    document: 'DOC',
    archive: 'ZIP',
    config: 'CFG',
    unknown: 'FILE',
  };
  return labels[kind];
}

export function normalizeWorkspaceRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function assertPortableWorkspaceTreeResourceNode(
  node: WorkbenchWorkspaceTreeResourceNode,
): void {
  assertPortableResourceRef(node.stableRef);
  for (const child of node.children ?? []) {
    assertPortableWorkspaceTreeResourceNode(child);
  }
}

function resourceProviderError(
  code: string,
  message: string,
  snapshot: WorkbenchResourceProviderSnapshot,
): WorkbenchContributionRegistrationError {
  return new WorkbenchContributionRegistrationError({
    code,
    severity: 'error',
    message,
    ownerId: snapshot.provider.ownerId,
    contributionId: snapshot.provider.providerId,
    contributionKind: 'resource-source',
  });
}

function readLowercaseExtension(name: string): string {
  const index = name.lastIndexOf('.');
  if (index < 0) {
    return '';
  }
  return name.slice(index).toLowerCase();
}

function isLive2dPuppetFileName(lowerName: string): boolean {
  return (
    lowerName.endsWith('.model3.json') ||
    lowerName.endsWith('.physics3.json') ||
    lowerName.endsWith('.motion3.json') ||
    lowerName.endsWith('.exp3.json') ||
    lowerName.endsWith('.cdi3.json')
  );
}
