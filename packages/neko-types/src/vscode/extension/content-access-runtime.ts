import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { PathResolver } from '../../path';
import {
  resolveStorageLayout,
  type ContentAccessProvider,
  type ContentIngestProvider,
} from '../../types';
import {
  HostContentAccessService,
  HostContentIngestService,
  type ContentAccessLogger,
  type ContentAccessService,
  type ContentIngestGuardOptions,
  type ContentIngestService,
} from './content-access-service';
import {
  CacheArtifactContentIngestProvider,
  DocumentEntryContentAccessProvider,
  ExportStagingContentIngestProvider,
  GeneratedOutputContentIngestProvider,
  ImportSourceContentIngestProvider,
  RegisterExistingSourceContentIngestProvider,
  ResourceCacheContentAccessProvider,
  SourceFileContentAccessProvider,
  type ContentAccessFileOps,
  type ContentAccessWebviewResolver,
  type DocumentEntryContentAccessProviderOptions,
  type SourceFileContentAccessProviderOptions,
} from './content-access-providers';
import {
  createDefaultLocalResourceAccessService,
  type DefaultLocalResourceAccessServiceOptions,
  type LocalResourceAccessService,
  type LocalResourceRootProvider,
} from './local-resource-access';
import {
  VSCodeResourceCacheService,
  type ResourceCacheProvider,
  type ResourceCacheService,
  type VSCodeResourceCacheServiceOptions,
} from './resource-cache-service';

export interface HostContentAccessRuntime {
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly resourceCache?: ResourceCacheService;
  readonly contentAccess: ContentAccessService;
  readonly contentIngest: ContentIngestService;
  hasResourceCache(): boolean;
  registerAccessProvider(provider: ContentAccessProvider): void;
  registerIngestProvider(provider: ContentIngestProvider): void;
  registerResourceCacheProvider(provider: ResourceCacheProvider): void;
}

export interface HostContentAccessRuntimeCacheOptions {
  readonly cacheRoot?: string;
  readonly manifestPath?: string;
  readonly projectRoot?: string;
  readonly globalRoot?: string;
  readonly extensionPrivateRoot?: string;
  readonly providers?: readonly ResourceCacheProvider[];
  readonly fsOps?: VSCodeResourceCacheServiceOptions['fsOps'];
  readonly now?: VSCodeResourceCacheServiceOptions['now'];
  readonly maxConcurrentEnsures?: VSCodeResourceCacheServiceOptions['maxConcurrentEnsures'];
  readonly touchFlushIntervalMs?: VSCodeResourceCacheServiceOptions['touchFlushIntervalMs'];
  readonly clockMs?: VSCodeResourceCacheServiceOptions['clockMs'];
}

type ResolvedHostContentAccessRuntimeCacheOptions = HostContentAccessRuntimeCacheOptions &
  Required<Pick<HostContentAccessRuntimeCacheOptions, 'cacheRoot' | 'manifestPath'>>;

export interface HostContentAccessRuntimeSourceProviderOptions {
  readonly enabled?: boolean;
  readonly id?: string;
  readonly projectRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly engineSourceResolver?: SourceFileContentAccessProviderOptions['engineSourceResolver'];
}

export interface HostContentAccessRuntimeDocumentProviderOptions {
  readonly enabled?: boolean;
  readonly id?: string;
  readonly projectRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly fileOps?: Pick<ContentAccessFileOps, 'readFile'>;
  readonly entryReader?: DocumentEntryContentAccessProviderOptions['entryReader'];
}

export interface HostContentAccessRuntimeIngestProviderOptions {
  readonly enabled?: boolean;
  readonly pathResolver?: PathResolver;
  readonly projectRoot?: string;
  readonly fileOps?: ContentAccessFileOps;
  readonly includeImportSource?: boolean;
  readonly includeRegisterExistingSource?: boolean;
  readonly includeGeneratedOutput?: boolean;
  readonly includeExportStaging?: boolean;
  readonly includeCacheArtifact?: boolean;
  readonly guardOptions?: ContentIngestGuardOptions;
}

export interface CreateHostContentAccessRuntimeOptions {
  readonly extensionUri?: vscode.Uri;
  readonly context?: vscode.ExtensionContext;
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly localResourceAccessOptions?: Partial<DefaultLocalResourceAccessServiceOptions>;
  readonly extraLocalResourceRootProviders?: readonly LocalResourceRootProvider[];
  readonly resourceCache?: ResourceCacheService;
  readonly resourceCacheOptions?: HostContentAccessRuntimeCacheOptions;
  readonly accessProviders?: readonly ContentAccessProvider[];
  readonly ingestProviders?: readonly ContentIngestProvider[];
  readonly sourceFileProvider?: HostContentAccessRuntimeSourceProviderOptions;
  readonly documentEntryProvider?: HostContentAccessRuntimeDocumentProviderOptions;
  readonly ingest?: HostContentAccessRuntimeIngestProviderOptions;
  readonly webviewResolver?: ContentAccessWebviewResolver;
  readonly fileOps?: ContentAccessFileOps;
  readonly logger?: ContentAccessLogger;
}

export function createHostContentAccessRuntime(
  options: CreateHostContentAccessRuntimeOptions = {},
): HostContentAccessRuntime {
  const pathResolver = options.pathResolver ?? new PathResolver();
  const workspaceRoot = options.workspaceRoot;
  const localResourceAccess =
    options.localResourceAccess ?? createLocalResourceAccessIfConfigured(options);
  const resourceCache =
    options.resourceCache ??
    createResourceCacheIfConfigured(options, localResourceAccess, workspaceRoot);

  const contentAccess = new HostContentAccessService({ logger: options.logger });
  const contentIngest = new HostContentIngestService({
    logger: options.logger,
    guardOptions: options.ingest?.guardOptions ?? createDefaultIngestGuardOptions(options),
  });

  for (const provider of createDefaultAccessProviders({
    options,
    pathResolver,
    workspaceRoot,
    localResourceAccess,
    resourceCache,
  })) {
    contentAccess.registerProvider(provider);
  }
  for (const provider of options.accessProviders ?? []) {
    contentAccess.registerProvider(provider);
  }

  for (const provider of createDefaultIngestProviders({
    options,
    pathResolver,
    workspaceRoot,
    resourceCache,
  })) {
    contentIngest.registerProvider(provider);
  }
  for (const provider of options.ingestProviders ?? []) {
    contentIngest.registerProvider(provider);
  }

  return {
    ...(localResourceAccess ? { localResourceAccess } : {}),
    ...(resourceCache ? { resourceCache } : {}),
    contentAccess,
    contentIngest,
    hasResourceCache() {
      return resourceCache !== undefined;
    },
    registerAccessProvider(provider) {
      contentAccess.registerProvider(provider);
    },
    registerIngestProvider(provider) {
      contentIngest.registerProvider(provider);
    },
    registerResourceCacheProvider(provider) {
      if (!resourceCache) {
        throw new Error('Cannot register a resource cache provider without ResourceCacheService.');
      }
      resourceCache.registerProvider(provider);
    },
  };
}

function createLocalResourceAccessIfConfigured(
  options: CreateHostContentAccessRuntimeOptions,
): LocalResourceAccessService | undefined {
  if (!options.extensionUri) return undefined;
  return createDefaultLocalResourceAccessService({
    extensionUri: options.extensionUri,
    ...(options.context ? { context: options.context } : {}),
    ...(options.localResourceAccessOptions?.extensionAssetSegments
      ? { extensionAssetSegments: options.localResourceAccessOptions.extensionAssetSegments }
      : {}),
    ...(options.localResourceAccessOptions?.includeExtensionCache !== undefined
      ? { includeExtensionCache: options.localResourceAccessOptions.includeExtensionCache }
      : {}),
    ...(options.localResourceAccessOptions?.includeWorkspaceCache !== undefined
      ? { includeWorkspaceCache: options.localResourceAccessOptions.includeWorkspaceCache }
      : {}),
    extraRootProviders: [
      ...(options.localResourceAccessOptions?.extraRootProviders ?? []),
      ...(options.extraLocalResourceRootProviders ?? []),
    ],
    logger: options.localResourceAccessOptions?.logger ?? options.logger,
  });
}

function createResourceCacheIfConfigured(
  options: CreateHostContentAccessRuntimeOptions,
  localResourceAccess: LocalResourceAccessService | undefined,
  workspaceRoot: string | undefined,
): ResourceCacheService | undefined {
  const target = resolveResourceCacheTarget(options.resourceCacheOptions, workspaceRoot);
  if (!target || !localResourceAccess) return undefined;
  return new VSCodeResourceCacheService({
    cacheRoot: target.cacheRoot,
    manifestPath: target.manifestPath,
    ...(target.projectRoot ? { projectRoot: target.projectRoot } : {}),
    ...(target.globalRoot ? { globalRoot: target.globalRoot } : {}),
    ...(target.extensionPrivateRoot ? { extensionPrivateRoot: target.extensionPrivateRoot } : {}),
    localResourceAccess,
    providers: target.providers ?? [],
    ...(target.fsOps ? { fsOps: target.fsOps } : {}),
    ...(target.now ? { now: target.now } : {}),
    ...(target.maxConcurrentEnsures !== undefined
      ? { maxConcurrentEnsures: target.maxConcurrentEnsures }
      : {}),
    ...(target.touchFlushIntervalMs !== undefined
      ? { touchFlushIntervalMs: target.touchFlushIntervalMs }
      : {}),
    ...(target.clockMs ? { clockMs: target.clockMs } : {}),
    logger: options.logger,
  });
}

function resolveResourceCacheTarget(
  input: HostContentAccessRuntimeCacheOptions | undefined,
  workspaceRoot: string | undefined,
): ResolvedHostContentAccessRuntimeCacheOptions | undefined {
  if (input?.cacheRoot && input.manifestPath) {
    return {
      ...input,
      cacheRoot: input.cacheRoot,
      manifestPath: input.manifestPath,
    };
  }
  if (input?.cacheRoot || input?.manifestPath) {
    throw new Error('Resource cache options require both cacheRoot and manifestPath.');
  }
  if (!input || !workspaceRoot) return undefined;
  const layout = resolveStorageLayout(workspaceRoot, os.homedir() || workspaceRoot);
  return {
    ...input,
    cacheRoot: layout.project.local.cache.resources,
    manifestPath: layout.project.local.cache.resourceManifest,
    projectRoot: input.projectRoot ?? workspaceRoot,
  };
}

function createDefaultAccessProviders(input: {
  readonly options: CreateHostContentAccessRuntimeOptions;
  readonly pathResolver: PathResolver;
  readonly workspaceRoot?: string;
  readonly localResourceAccess?: LocalResourceAccessService;
  readonly resourceCache?: ResourceCacheService;
}): ContentAccessProvider[] {
  const providers: ContentAccessProvider[] = [];
  const { options, pathResolver, workspaceRoot, localResourceAccess, resourceCache } = input;

  if (resourceCache) {
    providers.push(
      new ResourceCacheContentAccessProvider({
        resourceCache,
        webviewResolver: options.webviewResolver,
        fileOps: options.fileOps,
      }),
    );
  }

  const documentProviderOptions = options.documentEntryProvider;
  const documentProjectRoot = documentProviderOptions?.projectRoot ?? workspaceRoot;
  if (documentProviderOptions?.enabled !== false && documentProjectRoot) {
    providers.push(
      new DocumentEntryContentAccessProvider({
        ...(documentProviderOptions?.id ? { id: documentProviderOptions.id } : {}),
        projectRoot: documentProjectRoot,
        pathResolver: documentProviderOptions?.pathResolver ?? pathResolver,
        ...(resourceCache ? { resourceCache } : {}),
        fileOps: documentProviderOptions?.fileOps ?? options.fileOps,
        webviewResolver: options.webviewResolver,
        ...(documentProviderOptions?.entryReader
          ? { entryReader: documentProviderOptions.entryReader }
          : {}),
      }),
    );
  }

  const sourceProviderOptions = options.sourceFileProvider;
  const sourceProjectRoot = sourceProviderOptions?.projectRoot ?? workspaceRoot;
  if (sourceProviderOptions?.enabled !== false && sourceProjectRoot) {
    providers.push(
      new SourceFileContentAccessProvider({
        ...(sourceProviderOptions?.id ? { id: sourceProviderOptions.id } : {}),
        projectRoot: sourceProjectRoot,
        pathResolver: sourceProviderOptions?.pathResolver ?? pathResolver,
        fileOps: sourceProviderOptions?.fileOps ?? options.fileOps,
        ...(localResourceAccess ? { localResourceAccess } : {}),
        webviewResolver: options.webviewResolver,
        ...(sourceProviderOptions?.engineSourceResolver
          ? { engineSourceResolver: sourceProviderOptions.engineSourceResolver }
          : {}),
      }),
    );
  }

  return providers;
}

function createDefaultIngestProviders(input: {
  readonly options: CreateHostContentAccessRuntimeOptions;
  readonly pathResolver: PathResolver;
  readonly workspaceRoot?: string;
  readonly resourceCache?: ResourceCacheService;
}): ContentIngestProvider[] {
  const providers: ContentIngestProvider[] = [];
  const ingest = input.options.ingest;
  if (ingest?.enabled === false) return providers;

  const projectRoot = ingest?.projectRoot ?? input.workspaceRoot;
  if (!projectRoot) return providers;
  const fileOps = ingest?.fileOps ?? input.options.fileOps;
  const pathResolver = ingest?.pathResolver ?? input.pathResolver;

  if (ingest?.includeImportSource !== false) {
    providers.push(new ImportSourceContentIngestProvider({ projectRoot, pathResolver, fileOps }));
  }
  if (ingest?.includeRegisterExistingSource !== false) {
    providers.push(
      new RegisterExistingSourceContentIngestProvider({ projectRoot, pathResolver, fileOps }),
    );
  }
  if (ingest?.includeGeneratedOutput !== false) {
    providers.push(
      new GeneratedOutputContentIngestProvider({ projectRoot, pathResolver, fileOps }),
    );
  }
  if (ingest?.includeExportStaging !== false) {
    providers.push(new ExportStagingContentIngestProvider({ projectRoot }));
  }
  if (input.resourceCache && ingest?.includeCacheArtifact !== false) {
    providers.push(new CacheArtifactContentIngestProvider({ resourceCache: input.resourceCache }));
  }

  return providers;
}

function createDefaultIngestGuardOptions(
  options: CreateHostContentAccessRuntimeOptions,
): ContentIngestGuardOptions {
  return {
    ...(options.workspaceRoot ? { projectRoot: options.workspaceRoot } : {}),
    ...(options.resourceCacheOptions?.globalRoot
      ? { globalRoot: options.resourceCacheOptions.globalRoot }
      : {}),
    ...(options.resourceCacheOptions?.extensionPrivateRoot
      ? { extensionPrivateRoot: options.resourceCacheOptions.extensionPrivateRoot }
      : {}),
  };
}

export function createWorkspaceResourceCacheOptions(
  workspaceRoot: string,
  homedir: string = os.homedir() || workspaceRoot,
): Required<
  Pick<HostContentAccessRuntimeCacheOptions, 'cacheRoot' | 'manifestPath' | 'projectRoot'>
> {
  const layout = resolveStorageLayout(workspaceRoot, homedir);
  return {
    cacheRoot: layout.project.local.cache.resources,
    manifestPath: layout.project.local.cache.resourceManifest,
    projectRoot: workspaceRoot,
  };
}

export function createExtensionPrivateResourceCacheOptions(
  context: vscode.ExtensionContext,
  ...segments: string[]
): Required<
  Pick<HostContentAccessRuntimeCacheOptions, 'cacheRoot' | 'manifestPath' | 'extensionPrivateRoot'>
> {
  const extensionPrivateRoot = context.globalStorageUri.fsPath;
  const cacheRoot = path.join(extensionPrivateRoot, ...segments);
  return {
    cacheRoot,
    manifestPath: path.join(cacheRoot, 'manifest.json'),
    extensionPrivateRoot,
  };
}
