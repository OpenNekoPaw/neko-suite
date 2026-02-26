/**
 * Thumbnail Service (Extension Host)
 *
 * 通过 neko-engine 提取视频/图片关键帧生成缩略图。
 * 持久化到 .neko/assets/thumbnails/，关联 AssetVariant.thumbnailFileId。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { detectMediaType } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface ThumbnailOptions {
	/** Max width in pixels (default 256) */
	maxWidth?: number;
	/** Max height in pixels (default 256) */
	maxHeight?: number;
	/** Time offset in seconds for video (default 1) */
	timeOffset?: number;
}

export interface ThumbnailResult {
	/** Absolute path to the generated thumbnail */
	path: string;
	/** Width of the thumbnail */
	width: number;
	/** Height of the thumbnail */
	height: number;
}

// =============================================================================
// Service
// =============================================================================

export class ThumbnailService implements vscode.Disposable {
	private readonly thumbnailDir: string;

	constructor(workspaceRoot: string) {
		this.thumbnailDir = path.join(workspaceRoot, '.neko', 'assets', 'thumbnails');
	}

	/**
	 * Generate a thumbnail for a media file.
	 * Returns the path to the generated thumbnail, or null if generation fails.
	 */
	async generate(
		filePath: string,
		options: ThumbnailOptions = {},
	): Promise<ThumbnailResult | null> {
		const mediaType = detectMediaType(filePath);
		if (mediaType !== 'video' && mediaType !== 'image') {
			return null;
		}

		const maxWidth = options.maxWidth ?? 256;
		const maxHeight = options.maxHeight ?? 256;

		// Deterministic filename based on source path + options
		const hash = crypto
			.createHash('md5')
			.update(`${filePath}:${maxWidth}:${maxHeight}:${options.timeOffset ?? 1}`)
			.digest('hex');
		const thumbPath = path.join(this.thumbnailDir, `${hash}.jpg`);

		// Check cache
		try {
			await fs.access(thumbPath);
			// Already exists — return cached
			return { path: thumbPath, width: maxWidth, height: maxHeight };
		} catch {
			// Not cached, generate
		}

		// Ensure directory exists
		await fs.mkdir(this.thumbnailDir, { recursive: true });

		// Try engine thumbnail extraction
		try {
			const result = await vscode.commands.executeCommand<{
				success: boolean;
				path?: string;
				width?: number;
				height?: number;
			}>(
				'neko.engine.extractThumbnail',
				filePath,
				thumbPath,
				maxWidth,
				maxHeight,
				options.timeOffset ?? 1,
			);

			if (result?.success && result.path) {
				return {
					path: result.path,
					width: result.width ?? maxWidth,
					height: result.height ?? maxHeight,
				};
			}
		} catch {
			// Engine not available — fall through
		}

		// Fallback: for images, copy/resize is not possible without native deps.
		// Return null to indicate thumbnail generation is not available.
		return null;
	}

	/**
	 * Get the thumbnail path for a file if it exists in cache.
	 */
	async getCached(filePath: string): Promise<string | null> {
		const hash = crypto
			.createHash('md5')
			.update(`${filePath}:256:256:1`)
			.digest('hex');
		const thumbPath = path.join(this.thumbnailDir, `${hash}.jpg`);

		try {
			await fs.access(thumbPath);
			return thumbPath;
		} catch {
			return null;
		}
	}

	/**
	 * Clear all cached thumbnails.
	 */
	async clearCache(): Promise<void> {
		try {
			await fs.rm(this.thumbnailDir, { recursive: true, force: true });
		} catch {
			// Directory may not exist
		}
	}

	dispose(): void {
		// No resources to clean up
	}
}
