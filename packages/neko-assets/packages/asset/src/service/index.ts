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
} from './AssetLibrary';
export {
	AssetDiffService,
	type IAssetDiffService,
	type IGitService,
	type IAIAnalysisService,
} from './AssetDiffService';
export { generateEntityId, generateVariantId, generateFileId } from './utils';
