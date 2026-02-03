/**
 * DemuxerFactory - Factory for creating demuxers based on file format
 *
 * Automatically selects the appropriate demuxer implementation:
 * - MP4Demuxer for MP4/MOV/M4V files
 * - LibavDemuxer for WebM/MKV/AVI files
 */

import type { IDemuxer } from './IDemuxer';
import type { DemuxerConfig, MP4DemuxerConfig, LibavDemuxerConfig } from './types';
import { MP4Demuxer } from './MP4Demuxer';
import { LibavDemuxer } from './LibavDemuxer';

// =============================================================================
// Types
// =============================================================================

export type DemuxerType = 'mp4' | 'webm' | 'mkv' | 'avi' | 'auto';

export interface CreateDemuxerOptions extends DemuxerConfig {
	/** Force a specific demuxer type (default: 'auto') */
	type?: DemuxerType;
	/** MP4-specific options */
	mp4Options?: Partial<MP4DemuxerConfig>;
	/** Libav-specific options */
	libavOptions?: Partial<LibavDemuxerConfig>;
}

// =============================================================================
// Format Detection
// =============================================================================

/**
 * Detect demuxer type from file extension
 * @param source File URL or path
 * @returns Detected demuxer type
 */
export function detectDemuxerType(source: string): DemuxerType {
	// Extract filename from URL
	let filename = source;
	try {
		const url = new URL(source);
		filename = url.pathname;
	} catch {
		// Not a valid URL, use as-is
	}

	// Get extension
	const ext = filename.split('.').pop()?.toLowerCase();

	switch (ext) {
		// MP4 family
		case 'mp4':
		case 'mov':
		case 'm4v':
		case 'm4a':
		case 'f4v':
			return 'mp4';

		// WebM
		case 'webm':
			return 'webm';

		// Matroska
		case 'mkv':
		case 'mka':
		case 'mk3d':
			return 'mkv';

		// AVI
		case 'avi':
			return 'avi';

		// Default to MP4 for unknown extensions
		default:
			return 'mp4';
	}
}

/**
 * Check if a format is supported by the native MP4Demuxer
 */
export function isMP4Format(type: DemuxerType): boolean {
	return type === 'mp4';
}

/**
 * Check if a format requires libav.js
 */
export function isLibavFormat(type: DemuxerType): boolean {
	return type === 'webm' || type === 'mkv' || type === 'avi';
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a demuxer for the given source
 *
 * @param options Demuxer configuration
 * @returns IDemuxer instance
 *
 * @example
 * ```typescript
 * // Auto-detect format
 * const demuxer = createDemuxer({ source: 'video.webm' });
 *
 * // Force specific format
 * const demuxer = createDemuxer({ source: 'video.bin', type: 'mkv' });
 *
 * // With format-specific options
 * const demuxer = createDemuxer({
 *   source: 'video.mp4',
 *   mp4Options: { initialLoadSize: 4 * 1024 * 1024 }
 * });
 * ```
 */
export function createDemuxer(options: CreateDemuxerOptions): IDemuxer {
	const { source, type = 'auto', mp4Options, libavOptions, ...baseConfig } = options;

	// Determine demuxer type
	const demuxerType = type === 'auto' ? detectDemuxerType(source) : type;

	// Create appropriate demuxer
	if (isMP4Format(demuxerType)) {
		return new MP4Demuxer({
			source,
			...baseConfig,
			...mp4Options,
		});
	}

	if (isLibavFormat(demuxerType)) {
		return new LibavDemuxer({
			source,
			...baseConfig,
			...libavOptions,
		});
	}

	// Fallback to MP4Demuxer
	console.warn(`[DemuxerFactory] Unknown format type: ${demuxerType}, falling back to MP4Demuxer`);
	return new MP4Demuxer({
		source,
		...baseConfig,
		...mp4Options,
	});
}

// =============================================================================
// Format Support Check
// =============================================================================

/**
 * Check if a file format is supported
 * @param source File URL or path
 * @returns Whether the format is supported
 */
export function isFormatSupported(source: string): boolean {
	const type = detectDemuxerType(source);
	return isMP4Format(type) || isLibavFormat(type);
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
	return [
		// MP4 family
		'mp4', 'mov', 'm4v', 'm4a', 'f4v',
		// WebM
		'webm',
		// Matroska
		'mkv', 'mka', 'mk3d',
		// AVI
		'avi',
	];
}
