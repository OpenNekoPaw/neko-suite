/**
 * Demuxers Module
 *
 * Provides container demuxing capabilities for extracting
 * video and audio tracks from media files.
 *
 * Supported formats:
 * - MP4/MOV/M4V (via mp4box.js)
 * - WebM/MKV/AVI (via libav.js)
 */

// Types
export type {
	DemuxedMediaInfo,
	EncodedAudioSample,
	AudioDescription,
	DemuxerConfig,
	MP4DemuxerConfig,
	LibavDemuxerConfig,
	SampleInfo,
} from './types';

// Interface
export type { IDemuxer } from './IDemuxer';

// MP4 Demuxer
export {
	MP4Demuxer,
	createMP4Demuxer,
	isVideoCodecSupported,
} from './MP4Demuxer';

// Libav Demuxer
export {
	LibavDemuxer,
	createLibavDemuxer,
} from './LibavDemuxer';

// Factory
export {
	createDemuxer,
	detectDemuxerType,
	isMP4Format,
	isLibavFormat,
	isFormatSupported,
	getSupportedExtensions,
	type DemuxerType,
	type CreateDemuxerOptions,
} from './DemuxerFactory';
