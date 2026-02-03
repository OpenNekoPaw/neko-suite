/**
 * Type definitions for mp4box.js
 * @see https://github.com/nickreynolds/nickreynolds-mp4box.js
 */

declare module 'mp4box' {
	// =============================================================================
	// Core Types
	// =============================================================================

	export interface MP4ArrayBuffer extends ArrayBuffer {
		fileStart: number;
	}

	export interface MP4Info {
		duration: number;
		timescale: number;
		isFragmented: boolean;
		isProgressive: boolean;
		hasIOD: boolean;
		brands: string[];
		created: Date;
		modified: Date;
		tracks: MP4Track[];
		mime: string;
		audioTracks: MP4AudioTrack[];
		videoTracks: MP4VideoTrack[];
	}

	export interface MP4Track {
		id: number;
		created: Date;
		modified: Date;
		movie_duration: number;
		movie_timescale: number;
		layer: number;
		alternate_group: number;
		volume: number;
		track_width: number;
		track_height: number;
		timescale: number;
		duration: number;
		bitrate: number;
		codec: string;
		language: string;
		nb_samples: number;
	}

	export interface MP4VideoTrack extends MP4Track {
		type: 'video';
		video: {
			width: number;
			height: number;
		};
	}

	export interface MP4AudioTrack extends MP4Track {
		type: 'audio';
		audio: {
			sample_rate: number;
			channel_count: number;
			sample_size: number;
		};
	}

	// =============================================================================
	// Sample Types
	// =============================================================================

	export interface MP4Sample {
		number: number;
		track_id: number;
		timescale: number;
		description_index: number;
		description: MP4SampleDescription;
		data: ArrayBuffer;
		size: number;
		alreadyRead: number;
		duration: number;
		cts: number;
		dts: number;
		is_sync: boolean;
		is_leading: number;
		depends_on: number;
		is_depended_on: number;
		has_redundancy: number;
		degradation_priority: number;
		offset: number;
	}

	export interface MP4SampleDescription {
		type?: string;
		avcC?: {
			configurationVersion: number;
			AVCProfileIndication: number;
			profile_compatibility: number;
			AVCLevelIndication: number;
			lengthSizeMinusOne: number;
			nb_SPS_nalus: number;
			SPS: Array<{ length: number; nalu: Uint8Array }>;
			nb_PPS_nalus: number;
			PPS: Array<{ length: number; nalu: Uint8Array }>;
		};
		hvcC?: {
			configurationVersion: number;
			general_profile_space: number;
			general_tier_flag: number;
			general_profile_idc: number;
			general_profile_compatibility: number;
			general_constraint_indicator: Uint8Array;
			general_level_idc: number;
			min_spatial_segmentation_idc: number;
			parallelismType: number;
			chroma_format_idc: number;
			bit_depth_luma_minus8: number;
			bit_depth_chroma_minus8: number;
			avgFrameRate: number;
			constantFrameRate: number;
			numTemporalLayers: number;
			temporalIdNested: number;
			lengthSizeMinusOne: number;
			nalu_arrays: Array<{
				completeness: number;
				nalu_type: number;
				nalus: Array<{ length: number; data: Uint8Array }>;
			}>;
		};
		vpcC?: {
			profile: number;
			level: number;
			bitDepth: number;
			chromaSubsampling: number;
			videoFullRangeFlag: number;
			colourPrimaries: number;
			transferCharacteristics: number;
			matrixCoefficients: number;
			codecIntializationDataSize: number;
			codecIntializationData: Uint8Array;
		};
		av1C?: {
			version: number;
			seq_profile: number;
			seq_level_idx_0: number;
			seq_tier_0: number;
			high_bitdepth: number;
			twelve_bit: number;
			monochrome: number;
			chroma_subsampling_x: number;
			chroma_subsampling_y: number;
			chroma_sample_position: number;
			initial_presentation_delay_present: number;
			initial_presentation_delay_minus_one: number;
			configOBUs: Uint8Array;
		};
		width?: number;
		height?: number;
		channel_count?: number;
		samplerate?: number;
		samplesize?: number;
	}

	// =============================================================================
	// Extraction Options
	// =============================================================================

	export interface ExtractionOptions {
		nbSamples?: number;
		rapAlignement?: boolean;
	}

	// =============================================================================
	// MP4File Class
	// =============================================================================

	export interface MP4File {
		// Callbacks
		onReady?: (info: MP4Info) => void;
		onError?: (error: Error) => void;
		onSamples?: (trackId: number, ref: unknown, samples: MP4Sample[]) => void;
		onMoovStart?: () => void;

		// Methods
		appendBuffer(buffer: MP4ArrayBuffer): number;
		start(): void;
		stop(): void;
		flush(): void;
		seek(time: number, useRap?: boolean): { offset: number; time: number };
		releaseUsedSamples(trackId: number, sampleNumber: number): void;
		setExtractionOptions(
			trackId: number,
			user?: unknown,
			options?: ExtractionOptions
		): void;
		unsetExtractionOptions(trackId: number): void;
		getInfo(): MP4Info | null;
		getTrackById(trackId: number): MP4Track | undefined;
	}

	// =============================================================================
	// DataStream Class
	// =============================================================================

	export class DataStream {
		constructor(
			arrayBuffer?: ArrayBuffer,
			byteOffset?: number,
			endianness?: boolean
		);
		static BIG_ENDIAN: boolean;
		static LITTLE_ENDIAN: boolean;
		buffer: ArrayBuffer;
		byteOffset: number;
		position: number;
		endianness: boolean;
	}

	// =============================================================================
	// Factory Function
	// =============================================================================

	export function createFile(): MP4File;

	// =============================================================================
	// Default Export
	// =============================================================================

	const MP4Box: {
		createFile: typeof createFile;
		DataStream: typeof DataStream;
	};

	export default MP4Box;
}
