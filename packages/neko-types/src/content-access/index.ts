export { HostContentAccessService, HostContentIngestService } from '../vscode/extension/content-access-service';
export type {
  ContentAccessLogger,
  ContentAccessService,
  ContentAccessServiceOptions,
  ContentIngestGuardOptions,
  ContentIngestService,
  ContentIngestServiceOptions,
} from '../vscode/extension/content-access-service';

export {
  CacheArtifactContentIngestProvider,
  DocumentEntryContentAccessProvider,
  ExportStagingContentIngestProvider,
  GeneratedOutputContentIngestProvider,
  ImportSourceContentIngestProvider,
  PreviewVariantContentAccessProvider,
  RegisterExistingSourceContentIngestProvider,
  ResourceCacheContentAccessProvider,
  SourceFileContentAccessProvider,
  VideoProxyContentAccessProvider,
} from '../vscode/extension/content-access-providers';
export type {
  CacheArtifactContentIngestProviderOptions,
  ContentAccessFileOps,
  ContentAccessFileExists,
  ContentAccessWebviewResolver,
  ContentIngestFileProviderOptions,
  DocumentEntryContentAccessProviderOptions,
  PreviewVariantContentAccessProviderOptions,
  ResourceCacheContentAccessProviderOptions,
  SourceFileContentAccessProviderOptions,
  VideoProxyContentAccessProviderOptions,
} from '../vscode/extension/content-access-providers';

export {
  JsonResourceCacheManifestStore,
  VSCodeResourceCacheService as HostResourceCacheService,
  VSCodeResourceCacheService,
  computeStats,
  resolveResourceCacheQuotaPolicy,
} from '../vscode/extension/resource-cache-service';
export type {
  JsonResourceCacheManifestStoreOptions,
  ResourceCacheFsOps,
  ResourceCacheGcResult,
  ResourceCacheLookupResult,
  ResourceCacheLogger,
  ResourceCacheManifestLoadOptions,
  ResourceCacheManifestStore,
  ResourceCacheOperationOptions,
  ResourceCacheOperationResult,
  ResourceCacheProjectOptions,
  ResourceCacheProjectResult,
  ResourceCacheProvider,
  ResourceCacheService,
  ResourceEnsureInput,
  ResourceEnsureResult,
  ResourceProbeResult,
  VSCodeResourceCacheServiceOptions as HostResourceCacheServiceOptions,
  VSCodeResourceCacheServiceOptions,
} from '../vscode/extension/resource-cache-service';

export {
  DOCUMENT_RESOURCE_CACHE_PROVIDER_ID,
  DocumentResourceCacheProvider,
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
} from '../vscode/extension/document-resource-cache-provider';
export type {
  CreateDocumentResourceRefInput,
  DocumentEntryReader,
  DocumentResourceCacheFsOps,
  DocumentResourceCacheProviderOptions,
} from '../vscode/extension/document-resource-cache-provider';
