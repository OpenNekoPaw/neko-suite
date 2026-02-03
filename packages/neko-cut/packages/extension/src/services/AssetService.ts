/**
 * Asset Service
 *
 * Extension Host 层的素材管理服务，桥接 @neko/asset 和 Webview。
 * 负责：
 * - 素材库初始化和持久化
 * - 处理来自 Webview 的素材操作请求
 * - 协调 AI 分类（通过 Platform）
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
	AssetLibrary,
	JsonFileStorage,
	InMemoryStorage,
	RuleClassifier,
	type IAssetStorage,
	type IFileSystem,
} from '@neko/asset';
import type {
	AssetEntity,
	AssetVariant,
	AssetFile,
	AssetQuery,
	SearchResult,
	CreateEntityInput,
	UpdateEntityInput,
	CreateVariantInput,
	UpdateVariantInput,
	AddFileOptions,
	ClassificationResult,
	EntityCategory,
	MoveVariantInput,
	MoveVariantResult,
	MergeEntitiesInput,
	MergeEntitiesResult,
	VariantComparisonResult,
	AttributeDiff,
	VariantAttributes,
	AssetDiffResult,
	AssetChangeAnalysis,
} from '@neko/shared';
import { ImageDiffAnalyzer } from '../media-diff/services/analyzers/ImageDiffAnalyzer';
import { createServiceId } from '../base';

// =============================================================================
// Service Identifier
// =============================================================================

export const IAssetService = createServiceId<AssetService>('assetService');

// =============================================================================
// Types
// =============================================================================

export interface AssetServiceConfig {
	/** Storage directory path (for JsonFileStorage) */
	storagePath?: string;
	/** Use in-memory storage (for testing) */
	useInMemory?: boolean;
}

export interface ImportOptions {
	entityId?: string;
	variantId?: string;
	entityInput?: CreateEntityInput;
	variantInput?: CreateVariantInput;
	fileOptions?: AddFileOptions;
	autoClassify?: boolean;
}

export interface ImportResult {
	entity: AssetEntity;
	variant: AssetVariant;
	file: AssetFile;
	isNewEntity: boolean;
	isNewVariant: boolean;
	classification?: ClassificationResult;
}

// =============================================================================
// Node.js File System Adapter
// =============================================================================

/**
 * Node.js file system implementation for JsonFileStorage
 */
const nodeFileSystem: IFileSystem = {
	async readFile(filePath: string): Promise<string> {
		return fs.readFile(filePath, 'utf-8');
	},

	async writeFile(filePath: string, content: string): Promise<void> {
		// Ensure directory exists
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(filePath, content, 'utf-8');
	},

	async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	},

	async mkdir(dirPath: string): Promise<void> {
		await fs.mkdir(dirPath, { recursive: true });
	},
};

// =============================================================================
// Asset Service
// =============================================================================

export class AssetService implements vscode.Disposable {
	private library: AssetLibrary | null = null;
	private storage: IAssetStorage | null = null;
	private initialized = false;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly config: AssetServiceConfig = {}) {}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Initialize the asset service
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// Create storage
		if (this.config.useInMemory) {
			this.storage = new InMemoryStorage();
		} else {
			const storagePath = this.config.storagePath ?? this.getDefaultStoragePath();
			const filePath = path.join(storagePath, 'library.json');
			this.storage = new JsonFileStorage({
				filePath,
				fs: nodeFileSystem,
				autoSaveDelay: 1000,
			});
		}

		// Create library with rule-based classifier and metadata extractor
		this.library = new AssetLibrary({
			storage: this.storage,
			classifier: new RuleClassifier(),
			metadataExtractor: this.extractMetadata.bind(this),
		});

		await this.library.initialize();
		this.initialized = true;
	}

	/**
	 * Get default storage path
	 */
	private getDefaultStoragePath(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			return path.join(workspaceFolders[0].uri.fsPath, '.neko', 'assets');
		}
		// Fallback to global storage
		return path.join(process.env.HOME ?? '/tmp', '.neko', 'assets');
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.disposables.forEach((d) => d.dispose());
		this.library = null;
		this.storage = null;
		this.initialized = false;
	}

	// =========================================================================
	// Entity Operations
	// =========================================================================

	/**
	 * Create a new entity
	 */
	async createEntity(input: CreateEntityInput): Promise<AssetEntity> {
		this.ensureInitialized();
		return this.library!.createEntity(input);
	}

	/**
	 * Get entity by ID
	 */
	async getEntity(id: string): Promise<AssetEntity | null> {
		this.ensureInitialized();
		return this.library!.getEntity(id);
	}

	/**
	 * Get all entities
	 */
	async getAllEntities(): Promise<AssetEntity[]> {
		this.ensureInitialized();
		return this.library!.getAllEntities();
	}

	/**
	 * Update an entity
	 */
	async updateEntity(id: string, updates: UpdateEntityInput): Promise<AssetEntity> {
		this.ensureInitialized();
		return this.library!.updateEntity(id, updates);
	}

	/**
	 * Delete an entity
	 */
	async deleteEntity(id: string): Promise<boolean> {
		this.ensureInitialized();
		return this.library!.deleteEntity(id);
	}

	/**
	 * Get entities by category
	 */
	async getByCategory(category: EntityCategory): Promise<AssetEntity[]> {
		this.ensureInitialized();
		return this.library!.getByCategory(category);
	}

	/**
	 * Get entities by tags
	 */
	async getByTags(tags: string[]): Promise<AssetEntity[]> {
		this.ensureInitialized();
		return this.library!.getByTags(tags);
	}

	/**
	 * Get recent entities
	 */
	async getRecent(limit?: number): Promise<AssetEntity[]> {
		this.ensureInitialized();
		return this.library!.getRecent(limit);
	}

	/**
	 * Record usage of an entity
	 */
	async recordUsage(id: string): Promise<AssetEntity> {
		this.ensureInitialized();
		return this.library!.recordUsage(id);
	}

	// =========================================================================
	// Variant Operations
	// =========================================================================

	/**
	 * Add a variant to an entity
	 */
	async addVariant(entityId: string, input: CreateVariantInput): Promise<AssetVariant> {
		this.ensureInitialized();
		return this.library!.addVariant(entityId, input);
	}

	/**
	 * Get a variant
	 */
	async getVariant(entityId: string, variantId: string): Promise<AssetVariant | null> {
		this.ensureInitialized();
		return this.library!.getVariant(entityId, variantId);
	}

	/**
	 * Update a variant
	 */
	async updateVariant(
		entityId: string,
		variantId: string,
		updates: UpdateVariantInput
	): Promise<AssetVariant> {
		this.ensureInitialized();
		return this.library!.updateVariant(entityId, variantId, updates);
	}

	/**
	 * Delete a variant
	 */
	async deleteVariant(entityId: string, variantId: string): Promise<boolean> {
		this.ensureInitialized();
		return this.library!.deleteVariant(entityId, variantId);
	}

	/**
	 * Move a variant to another entity
	 */
	async moveVariant(input: MoveVariantInput): Promise<MoveVariantResult> {
		this.ensureInitialized();
		return this.library!.moveVariant(input);
	}

	/**
	 * Merge two entities
	 */
	async mergeEntities(input: MergeEntitiesInput): Promise<MergeEntitiesResult> {
		this.ensureInitialized();
		return this.library!.mergeEntities(input);
	}

	// =========================================================================
	// File Operations
	// =========================================================================

	/**
	 * Add a file to a variant
	 */
	async addFile(variantId: string, filePath: string, options?: AddFileOptions): Promise<AssetFile> {
		this.ensureInitialized();
		return this.library!.addFile(variantId, filePath, options);
	}

	/**
	 * Remove a file from a variant
	 */
	async removeFile(variantId: string, fileId: string): Promise<boolean> {
		this.ensureInitialized();
		return this.library!.removeFile(variantId, fileId);
	}

	// =========================================================================
	// Search Operations
	// =========================================================================

	/**
	 * Search entities
	 */
	async search(query: AssetQuery): Promise<SearchResult> {
		this.ensureInitialized();
		return this.library!.search(query);
	}

	/**
	 * Get all tags with counts
	 */
	async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
		this.ensureInitialized();
		return this.library!.getAllTags();
	}

	// =========================================================================
	// Import Operations
	// =========================================================================

	/**
	 * Import a file into the library
	 */
	async importFile(filePath: string, options?: ImportOptions): Promise<ImportResult> {
		this.ensureInitialized();
		return this.library!.importFile(filePath, options);
	}

	/**
	 * Import files from a dialog
	 */
	async importFromDialog(): Promise<ImportResult[]> {
		const uris = await vscode.window.showOpenDialog({
			canSelectMany: true,
			filters: {
				'Media Files': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg'],
				'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp'],
				'Videos': ['mp4', 'webm', 'mov'],
				'Audio': ['mp3', 'wav', 'ogg'],
			},
		});

		if (!uris || uris.length === 0) {
			return [];
		}

		const results: ImportResult[] = [];
		for (const uri of uris) {
			try {
				const result = await this.importFile(uri.fsPath, { autoClassify: true });
				results.push(result);
			} catch (error) {
				console.error(`[AssetService] Failed to import ${uri.fsPath}:`, error);
				vscode.window.showErrorMessage(`Failed to import ${path.basename(uri.fsPath)}`);
			}
		}

		return results;
	}

	// =========================================================================
	// AI Classification
	// =========================================================================

	/**
	 * Classify a file using AI
	 */
	async classifyFile(filePath: string): Promise<ClassificationResult | null> {
		this.ensureInitialized();
		return this.library!.classifyFile(filePath);
	}

	/**
	 * Suggest tags for a file
	 */
	async suggestTags(filePath: string): Promise<string[]> {
		this.ensureInitialized();
		return this.library!.suggestTags(filePath);
	}

	// =========================================================================
	// Variant Comparison
	// =========================================================================

	/**
	 * Compare two variants of the same entity
	 * Uses ImageDiffAnalyzer for image file comparison
	 */
	async compareVariants(
		entityId: string,
		variantIdA: string,
		variantIdB: string
	): Promise<VariantComparisonResult> {
		this.ensureInitialized();

		const entity = await this.getEntity(entityId);
		if (!entity) {
			throw new Error(`Entity not found: ${entityId}`);
		}

		const variantA = entity.variants.find((v) => v.id === variantIdA);
		const variantB = entity.variants.find((v) => v.id === variantIdB);

		if (!variantA) {
			throw new Error(`Variant not found: ${variantIdA}`);
		}
		if (!variantB) {
			throw new Error(`Variant not found: ${variantIdB}`);
		}

		// Compare attributes
		const attributeDiffs = this.compareAttributes(variantA.attributes, variantB.attributes);

		// Compare files using ImageDiffAnalyzer
		let fileDiff: AssetDiffResult | undefined;
		if (variantA.files.length > 0 && variantB.files.length > 0) {
			const fileA = variantA.files[0];
			const fileB = variantB.files[0];
			if (fileA && fileB) {
				fileDiff = await this.compareFiles(fileA, fileB, variantA, variantB);
			}
		}

		return {
			entity,
			variantA,
			variantB,
			attributeDiffs,
			fileDiff,
		};
	}

	/**
	 * Compare two files using ImageDiffAnalyzer
	 */
	private async compareFiles(
		fileA: AssetFile,
		fileB: AssetFile,
		variantA: AssetVariant,
		variantB: AssetVariant
	): Promise<AssetDiffResult> {
		const startTime = Date.now();
		const analyzer = new ImageDiffAnalyzer();

		// Check if both files are images
		const isImageA = analyzer.supports(fileA.path);
		const isImageB = analyzer.supports(fileB.path);

		if (isImageA && isImageB) {
			try {
				// Read file buffers
				const [bufferA, bufferB] = await Promise.all([
					fs.readFile(fileA.path),
					fs.readFile(fileB.path),
				]);

				// Analyze with ImageDiffAnalyzer
				const diffResult = await analyzer.analyze(bufferA, bufferB);

				// Convert to AssetDiffResult
				const changes: AssetChangeAnalysis = {
					changeTypes: [],
				};

				// Determine change types based on diff details
				if (diffResult.details && 'pixelDifference' in diffResult.details) {
					const details = diffResult.details;
					if (details.pixelDifference > 0.1) {
						changes.changeTypes.push('content');
					}
					if (details.colorHistogramDiff > 0.1) {
						changes.changeTypes.push('color');
					}
					if (
						details.dimensions.current.width !== details.dimensions.previous.width ||
						details.dimensions.current.height !== details.dimensions.previous.height
					) {
						changes.changeTypes.push('dimension');
					}
				}

				return {
					current: {
						name: `${variantA.name} - ${fileA.name}`,
						path: fileA.path,
					},
					previous: {
						name: `${variantB.name} - ${fileB.name}`,
						path: fileB.path,
					},
					mediaType: 'image',
					similarity: diffResult.similarity,
					changes,
					processingTime: Date.now() - startTime,
				};
			} catch (error) {
				console.error('[AssetService] Image diff failed:', error);
				// Fall through to default result
			}
		}

		// Default result for non-image files or on error
		return {
			current: {
				name: `${variantA.name} - ${fileA.name}`,
				path: fileA.path,
			},
			previous: {
				name: `${variantB.name} - ${fileB.name}`,
				path: fileB.path,
			},
			mediaType: this.detectMediaType(fileA.path),
			similarity: fileA.path === fileB.path ? 1.0 : 0.5, // Unknown similarity
			changes: { changeTypes: [] },
			processingTime: Date.now() - startTime,
		};
	}

	/**
	 * Compare variant attributes
	 */
	private compareAttributes(
		attrsA: VariantAttributes,
		attrsB: VariantAttributes
	): AttributeDiff[] {
		const diffs: AttributeDiff[] = [];
		const allKeys = new Set([
			...Object.keys(attrsA),
			...Object.keys(attrsB),
		]) as Set<keyof VariantAttributes>;

		for (const key of allKeys) {
			const valueA = attrsA[key];
			const valueB = attrsB[key];

			if (valueA !== valueB) {
				diffs.push({
					attribute: key,
					valueA: valueA as string | undefined,
					valueB: valueB as string | undefined,
				});
			}
		}

		return diffs;
	}

	/**
	 * Detect media type from file path
	 */
	private detectMediaType(filePath: string): 'image' | 'video' | 'audio' {
		const ext = path.extname(filePath).toLowerCase();

		if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
			return 'image';
		}
		if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) {
			return 'video';
		}
		if (['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'].includes(ext)) {
			return 'audio';
		}

		return 'image'; // default
	}

	// =========================================================================
	// Persistence
	// =========================================================================

	/**
	 * Flush changes to storage
	 */
	async flush(): Promise<void> {
		this.ensureInitialized();
		return this.library!.flush();
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	/**
	 * Extract metadata from a file
	 */
	private async extractMetadata(filePath: string): Promise<import('@neko/shared').MediaFileMetadata> {
		const stats = await fs.stat(filePath);
		const ext = path.extname(filePath).toLowerCase();

		// Determine MIME type
		const mimeTypes: Record<string, string> = {
			// Video
			'.mp4': 'video/mp4',
			'.mov': 'video/quicktime',
			'.avi': 'video/x-msvideo',
			'.mkv': 'video/x-matroska',
			'.webm': 'video/webm',
			// Audio
			'.mp3': 'audio/mpeg',
			'.wav': 'audio/wav',
			'.ogg': 'audio/ogg',
			'.aac': 'audio/aac',
			'.m4a': 'audio/mp4',
			'.flac': 'audio/flac',
			// Image
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.bmp': 'image/bmp',
			'.svg': 'image/svg+xml',
			// Text
			'.txt': 'text/plain',
			'.md': 'text/markdown',
			'.json': 'application/json',
			'.yaml': 'application/x-yaml',
			'.yml': 'application/x-yaml',
			'.csv': 'text/csv',
			'.xml': 'application/xml',
		};

		const mimeType = mimeTypes[ext] ?? 'application/octet-stream';
		const metadata: import('@neko/shared').MediaFileMetadata = {
			fileSize: stats.size,
			mimeType,
		};

		// Extract text-specific metadata
		const textExts = ['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.xml'];
		if (textExts.includes(ext)) {
			try {
				const content = await fs.readFile(filePath, 'utf-8');
				metadata.characterCount = content.length;
				metadata.wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
				metadata.lineCount = content.split('\n').length;
				metadata.encoding = 'utf-8';

				// Simple language detection based on content
				// Check for Chinese characters
				if (/[\u4e00-\u9fa5]/.test(content)) {
					metadata.language = 'zh-CN';
				} else {
					metadata.language = 'en';
				}
			} catch (error) {
				console.error('[AssetService] Failed to extract text metadata:', error);
			}
		}

		// TODO: Extract video/audio metadata using ffprobe or similar
		// For now, return basic metadata

		return metadata;
	}

	/**
	 * Ensure service is initialized
	 */
	private ensureInitialized(): void {
		if (!this.initialized || !this.library) {
			throw new Error('AssetService not initialized. Call initialize() first.');
		}
	}
}
