/**
 * Asset Library Service (Facade)
 *
 * Main entry point for the asset management system.
 * Coordinates entity, variant, file services and search functionality.
 */

import type {
	AssetEntity,
	AssetFile,
	AssetVariant,
	AssetQuery,
	CreateEntityInput,
	CreateVariantInput,
	EntityCategory,
	SearchResult,
	UpdateEntityInput,
	UpdateVariantInput,
	AddFileOptions,
	ClassificationResult,
	SuggestedEntity,
	MoveVariantInput,
	MoveVariantResult,
	MergeEntitiesInput,
	MergeEntitiesResult,
} from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import type { IAssetClassifier } from '../classifier/IClassifier';
import { EntityService } from './EntityService';
import { VariantService } from './VariantService';
import { FileService, type MetadataExtractor } from './FileService';

/**
 * Asset library configuration
 */
export interface AssetLibraryConfig {
	/** Storage implementation */
	storage: IAssetStorage;
	/** Optional AI classifier */
	classifier?: IAssetClassifier;
	/** Optional metadata extractor */
	metadataExtractor?: MetadataExtractor;
}

/**
 * Import options
 */
export interface ImportOptions {
	/** If provided, add to existing entity */
	entityId?: string;
	/** If provided with entityId, add to existing variant */
	variantId?: string;
	/** Options for creating new entity */
	entityInput?: CreateEntityInput;
	/** Options for creating new variant */
	variantInput?: CreateVariantInput;
	/** Options for the file */
	fileOptions?: AddFileOptions;
	/** Auto-classify the file */
	autoClassify?: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
	entity: AssetEntity;
	variant: AssetVariant;
	file: AssetFile;
	isNewEntity: boolean;
	isNewVariant: boolean;
	classification?: ClassificationResult;
}

/**
 * Asset Library - Main facade for asset management
 */
export class AssetLibrary {
	private storage: IAssetStorage;
	private entityService: EntityService;
	private variantService: VariantService;
	private fileService: FileService;
	private classifier?: IAssetClassifier;

	constructor(config: AssetLibraryConfig) {
		this.storage = config.storage;
		this.classifier = config.classifier;

		this.entityService = new EntityService(this.storage);
		this.variantService = new VariantService(this.storage);
		this.fileService = new FileService(this.storage, {
			metadataExtractor: config.metadataExtractor,
		});
	}

	// =========================================================================
	// Initialization
	// =========================================================================

	/**
	 * Initialize the library (load data from storage)
	 */
	async initialize(): Promise<void> {
		if (!this.storage.isInitialized()) {
			await this.storage.load();
		}
	}

	/**
	 * Flush pending changes to storage
	 */
	async flush(): Promise<void> {
		await this.storage.flush();
	}

	// =========================================================================
	// Entity Operations
	// =========================================================================

	/**
	 * Create a new entity
	 */
	async createEntity(input: CreateEntityInput): Promise<AssetEntity> {
		return this.entityService.create(input);
	}

	/**
	 * Get entity by ID
	 */
	async getEntity(id: string): Promise<AssetEntity | null> {
		return this.entityService.get(id);
	}

	/**
	 * Get all entities
	 */
	async getAllEntities(): Promise<AssetEntity[]> {
		return this.entityService.getAll();
	}

	/**
	 * Update an entity
	 */
	async updateEntity(id: string, updates: UpdateEntityInput): Promise<AssetEntity> {
		return this.entityService.update(id, updates);
	}

	/**
	 * Delete an entity
	 */
	async deleteEntity(id: string): Promise<boolean> {
		return this.entityService.delete(id);
	}

	/**
	 * Get entities by category
	 */
	async getByCategory(category: EntityCategory): Promise<AssetEntity[]> {
		return this.entityService.getByCategory(category);
	}

	/**
	 * Get entities by tags
	 */
	async getByTags(tags: string[]): Promise<AssetEntity[]> {
		return this.entityService.getByTags(tags);
	}

	/**
	 * Get recent entities
	 */
	async getRecent(limit?: number): Promise<AssetEntity[]> {
		return this.entityService.getRecent(limit);
	}

	/**
	 * Record usage of an entity
	 */
	async recordUsage(id: string): Promise<AssetEntity> {
		return this.entityService.recordUsage(id);
	}

	// =========================================================================
	// Variant Operations
	// =========================================================================

	/**
	 * Add a variant to an entity
	 */
	async addVariant(
		entityId: string,
		input: CreateVariantInput
	): Promise<AssetVariant> {
		return this.variantService.add(entityId, input);
	}

	/**
	 * Get a variant
	 */
	async getVariant(
		entityId: string,
		variantId: string
	): Promise<AssetVariant | null> {
		return this.variantService.get(entityId, variantId);
	}

	/**
	 * Update a variant
	 */
	async updateVariant(
		entityId: string,
		variantId: string,
		updates: UpdateVariantInput
	): Promise<AssetVariant> {
		return this.variantService.update(entityId, variantId, updates);
	}

	/**
	 * Delete a variant
	 */
	async deleteVariant(entityId: string, variantId: string): Promise<boolean> {
		return this.variantService.delete(entityId, variantId);
	}

	/**
	 * Move a variant from one entity to another
	 */
	async moveVariant(input: MoveVariantInput): Promise<MoveVariantResult> {
		return this.variantService.moveToEntity(input);
	}

	/**
	 * Merge two entities - moves all variants from source to target
	 */
	async mergeEntities(input: MergeEntitiesInput): Promise<MergeEntitiesResult> {
		return this.entityService.merge(input);
	}

	// =========================================================================
	// File Operations
	// =========================================================================

	/**
	 * Add a file to a variant
	 */
	async addFile(
		variantId: string,
		filePath: string,
		options?: AddFileOptions
	): Promise<AssetFile> {
		return this.fileService.add(variantId, filePath, options);
	}

	/**
	 * Remove a file
	 */
	async removeFile(variantId: string, fileId: string): Promise<boolean> {
		return this.fileService.remove(variantId, fileId);
	}

	// =========================================================================
	// Search Operations
	// =========================================================================

	/**
	 * Search entities
	 */
	async search(query: AssetQuery): Promise<SearchResult> {
		return this.storage.search(query);
	}

	/**
	 * Get all tags with counts
	 */
	async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
		return this.storage.getAllTags();
	}

	// =========================================================================
	// AI Classification
	// =========================================================================

	/**
	 * Classify a file using AI
	 */
	async classifyFile(filePath: string): Promise<ClassificationResult | null> {
		if (!this.classifier) {
			return null;
		}
		return this.classifier.analyze(filePath);
	}

	/**
	 * Find similar entities for a file
	 */
	async findSimilarEntities(filePath: string): Promise<SuggestedEntity[]> {
		if (!this.classifier) {
			return [];
		}
		return this.classifier.findSimilarEntities(filePath);
	}

	/**
	 * Suggest tags for a file
	 */
	async suggestTags(filePath: string): Promise<string[]> {
		if (!this.classifier) {
			return [];
		}
		return this.classifier.suggestTags(filePath);
	}

	// =========================================================================
	// Import
	// =========================================================================

	/**
	 * Import a file into the library
	 */
	async importFile(
		filePath: string,
		options?: ImportOptions
	): Promise<ImportResult> {
		let entity: AssetEntity;
		let variant: AssetVariant;
		let isNewEntity = false;
		let isNewVariant = false;
		let classification: ClassificationResult | undefined;

		// Auto-classify if requested and classifier available
		if (options?.autoClassify && this.classifier) {
			classification = await this.classifier.analyze(filePath);
		}

		// Extract file extension for auto-tagging
		const fileExtension = this.extractExtension(filePath);

		// Determine entity
		if (options?.entityId) {
			// Use existing entity
			const existingEntity = await this.entityService.get(options.entityId);
			if (!existingEntity) {
				throw new Error(`Entity not found: ${options.entityId}`);
			}
			entity = existingEntity;
		} else {
			// Create new entity with category-based tags
			const category = classification?.suggestedCategory ?? 'object';
			const categoryTags = this.getCategoryTags(category);
			const entityInput: CreateEntityInput = options?.entityInput ?? {
				name: classification?.suggestedName ?? this.extractName(filePath),
				category,
				description: classification?.description,
				tags: [...new Set([...(classification?.suggestedTags ?? []), ...categoryTags])],
			};
			entity = await this.entityService.create(entityInput);
			isNewEntity = true;
		}

		// Determine variant
		if (options?.variantId && !isNewEntity) {
			// Use existing variant
			const existingVariant = await this.variantService.get(
				entity.id,
				options.variantId
			);
			if (!existingVariant) {
				throw new Error(`Variant not found: ${options.variantId}`);
			}
			variant = existingVariant;
		} else {
			// Create new variant with file type tag
			const variantTags = fileExtension ? [fileExtension] : [];
			const variantInput: CreateVariantInput = options?.variantInput ?? {
				name:
					classification?.detectedAttributes?.view ??
					classification?.detectedAttributes?.expression ??
					'Default',
				attributes: classification?.detectedAttributes ?? {},
				tags: variantTags,
			};
			variant = await this.variantService.add(entity.id, variantInput);
			isNewVariant = true;
		}

		// Add file
		const file = await this.fileService.add(
			variant.id,
			filePath,
			options?.fileOptions
		);

		// Update thumbnail if this is the first file
		if (
			variant.files.length === 1 &&
			(file.mediaType === 'image' || file.mediaType === 'video')
		) {
			await this.variantService.update(entity.id, variant.id, {
				thumbnailFileId: file.id,
			});
		}

		// Re-fetch to get updated state
		entity = (await this.entityService.get(entity.id))!;
		variant = (await this.variantService.get(entity.id, variant.id))!;

		return {
			entity,
			variant,
			file,
			isNewEntity,
			isNewVariant,
			classification,
		};
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Extract name from file path
	 */
	private extractName(filePath: string): string {
		const parts = filePath.split(/[/\\]/);
		const fileName = parts[parts.length - 1] ?? filePath;
		// Remove extension
		return fileName.replace(/\.[^.]+$/, '');
	}

	/**
	 * Extract file extension (without dot, lowercase)
	 */
	private extractExtension(filePath: string): string {
		const parts = filePath.split(/[/\\]/);
		const fileName = parts[parts.length - 1] ?? filePath;
		const match = fileName.match(/\.([^.]+)$/);
		return match ? match[1].toLowerCase() : '';
	}

	/**
	 * Get category-based tags for entity
	 */
	private getCategoryTags(category: EntityCategory): string[] {
		const categoryTagMap: Record<EntityCategory, string[]> = {
			character: ['character'],
			environment: ['background', 'scene'],
			object: ['prop'],
			effect: ['effect', 'vfx'],
			audio: ['audio', 'sound'],
			text: ['text'],
			other: [],
		};
		return categoryTagMap[category] ?? [];
	}
}
