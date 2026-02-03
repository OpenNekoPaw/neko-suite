/**
 * File Service
 *
 * Handles operations for asset files within variants.
 */

import type {
	AssetFile,
	AddFileOptions,
	MediaFileMetadata,
	AssetMediaType,
} from '@uniedit/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import { generateFileId } from './utils';

/**
 * Metadata extractor function type
 */
export type MetadataExtractor = (filePath: string) => Promise<MediaFileMetadata>;

/**
 * File service configuration
 */
export interface FileServiceConfig {
	/** Function to extract metadata from files */
	metadataExtractor?: MetadataExtractor;
}

/**
 * File service for managing asset files
 */
export class FileService {
	private metadataExtractor?: MetadataExtractor;

	constructor(
		private storage: IAssetStorage,
		config?: FileServiceConfig
	) {
		this.metadataExtractor = config?.metadataExtractor;
	}

	/**
	 * Add a file to a variant
	 */
	async add(
		variantId: string,
		filePath: string,
		options?: AddFileOptions
	): Promise<AssetFile> {
		// Detect media type from extension
		const mediaType = this.detectMediaType(filePath);

		// Extract or use provided metadata
		let metadata: MediaFileMetadata;
		if (options?.metadata) {
			metadata = {
				fileSize: options.metadata.fileSize ?? 0,
				mimeType: options.metadata.mimeType ?? this.getMimeType(filePath),
				...options.metadata,
			};
		} else if (this.metadataExtractor) {
			metadata = await this.metadataExtractor(filePath);
		} else {
			// Minimal metadata
			metadata = {
				fileSize: 0,
				mimeType: this.getMimeType(filePath),
			};
		}

		const file: AssetFile = {
			id: generateFileId(),
			variantId,
			name: options?.name ?? this.extractFileName(filePath),
			path: filePath,
			mediaType,
			metadata,
			purpose: options?.purpose ?? 'main',
			createdAt: Date.now(),
		};

		await this.storage.saveFile(variantId, file);
		return file;
	}

	/**
	 * Get a file by ID
	 */
	async get(variantId: string, fileId: string): Promise<AssetFile | null> {
		return this.storage.getFile(variantId, fileId);
	}

	/**
	 * Remove a file
	 */
	async remove(variantId: string, fileId: string): Promise<boolean> {
		return this.storage.deleteFile(variantId, fileId);
	}

	/**
	 * Update file metadata
	 */
	async updateMetadata(
		variantId: string,
		fileId: string,
		metadata: Partial<MediaFileMetadata>
	): Promise<AssetFile> {
		const file = await this.storage.getFile(variantId, fileId);
		if (!file) {
			throw new Error(`File not found: ${fileId}`);
		}

		file.metadata = { ...file.metadata, ...metadata };
		await this.storage.saveFile(variantId, file);
		return file;
	}

	/**
	 * Detect media type from file path
	 */
	private detectMediaType(filePath: string): AssetMediaType {
		const ext = filePath.toLowerCase().split('.').pop() ?? '';

		const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v'];
		const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma'];
		const imageExts = [
			'jpg',
			'jpeg',
			'png',
			'gif',
			'webp',
			'bmp',
			'svg',
			'tiff',
		];
		const textExts = ['txt', 'md', 'json', 'yaml', 'yml', 'csv', 'xml'];

		if (videoExts.includes(ext)) return 'video';
		if (audioExts.includes(ext)) return 'audio';
		if (imageExts.includes(ext)) return 'image';
		if (textExts.includes(ext)) return 'text';

		// Check for image sequence pattern
		if (/\d{3,}/.test(filePath)) return 'sequence';

		return 'image'; // Default
	}

	/**
	 * Get MIME type from file path
	 */
	private getMimeType(filePath: string): string {
		const ext = filePath.toLowerCase().split('.').pop() ?? '';

		const mimeTypes: Record<string, string> = {
			// Video
			mp4: 'video/mp4',
			mov: 'video/quicktime',
			avi: 'video/x-msvideo',
			mkv: 'video/x-matroska',
			webm: 'video/webm',
			// Audio
			mp3: 'audio/mpeg',
			wav: 'audio/wav',
			ogg: 'audio/ogg',
			aac: 'audio/aac',
			m4a: 'audio/mp4',
			flac: 'audio/flac',
			// Image
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			bmp: 'image/bmp',
			svg: 'image/svg+xml',
			// Text
			txt: 'text/plain',
			md: 'text/markdown',
			json: 'application/json',
			yaml: 'application/x-yaml',
			yml: 'application/x-yaml',
			csv: 'text/csv',
			xml: 'application/xml',
		};

		return mimeTypes[ext] ?? 'application/octet-stream';
	}

	/**
	 * Extract file name from path
	 */
	private extractFileName(filePath: string): string {
		const parts = filePath.split(/[/\\]/);
		return parts[parts.length - 1] ?? filePath;
	}
}
