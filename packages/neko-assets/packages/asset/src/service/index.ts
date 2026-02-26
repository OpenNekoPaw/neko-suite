/**
 * Service Layer Exports
 */

export { EntityService } from './EntityService';
export { VariantService } from './VariantService';
export { FileService, type FileServiceConfig, type MetadataExtractor } from './FileService';
export {
	AssetLibrary,
	type AssetLibraryConfig,
	type ImportOptions,
	type ImportResult,
	type ThumbnailGenerator,
	type ThumbnailGeneratorResult,
} from './AssetLibrary';
export {
	AssetDiffService,
	type IAssetDiffService,
	type IGitService,
	type IAIAnalysisService,
} from './AssetDiffService';
export {
	AssetRegistry,
	type AssetRegistryConfig,
	type AssetChangeListener,
} from './AssetRegistry';
export { generateEntityId, generateVariantId, generateFileId } from './utils';
