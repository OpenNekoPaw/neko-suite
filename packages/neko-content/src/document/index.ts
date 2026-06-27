export {
  createDocumentAccessService,
  createManifestBatchCursor,
  detectDocumentFormat,
  DocumentAccessError,
  DocumentAccessService,
  DEFAULT_DOCUMENT_BATCH_MAX_CHARS,
  type DocumentAccessErrorCode,
  type DocumentAccessServiceDeps,
  type DocumentLowLevelAccess,
  type IDocumentAccessService,
} from './document-access-service';

export {
  DocumentReaderRuntime,
  createDocumentReaderRuntime,
  estimateSlideCount,
  isDocumentUrl,
  isSupportedDocumentPath,
  stripHtmlToText,
  type DocumentContent,
  type DocumentReaderLogger,
  type DocumentReaderRuntimeDeps,
  type IDocumentReader,
} from './document-reader';

export {
  imageMetadataProbe,
  probeImageMetadata,
  type ImageMetadata,
  type ImageMetadataProbe,
} from './image-metadata';

export {
  DocumentContentAccessRuntime,
  type DocumentContentAccessInput,
  type DocumentContentAccessMode,
  type DocumentContentAccessResult,
  type DocumentContentAccessRuntimeDeps,
  type DocumentImageAccessResource,
  type DocumentImagesAccessInput,
  type DocumentImagesAccessResult,
} from './content-access-document-runtime';

export {
  createDocumentEntryVariantFromMetadata,
  createManagedDocumentResourceRef,
  formatDocumentAliasScope,
  formatDocumentImageAlias,
  formatDocumentSourceId,
  projectDocumentResourceRefsInValue,
  readDocumentArchiveResourceProjection,
  readDocumentResourceDisplayId,
  type DocumentResourceProjection,
  type DocumentResourceProjectionProjector,
} from './document-resource-projection';
