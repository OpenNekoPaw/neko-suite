import type { SupportedLocale } from '@neko/shared';
import type {
  DesktopSnapshot,
  EngineViewportSummary,
  ResourceSurfaceSnapshot,
  WorkspaceFileTreeSnapshot,
  WorkbenchSurface,
} from './contracts';

export interface DesktopSnapshotOptions {
  readonly workspaceRoot: string;
  readonly workspaceName?: string;
  readonly version?: string;
  readonly locale?: SupportedLocale;
  readonly resourceSurfaces?: readonly ResourceSurfaceSnapshot[];
  readonly workspaceTree?: WorkspaceFileTreeSnapshot;
  readonly viewport?: EngineViewportSummary;
}

export const DESKTOP_WORKBENCH_SURFACES: readonly WorkbenchSurface[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    role: 'project-resources',
    resourceSourceIds: ['project-files', 'project-scenes', 'project-timelines'],
  },
  {
    id: 'assets',
    label: 'Assets',
    role: 'domain-manager',
    resourceSourceIds: ['assets', 'media-library', 'entities'],
  },
  {
    id: 'generations',
    label: 'Generations',
    role: 'domain-manager',
    resourceSourceIds: ['generation-outputs', 'render-queue'],
  },
  {
    id: 'market',
    label: 'Market',
    role: 'catalog-manager',
    resourceSourceIds: ['provider-cards', 'packages'],
  },
  {
    id: 'skills',
    label: 'Skills',
    role: 'catalog-manager',
    resourceSourceIds: ['skills', 'agent-capabilities'],
  },
  {
    id: 'search',
    label: 'Search',
    role: 'search',
    resourceSourceIds: ['project-search'],
  },
];

export function createDesktopMvpSnapshot(options: DesktopSnapshotOptions): DesktopSnapshot {
  const viewport = options.viewport ?? createUnavailableEngineViewportSummary();
  return {
    host: {
      id: 'neko-desktop-electron',
      kind: 'electron',
      displayName: 'Neko Desktop',
      version: options.version ?? '0.0.1',
      locale: options.locale ?? 'en',
    },
    workspace: {
      name: options.workspaceName ?? 'Neko Workspace',
      root: options.workspaceRoot,
      trust: 'trusted',
    },
    surfaces: DESKTOP_WORKBENCH_SURFACES,
    resourceSurfaces: options.resourceSurfaces ?? createEmptyResourceSurfaces(),
    workspaceTree: options.workspaceTree ?? createEmptyWorkspaceTreeSnapshot(options.workspaceName),
    viewport,
  };
}

export function createEmptyWorkspaceTreeSnapshot(
  workspaceName = 'Neko Workspace',
): WorkspaceFileTreeSnapshot {
  return {
    rootName: workspaceName,
    rootRef: { kind: 'file', id: '.', source: 'workspace-files' },
    totalFileCount: 0,
    directoryCount: 0,
    mediaFileCount: 0,
    truncated: false,
    nodes: [],
  };
}

export function createUnavailableEngineViewportSummary(): EngineViewportSummary {
  return {
    id: 'engine-viewport-primary',
    owner: 'neko-engine',
    availability: 'unavailable',
    label: 'Engine Viewport',
    diagnostic:
      'neko-engine has not been probed by the desktop AppHost. Runtime snapshots must inject the current Engine health result.',
    capabilities: [
      'engine-owned-output-truth',
      'native-surface-target',
      'texture-lease-boundary',
      'color-managed-preview-contract',
      '10bit-hdr-follow-up',
    ],
    nonAuthoritativeWebSurfaces: ['html-video', 'canvas', 'webcodecs', 'electron-webcontents'],
  };
}

function createEmptyResourceSurfaces(): readonly ResourceSurfaceSnapshot[] {
  return [
    {
      surfaceId: 'explorer',
      title: 'Project Explorer',
      description: 'Project files, scenes, timelines, and documents.',
      nodes: [],
    },
    {
      surfaceId: 'assets',
      title: 'Assets',
      description: 'Asset library, media library, and entity-bound resources.',
      nodes: [],
    },
    {
      surfaceId: 'generations',
      title: 'Generations',
      description: 'AIGC outputs, task results, and render queue entries.',
      nodes: [],
    },
    {
      surfaceId: 'market',
      title: 'Market / Packages',
      description: 'Installable packages, providers, processors, and trusted market entries.',
      nodes: [],
    },
    {
      surfaceId: 'skills',
      title: 'Skills',
      description: 'Agent skills, activation state, diagnostics, and capability ownership.',
      nodes: [],
    },
    {
      surfaceId: 'search',
      title: 'Search',
      description: 'Cross-domain project search results.',
      nodes: [],
    },
  ];
}
