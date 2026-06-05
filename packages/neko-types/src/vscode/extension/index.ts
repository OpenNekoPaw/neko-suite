/**
 * VSCode Extension Host API Module
 *
 * Shared base classes and infrastructure for VSCode extension host providers.
 * Requires the vscode module (extension host context only).
 *
 * Import via: @neko/shared/vscode/extension
 *
 * NOTE: Do NOT re-export from @neko/shared/vscode/index.ts.
 * That module is for webview (browser) context.
 */
export { BaseOutlineProvider } from './baseOutlineProvider';
export type { IOutlineProvider } from './baseOutlineProvider';

// Logger (OutputChannel transport + log level config)
export {
  OutputChannelTransport,
  createVSCodeLogger,
  resolveLogLevelSetting,
  watchLogLevel,
} from './logger';

// Error reporter (showErrorMessage wrapper)
export { VSCodeErrorHandler } from './error-reporter';

// i18n bridge (locale detection + webview injection)
export { getVSCodeLocale, injectLocaleAttribute } from './i18n-bridge';

// Webview asset utilities (GeneratedAsset → webviewUri conversion)
export { toWebviewAsset } from './webview-asset';
export {
  VSCodeLocalResourceAccessService,
  createDefaultLocalResourceAccessService,
  createExtensionAssetLocalResourceRootProvider,
  createExtensionCacheLocalResourceRootProvider,
  createMediaLibraryLocalResourceRootProvider,
  createStaticLocalResourceRootProvider,
  createWorkspaceCacheLocalResourceRootProvider,
  createWorkspaceLocalResourceRootProvider,
  isRemoteUrl,
  normalizeLocalFilePath,
} from './local-resource-access';
export type {
  DefaultLocalResourceAccessServiceOptions,
  LocalResourceAccessLogger,
  LocalResourceAccessOptions,
  LocalResourceAccessService,
  LocalResourceProjectionOptions,
  LocalResourceProjectionResult,
  LocalResourceRoot,
  LocalResourceRootInput,
  LocalResourceRootKind,
  LocalResourceRootProvider,
  LocalResourceWebviewOptions,
  MediaLibraryLocalResourceRootProviderOptions,
} from './local-resource-access';

// Resource cache identity, materialization, manifest, and projection orchestration.
export {
  JsonResourceCacheManifestStore,
  VSCodeResourceCacheService,
  computeStats,
  resolveResourceCacheQuotaPolicy,
} from './resource-cache-service';
export type {
  JsonResourceCacheManifestStoreOptions,
  ResourceCacheFsOps,
  ResourceCacheGcResult,
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
  VSCodeResourceCacheServiceOptions,
} from './resource-cache-service';
export {
  GENERATED_RESOURCE_CACHE_PROVIDER_ID,
  GeneratedAssetResourceCacheProvider,
  PREVIEW_RESOURCE_CACHE_PROVIDER_ID,
  PreviewVariantResourceCacheProvider,
  THUMBNAIL_RESOURCE_CACHE_PROVIDER_ID,
  ThumbnailResourceCacheProvider,
  createFileThumbnailResourceRef,
  createGeneratedAssetResourceRef,
  createPreviewAssetResourceRef,
} from './resource-cache-providers';
export type {
  CreateFileThumbnailResourceRefInput,
  CreateGeneratedAssetResourceRefInput,
  CreatePreviewAssetResourceRefInput,
  GeneratedAssetResourceCacheProviderOptions,
  GeneratedAssetResourceResolverResult,
  PreviewVariantResourceApi,
  PreviewVariantResourceCacheProviderOptions,
  ResourceCacheFileOps,
  ThumbnailResourceCacheProviderOptions,
  ThumbnailResourceGenerator,
  ThumbnailResourceGeneratorResult,
} from './resource-cache-providers';
export {
  LEGACY_RESOURCE_CACHE_PROVIDER_ID,
  LegacyResourceCacheProvider,
  readLegacyCachePath,
} from './legacy-resource-cache-provider';
export type {
  LegacyResourceCacheFsOps,
  LegacyResourceCacheProviderOptions,
} from './legacy-resource-cache-provider';

// Intent-aware content read/write orchestration.
export { HostContentAccessService, HostContentIngestService } from './content-access-service';
export type {
  ContentAccessLogger,
  ContentAccessService,
  ContentAccessServiceOptions,
  ContentIngestGuardOptions,
  ContentIngestService,
  ContentIngestServiceOptions,
} from './content-access-service';
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
} from './content-access-providers';
export type {
  CacheArtifactContentIngestProviderOptions,
  ContentAccessFileOps,
  ContentAccessWebviewResolver,
  ContentIngestFileProviderOptions,
  DocumentEntryContentAccessProviderOptions,
  PreviewVariantContentAccessProviderOptions,
  ResourceCacheContentAccessProviderOptions,
  SourceFileContentAccessProviderOptions,
  VideoProxyContentAccessProviderOptions,
} from './content-access-providers';

// Character registry utilities (workspace characters.json read/write + lookup)
export {
  CharacterRegistryService,
  loadCharacterBindingsForNames,
  resolveCharacterBindingsForNames,
  resolveCharacterRegistryPath,
} from './character-registry';

// Creative entity facade + Git-tracked entity/asset binding storage
export {
  CharacterRecordAdapter,
  CreativeEntityRegistryService,
  DefaultAssetRefResolver,
  EntityAssetBindingService,
  EntityAssetRequirementService,
  RepresentationResolver,
  VisualIdentityDraftService,
  characterRecordToCreativeEntity,
  createEmptyEntityAssetBindingFile,
  createEmptyEntityAssetRequirementFile,
  createEmptyVisualIdentityDraftFile,
  resolveEntityAssetRequirementsPath,
  resolveEntityAssetBindingsPath,
  resolveVisualIdentityDraftsPath,
} from './creative-entity-composition';
export type {
  AssetRefBackendResolver,
  CreativeEntityAdapter,
  RepresentationResolverOptions,
} from './creative-entity-composition';

// New-file UX (unique name → write → reveal → rename)
export { createNewFile } from './create-new-file';
export type { CreateNewFileOptions, TemplateChoice } from './create-new-file';

// Command payload parsing helpers
export { isRecord, readNonEmptyString } from './command-args';

// Project snapshot package helper (Extension Host only, no Engine dependency)
export { createProjectSnapshotPackage } from './project-package';
export type { ProjectPackageRequest, ProjectPackageResult } from './project-package';

// Binary template generators for new-file templates
export {
  generateMinimalInp,
  generateHumanoidInp,
  generateMinimalGlb,
  generateDefaultCubeGlb,
  generateHumanoidGlb,
} from './templates';

// StatusBar group lifecycle manager
export {
  StatusBarGroup,
  StatusBarProjectionManager,
  getActiveCustomEditorId,
  getStatusBarActiveSurface,
  isStatusBarItemSpecVisible,
  sortStatusBarItemSpecs,
} from './StatusBarGroup';
export type {
  StatusBarActiveSurface,
  StatusBarItemConfig,
  StatusBarItemSpec,
  StatusBarProjectionManagerOptions,
} from './StatusBarGroup';

// Focused Webview keyboard routing
export { FocusedWebviewRegistry, createFocusedWebviewRegistry } from './focused-webview-registry';
export type {
  FocusedWebviewDisposable,
  FocusedWebviewPanelLike,
  FocusedWebviewPostTarget,
  FocusedWebviewRegistration,
  FocusedWebviewResolution,
  FocusedWebviewResolveRequest,
  IFocusedWebviewRegistry,
} from './focused-webview-registry';

// Cross-extension Webview keyboard ownership context
export {
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_CONTEXT,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_QUERY_COMMAND,
  NEKO_WEBVIEW_KEYBOARD_EDITABLE_UPDATE_COMMAND,
  hasWebviewKeyboardEditableOwner,
  isWebviewKeyboardEditableOwnerUpdate,
  updateWebviewKeyboardEditableOwner,
} from './webview-keyboard-context';
export type { WebviewKeyboardEditableOwnerUpdate } from './webview-keyboard-context';
