/**
 * Muxers Index
 *
 * Exports all muxer implementations for basic mode.
 */

export { MP4Muxer, createMP4Muxer, isMP4MuxerAvailable } from './MP4Muxer';
export { WebMMuxer, createWebMMuxer, isWebMMuxerAvailable } from './WebMMuxer';

// Re-export types from shared
export type {
	IMuxer,
	MuxerConfig,
	MuxerState,
	MuxerProgress,
	MuxerResult,
	MuxerVideoChunk,
	MuxerAudioChunk,
	MuxerVideoConfig,
	MuxerAudioConfig,
} from '@neko/shared';
