/**
 * MP4Demuxer - MP4/MOV container demuxer using mp4box.js
 *
 * On-demand loading model:
 * 1. Load moov (metadata) first to get sample index
 * 2. Use getSample() to extract specific samples
 * 3. Lazy load sample data via Range requests when needed
 *
 * Supports two loading modes:
 * - fetch: Uses fetch API with Range headers (may not work in VSCode webview)
 * - Extension Host: Uses Extension Host file reading for true on-demand loading
 */

import {
	createFile,
	type MP4File,
	type MP4Info,
	type MP4Sample,
	type MP4ArrayBuffer,
	type MP4VideoTrack,
	type MP4AudioTrack,
} from 'mp4box';

import type { IDemuxer } from './IDemuxer';
import type {
	DemuxedMediaInfo,
	EncodedAudioSample,
	AudioDescription,
	MP4DemuxerConfig,
	SampleInfo,
} from './types';
import { readFileRangeCached } from '../../hooks/useVSCodeMessaging';

// Re-export types for backward compatibility
export type { DemuxedMediaInfo, EncodedAudioSample, AudioDescription, MP4DemuxerConfig };

/** Audio sample info from mp4box index */
type AudioSampleInfo = SampleInfo;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if sample data contains an IDR NAL unit (H.264)
 * IDR frames are true random access points that don't depend on any other frames
 *
 * @param data Sample data in AVCC format (length-prefixed NAL units)
 * @param nalLengthSize Size of NAL unit length prefix (usually 4 bytes)
 * @param debug Enable debug logging
 * @returns true if the sample contains an IDR NAL unit
 */
function isIDRFrame(data: Uint8Array, nalLengthSize: number = 4, debug: boolean = false): boolean {
	let offset = 0;
	let nalIndex = 0;

	while (offset + nalLengthSize <= data.length) {
		// Read NAL unit length
		let nalLength = 0;
		for (let i = 0; i < nalLengthSize; i++) {
			nalLength = (nalLength << 8) | (data[offset + i] ?? 0);
		}
		offset += nalLengthSize;

		if (nalLength <= 0 || offset + nalLength > data.length) {
			if (debug) {
				console.log(`[isIDRFrame] NAL ${nalIndex}: invalid length ${nalLength} at offset ${offset - nalLengthSize}`);
			}
			break;
		}

		// Get NAL unit type (lower 5 bits of first byte)
		const nalHeader = data[offset];
		if (nalHeader !== undefined) {
			const nalUnitType = nalHeader & 0x1f;

			if (debug) {
				console.log(`[isIDRFrame] NAL ${nalIndex}: type=${nalUnitType}, length=${nalLength}, offset=${offset - nalLengthSize}`);
			}

			// NAL unit type 5 = IDR slice
			if (nalUnitType === 5) {
				return true;
			}

			// NAL unit type 1 = non-IDR slice (P/B frame or non-IDR I frame)
			// If we find a non-IDR slice before finding IDR, this is not an IDR frame
			if (nalUnitType === 1) {
				return false;
			}
		}

		offset += nalLength;
		nalIndex++;
	}

	if (debug) {
		console.log(`[isIDRFrame] No IDR found after ${nalIndex} NALs`);
	}
	return false;
}

/**
 * Convert AVCC format (length-prefixed NAL units) to Annex B format (start code prefixed)
 * This is needed when using in-band SPS/PPS (no description in VideoDecoderConfig)
 *
 * @param data Sample data in AVCC format
 * @param nalLengthSize Size of NAL unit length prefix (usually 4 bytes)
 * @returns Sample data in Annex B format
 */
function avccToAnnexB(data: Uint8Array, nalLengthSize: number = 4): Uint8Array {
	// First pass: calculate output size
	let outputSize = 0;
	let offset = 0;

	while (offset + nalLengthSize <= data.length) {
		let nalLength = 0;
		for (let i = 0; i < nalLengthSize; i++) {
			nalLength = (nalLength << 8) | (data[offset + i] ?? 0);
		}
		offset += nalLengthSize;

		if (nalLength <= 0 || offset + nalLength > data.length) {
			break;
		}

		// 4 bytes for start code (00 00 00 01) + NAL data
		outputSize += 4 + nalLength;
		offset += nalLength;
	}

	// Second pass: convert
	const output = new Uint8Array(outputSize);
	let inputOffset = 0;
	let outputOffset = 0;

	while (inputOffset + nalLengthSize <= data.length) {
		let nalLength = 0;
		for (let i = 0; i < nalLengthSize; i++) {
			nalLength = (nalLength << 8) | (data[inputOffset + i] ?? 0);
		}
		inputOffset += nalLengthSize;

		if (nalLength <= 0 || inputOffset + nalLength > data.length) {
			break;
		}

		// Write start code
		output[outputOffset++] = 0;
		output[outputOffset++] = 0;
		output[outputOffset++] = 0;
		output[outputOffset++] = 1;

		// Copy NAL data
		output.set(data.subarray(inputOffset, inputOffset + nalLength), outputOffset);
		outputOffset += nalLength;
		inputOffset += nalLength;
	}

	return output;
}

/**
 * Extract SPS and PPS from avcC description
 * Returns Annex B formatted SPS and PPS with start codes
 */
function extractSPSPPSFromAvcC(avcC: Uint8Array): Uint8Array | null {
	if (avcC.length < 7) return null;

	// avcC structure:
	// [0] configurationVersion (1)
	// [1] AVCProfileIndication
	// [2] profile_compatibility
	// [3] AVCLevelIndication
	// [4] lengthSizeMinusOne (lower 2 bits)
	// [5] numOfSequenceParameterSets (lower 5 bits)
	// [6-7] sequenceParameterSetLength
	// [...] sequenceParameterSetNALUnit
	// [...] numOfPictureParameterSets
	// [...] pictureParameterSetLength
	// [...] pictureParameterSetNALUnit

	let offset = 5;
	const numSPS = (avcC[offset++] ?? 0) & 0x1f;

	const nalUnits: Uint8Array[] = [];

	// Read SPS
	for (let i = 0; i < numSPS; i++) {
		if (offset + 2 > avcC.length) return null;
		const spsLength = ((avcC[offset] ?? 0) << 8) | (avcC[offset + 1] ?? 0);
		offset += 2;
		if (offset + spsLength > avcC.length) return null;
		nalUnits.push(avcC.subarray(offset, offset + spsLength));
		offset += spsLength;
	}

	// Read PPS
	if (offset >= avcC.length) return null;
	const numPPS = avcC[offset++] ?? 0;

	for (let i = 0; i < numPPS; i++) {
		if (offset + 2 > avcC.length) return null;
		const ppsLength = ((avcC[offset] ?? 0) << 8) | (avcC[offset + 1] ?? 0);
		offset += 2;
		if (offset + ppsLength > avcC.length) return null;
		nalUnits.push(avcC.subarray(offset, offset + ppsLength));
		offset += ppsLength;
	}

	// Calculate total size (4 bytes start code per NAL)
	const totalSize = nalUnits.reduce((sum, nal) => sum + 4 + nal.length, 0);
	const output = new Uint8Array(totalSize);
	let outputOffset = 0;

	for (const nal of nalUnits) {
		// Write start code
		output[outputOffset++] = 0;
		output[outputOffset++] = 0;
		output[outputOffset++] = 0;
		output[outputOffset++] = 1;
		// Copy NAL data
		output.set(nal, outputOffset);
		outputOffset += nal.length;
	}

	return output;
}

function mapVideoCodecToWebCodecs(
	codec: string,
	description?: MP4Sample['description']
): string | null {
	const codecLower = codec.toLowerCase();

	if (codecLower.startsWith('avc1') || codecLower.startsWith('avc3')) {
		if (description?.avcC) {
			const avcC = description.avcC;
			const profile = avcC.AVCProfileIndication.toString(16).padStart(2, '0');
			const compat = avcC.profile_compatibility.toString(16).padStart(2, '0');
			const level = avcC.AVCLevelIndication.toString(16).padStart(2, '0');
			return `avc1.${profile}${compat}${level}`;
		}
		return 'avc1.42E01E';
	}

	if (codecLower === 'vp08' || codecLower === 'vp8') {
		return 'vp8';
	}

	if (codecLower.startsWith('vp09') || codecLower === 'vp9') {
		if (description?.vpcC) {
			const vpcC = description.vpcC;
			return `vp09.${vpcC.profile.toString().padStart(2, '0')}.${vpcC.level.toString().padStart(2, '0')}.${vpcC.bitDepth.toString().padStart(2, '0')}`;
		}
		return 'vp09.00.10.08';
	}

	if (codecLower.startsWith('hvc1') || codecLower.startsWith('hev1')) {
		return null;
	}

	if (codecLower.startsWith('av01')) {
		return null;
	}

	return null;
}

function mapAudioCodec(codec: string): string {
	const codecLower = codec.toLowerCase();
	if (codecLower.startsWith('mp4a')) return 'aac';
	if (codecLower === 'opus') return 'opus';
	if (codecLower === 'vorbis') return 'vorbis';
	if (codecLower === 'flac') return 'flac';
	if (codecLower.startsWith('mp3') || codecLower === '.mp3') return 'mp3';
	return codec;
}

/**
 * Extract audio codec description (AudioSpecificConfig for AAC)
 *
 * The esds box structure is:
 *   esds box
 *     └─ ES_Descriptor (tag 0x03)
 *         └─ DecoderConfigDescriptor (tag 0x04)
 *             └─ DecoderSpecificInfo (tag 0x05) ← This is AudioSpecificConfig
 *
 * mp4box.js parses this into: esds.esd.descs[].descs[].data
 * We need to extract the DecoderSpecificInfo.data, NOT the raw esds.data
 */
function extractAudioCodecDescription(
	description: MP4Sample['description']
): Uint8Array | undefined {
	if (!description) return undefined;

	// @ts-expect-error - accessing internal mp4box structure
	const esds = description.esds;
	if (!esds) return undefined;

	// Method 1: Use mp4box's parsed ESD structure (preferred)
	// esds.esd is an ES_Descriptor with findDescriptor method
	if (esds.esd && typeof esds.esd.findDescriptor === 'function') {
		// DecoderConfigDescriptor tag = 0x04
		const dcd = esds.esd.findDescriptor(0x04);
		if (dcd && typeof dcd.findDescriptor === 'function') {
			// DecoderSpecificInfo tag = 0x05
			const dsi = dcd.findDescriptor(0x05);
			if (dsi?.data) {
				return new Uint8Array(dsi.data);
			}
		}
	}

	// Method 2: Manually parse esds.data to find DecoderSpecificInfo
	// This is a fallback if mp4box didn't parse the descriptors
	if (esds.data && esds.data.length > 0) {
		const audioConfig = parseDecoderSpecificInfoFromEsds(new Uint8Array(esds.data));
		if (audioConfig) {
			return audioConfig;
		}
	}

	return undefined;
}

/**
 * Parse DecoderSpecificInfo (AudioSpecificConfig) from raw esds data
 *
 * ESDS descriptor structure:
 * - Tag (1 byte): 0x03 = ES_Descriptor, 0x04 = DecoderConfigDescriptor, 0x05 = DecoderSpecificInfo
 * - Size (1-4 bytes): variable length encoding (high bit = continuation)
 * - Data
 */
function parseDecoderSpecificInfoFromEsds(data: Uint8Array): Uint8Array | null {
	let offset = 0;

	// Helper to read descriptor header (tag + size)
	const readDescriptorHeader = (): { tag: number; size: number } | null => {
		if (offset >= data.length) return null;

		const tag = data[offset++];
		if (tag === undefined) return null;

		let size = 0;
		let byte = data[offset++];
		if (byte === undefined) return null;

		// Size is encoded with high bit as continuation flag
		while (byte & 0x80) {
			size = (size << 7) | (byte & 0x7f);
			byte = data[offset++];
			if (byte === undefined) return null;
		}
		size = (size << 7) | (byte & 0x7f);

		return { tag, size };
	};

	// Parse ES_Descriptor (tag 0x03)
	const esDesc = readDescriptorHeader();
	if (!esDesc || esDesc.tag !== 0x03) return null;

	// Skip ES_ID (2 bytes) and flags (1 byte)
	offset += 3;

	// Parse DecoderConfigDescriptor (tag 0x04)
	const dcd = readDescriptorHeader();
	if (!dcd || dcd.tag !== 0x04) return null;

	// Skip objectTypeIndication (1), streamType+upStream+reserved (1), bufferSizeDB (3), maxBitrate (4), avgBitrate (4)
	offset += 13;

	// Parse DecoderSpecificInfo (tag 0x05)
	const dsi = readDescriptorHeader();
	if (!dsi || dsi.tag !== 0x05) return null;

	// Extract AudioSpecificConfig
	if (offset + dsi.size <= data.length) {
		return data.slice(offset, offset + dsi.size);
	}

	return null;
}

function extractCodecDescription(
	description: MP4Sample['description']
): Uint8Array | undefined {
	if (!description) return undefined;

	if (description.avcC) {
		const avcC = description.avcC;

		// Log if there are multiple SPS/PPS (potential issue)
		if (avcC.SPS.length > 1 || avcC.PPS.length > 1) {
			console.warn(`[MP4Demuxer] Multiple SPS/PPS detected: ${avcC.SPS.length} SPS, ${avcC.PPS.length} PPS`);
		}

		const sps = avcC.SPS[0];
		const pps = avcC.PPS[0];

		if (sps && pps) {
			const spsData = sps.nalu;
			const ppsData = pps.nalu;

			// Build proper avcC box with correct lengthSizeMinusOne
			const avcCData = new Uint8Array(11 + spsData.length + ppsData.length);
			let offset = 0;

			avcCData[offset++] = 1; // configurationVersion
			avcCData[offset++] = avcC.AVCProfileIndication;
			avcCData[offset++] = avcC.profile_compatibility;
			avcCData[offset++] = avcC.AVCLevelIndication;
			// lengthSizeMinusOne is stored in lower 2 bits, upper 6 bits are reserved (0xFF)
			avcCData[offset++] = 0xfc | (avcC.lengthSizeMinusOne ?? 3);
			// numOfSequenceParameterSets is stored in lower 5 bits, upper 3 bits are reserved (0xE0)
			avcCData[offset++] = 0xe0 | 1;
			avcCData[offset++] = (spsData.length >> 8) & 0xff;
			avcCData[offset++] = spsData.length & 0xff;
			avcCData.set(spsData, offset);
			offset += spsData.length;
			avcCData[offset++] = 1; // numOfPictureParameterSets
			avcCData[offset++] = (ppsData.length >> 8) & 0xff;
			avcCData[offset++] = ppsData.length & 0xff;
			avcCData.set(ppsData, offset);

			return avcCData;
		}
	}

	return undefined;
}

function calculateFps(track: MP4VideoTrack): number {
	if (track.nb_samples > 0 && track.duration > 0) {
		return (track.nb_samples * track.timescale) / track.duration;
	}
	return 30;
}

// =============================================================================
// MP4Demuxer Class - On-demand Loading Model
// =============================================================================

export class MP4Demuxer implements IDemuxer {
	private _config: MP4DemuxerConfig;
	private _mp4File: MP4File | null = null;
	private _mediaInfo: DemuxedMediaInfo | null = null;
	private _abortController: AbortController | null = null;
	private _initialized = false;

	// Track info
	private _videoTrackId: number | null = null;
	private _videoDescription: MP4Sample['description'] | null = null;
	private _audioTrackId: number | null = null;
	private _audioDescription: MP4Sample['description'] | null = null;

	// Sample index (loaded from moov)
	private _sampleIndex: SampleInfo[] = [];
	private _keyframeIndex: number[] = [];  // Indices of keyframes in _sampleIndex
	private _idrFrameIndex: number[] = [];  // Indices of IDR frames (true random access points)
	private _idrFrameChecked = false;  // Whether IDR frames have been identified

	// Audio sample index
	private _audioSampleIndex: AudioSampleInfo[] = [];

	// Loaded byte ranges (for tracking what's in memory)
	private _loadedRanges: Array<{ start: number; end: number }> = [];

	// Loaded data chunks (for manual sample extraction)
	private _loadedData: Map<number, ArrayBuffer> = new Map();

	// File size (from Content-Length)
	private _fileSize: number = 0;

	// NAL unit length size (from avcC, usually 4 bytes)
	private _nalLengthSize: number = 4;

	// avcC data for SPS/PPS extraction (used in Annex B mode)
	private _avcCData: Uint8Array | null = null;

	// Detected video format mode (resolved from 'auto')
	private _resolvedVideoFormat: 'avcc' | 'annexb' = 'avcc';

	// Whether multiple SPS/PPS were detected (suggests Annex B might be needed)
	private _hasMultipleSPSPPS = false;

	// Fragment info for fragmented MP4 (from mfra/tfra box)
	private _fragmentInfo: Array<{ time: number; moofOffset: number }> = [];
	private _isFragmented = false;
	private _loadedFragmentOffsets: Set<number> = new Set();

	// Callbacks
	onVideoConfig?: (config: VideoDecoderConfig) => void;
	onError?: (error: Error) => void;

	constructor(config: MP4DemuxerConfig) {
		this._config = config;
	}

	// ===========================================================================
	// Public Methods
	// ===========================================================================

	/**
	 * Initialize demuxer - loads moov and builds sample index
	 */
	async initialize(): Promise<DemuxedMediaInfo> {
		if (this._initialized && this._mediaInfo) {
			return this._mediaInfo;
		}

		this._mp4File = createFile();
		this._abortController = new AbortController();

		// Set up callbacks
		this._mp4File.onReady = (info: MP4Info) => {
			this._handleReady(info);
		};

		this._mp4File.onError = (error: Error) => {
			console.error('[MP4Demuxer] Error:', error);
			this.onError?.(error);
		};

		// Load initial chunk to get moov
		const initialSize = this._config.initialLoadSize ?? 2 * 1024 * 1024;
		await this._loadRange(0, initialSize - 1);

		// If moov not found, try loading more or from end (moov can be at end of file)
		if (!this._mediaInfo) {
			// Try loading last 2MB (moov might be at end)
			if (this._fileSize > initialSize) {
				const endStart = Math.max(0, this._fileSize - 2 * 1024 * 1024);
				await this._loadRange(endStart, this._fileSize - 1);
			}
		}

		if (!this._mediaInfo) {
			throw new Error('Failed to parse media info - moov not found');
		}

		this._initialized = true;

		return this._mediaInfo;
	}

	/**
	 * Get sample index for a given time
	 * Returns the sample index at or before the target time (for accurate seeking)
	 */
	getSampleIndexAtTime(time: number): number {
		if (this._sampleIndex.length === 0) return -1;

		const timescale = this._sampleIndex[0]?.timescale ?? 1;
		const targetCts = time * timescale;

		// Binary search for the last sample with cts <= targetCts
		// This ensures we get a sample AT or BEFORE the target time
		let left = 0;
		let right = this._sampleIndex.length - 1;
		let result = 0;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const sample = this._sampleIndex[mid];
			if (!sample) break;

			if (sample.cts <= targetCts) {
				result = mid; // This sample is valid, try to find a later one
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		return result;
	}

	/**
	 * Find the nearest keyframe at or before the given sample index
	 */
	findNearestKeyframe(sampleIndex: number): number {
		// Binary search in keyframe index
		let left = 0;
		let right = this._keyframeIndex.length - 1;

		while (left < right) {
			const mid = Math.ceil((left + right) / 2);
			const keyframeIdx = this._keyframeIndex[mid];
			if (keyframeIdx === undefined) break;

			if (keyframeIdx <= sampleIndex) {
				left = mid;
			} else {
				right = mid - 1;
			}
		}

		return this._keyframeIndex[left] ?? 0;
	}

	/**
	 * Get all keyframe times in the video
	 * Returns sync sample times (fast path, no IDR checking)
	 * @returns Array of keyframe times in seconds, sorted ascending
	 */
	async getKeyframeTimes(): Promise<number[]> {
		// Return sync sample times directly (fast path)
		// The decoder will handle IDR/non-IDR frames appropriately
		const times = this._keyframeIndex.map(idx => this.getSampleTime(idx));
		console.log(`[MP4Demuxer] getKeyframeTimes: returning ${times.length} sync frame times`);
		return times;
	}

	/**
	 * Get all sync sample times (mp4box is_sync flag)
	 * Note: These may include non-IDR frames in Open GOP videos
	 * Use getKeyframeTimes() for reliable random access points
	 * @returns Array of sync sample times in seconds, sorted ascending
	 */
	getSyncSampleTimes(): number[] {
		return this._keyframeIndex.map(idx => this.getSampleTime(idx));
	}

	/**
	 * Find the nearest keyframe time to the given time
	 * For Open GOP videos, returns the nearest IDR frame time (if IDR index is built)
	 * to ensure the frame can be decoded after decoder reset
	 *
	 * @param time Target time in seconds
	 * @returns Time of the nearest keyframe (at or before target)
	 */
	getNearestKeyframeTime(time: number): number {
		// If IDR index is built and has entries, use it for reliable random access
		// This is critical for Open GOP videos where non-IDR I-frames cannot be
		// decoded independently after decoder reset
		if (this._idrFrameChecked && this._idrFrameIndex.length > 0) {
			return this._findNearestIDRTimeSync(time);
		}

		// Fallback to sync frame index (for non-Open GOP videos or before IDR index is built)
		const sampleIdx = this.getSampleIndexAtTime(time);
		const keyframeSampleIdx = this.findNearestKeyframe(sampleIdx);
		return this.getSampleTime(keyframeSampleIdx);
	}

	/**
	 * Synchronous version of findNearestIDRTime
	 * Assumes IDR index is already built (_idrFrameChecked === true)
	 */
	private _findNearestIDRTimeSync(time: number): number {
		if (this._idrFrameIndex.length === 0) {
			return 0;
		}

		// Binary search for nearest IDR at or before time
		const targetSampleIdx = this.getSampleIndexAtTime(time);

		let left = 0;
		let right = this._idrFrameIndex.length - 1;

		while (left < right) {
			const mid = Math.ceil((left + right) / 2);
			const idrIdx = this._idrFrameIndex[mid];
			if (idrIdx === undefined) break;

			if (idrIdx <= targetSampleIdx) {
				left = mid;
			} else {
				right = mid - 1;
			}
		}

		const idrSampleIdx = this._idrFrameIndex[left];
		if (idrSampleIdx === undefined) {
			return 0;
		}

		return this.getSampleTime(idrSampleIdx);
	}

	/**
	 * Find the next keyframe after the given time
	 * Returns the time of the next keyframe, or -1 if not found
	 */
	getNextKeyframeTime(time: number): number {
		const currentSampleIdx = this.getSampleIndexAtTime(time);
		const currentKeyframeIdx = this.findNearestKeyframe(currentSampleIdx);

		// Find the index of current keyframe in keyframe index
		const keyframeListIdx = this._keyframeIndex.indexOf(currentKeyframeIdx);
		if (keyframeListIdx < 0 || keyframeListIdx >= this._keyframeIndex.length - 1) {
			return -1;
		}

		// Get next keyframe
		const nextKeyframeSampleIdx = this._keyframeIndex[keyframeListIdx + 1];
		if (nextKeyframeSampleIdx === undefined) {
			return -1;
		}

		return this.getSampleTime(nextKeyframeSampleIdx);
	}

	/**
	 * Check if a keyframe at the given time is an IDR frame
	 * IDR frames are true random access points that can be decoded after decoder reset
	 * Non-IDR I-frames (Open GOP) require decoder state from previous frames
	 *
	 * @param time Time in seconds
	 * @returns true if the keyframe is IDR, false if non-IDR or not a keyframe
	 */
	async isIDRFrameAt(time: number): Promise<boolean> {
		const sampleIdx = this.getSampleIndexAtTime(time);
		const keyframeSampleIdx = this.findNearestKeyframe(sampleIdx);

		// If IDR index is already built, use it for fast lookup
		if (this._idrFrameChecked) {
			return this._idrFrameIndex.includes(keyframeSampleIdx);
		}

		// Load sample data if needed
		await this._loadSamplesRange(keyframeSampleIdx, keyframeSampleIdx);

		const sampleInfo = this._sampleIndex[keyframeSampleIdx];
		if (!sampleInfo || !sampleInfo.is_sync) {
			return false;
		}

		const sampleData = this._extractSampleData(sampleInfo.offset, sampleInfo.size);
		if (!sampleData) {
			return false;
		}

		// Check if it's an IDR frame
		return isIDRFrame(sampleData, 4); // Assuming 4-byte NAL length prefix
	}

	/**
	 * Find the nearest IDR frame at or before the given time
	 * This is useful for seeking in Open GOP videos where non-IDR keyframes
	 * cannot be decoded after decoder reset
	 *
	 * @param time Time in seconds
	 * @returns Time of nearest IDR frame, or 0 if not found (first frame is usually IDR)
	 */
	async findNearestIDRTime(time: number): Promise<number> {
		// Build IDR index if not already done
		if (!this._idrFrameChecked) {
			await this._buildIDRIndex();
		}

		if (this._idrFrameIndex.length === 0) {
			// No IDR frames found, return 0 (first frame)
			return 0;
		}

		// Binary search for nearest IDR at or before time
		const targetSampleIdx = this.getSampleIndexAtTime(time);

		let left = 0;
		let right = this._idrFrameIndex.length - 1;

		while (left < right) {
			const mid = Math.ceil((left + right) / 2);
			const idrIdx = this._idrFrameIndex[mid];
			if (idrIdx === undefined) break;

			if (idrIdx <= targetSampleIdx) {
				left = mid;
			} else {
				right = mid - 1;
			}
		}

		const idrSampleIdx = this._idrFrameIndex[left];
		if (idrSampleIdx === undefined) {
			return 0;
		}

		return this.getSampleTime(idrSampleIdx);
	}

	/**
	 * Build IDR frame index by checking NAL unit types of all keyframes
	 * This is called lazily when IDR information is first needed
	 */
	private async _buildIDRIndex(): Promise<void> {
		if (this._idrFrameChecked) {
			return;
		}

		this._idrFrameIndex = [];

		// Use the configured NAL length size (default to 4 if not set yet)
		const nalLengthSize = this._nalLengthSize || 4;

		for (const keyframeSampleIdx of this._keyframeIndex) {
			const sampleInfo = this._sampleIndex[keyframeSampleIdx];
			if (!sampleInfo) continue;

			// Load sample data
			await this._loadSamplesRange(keyframeSampleIdx, keyframeSampleIdx);

			const sampleData = this._extractSampleData(sampleInfo.offset, sampleInfo.size);
			if (!sampleData) continue;

			// Check if it's an IDR frame
			if (isIDRFrame(sampleData, nalLengthSize, false)) {
				this._idrFrameIndex.push(keyframeSampleIdx);
			}
		}

		this._idrFrameChecked = true;

		// Warn if this is an Open GOP video
		if (this._idrFrameIndex.length < this._keyframeIndex.length) {
			console.warn(`[MP4Demuxer] Open GOP detected: only ${this._idrFrameIndex.length}/${this._keyframeIndex.length} keyframes are IDR`);
		}
	}

	/**
	 * Get video chunks for a time range (on-demand loading)
	 * Loads from nearest keyframe to ensure decodability
	 * For fragmented MP4, loads fragments on-demand when seeking beyond loaded data
	 *
	 * @param time Target time in seconds
	 * @param count Number of samples to return after target time
	 */
	async getVideoChunksAt(
		time: number,
		count: number = 16
	): Promise<EncodedVideoChunk[]> {
		if (!this._mp4File || !this._mediaInfo?.video) {
			throw new Error('Demuxer not initialized');
		}

		// For fragmented MP4, check if we need to load a fragment for this time
		if (this._isFragmented && this._fragmentInfo.length > 0) {
			await this._ensureFragmentLoaded(time);
		}

		const targetSampleIdx = this.getSampleIndexAtTime(time);
		if (targetSampleIdx < 0) {
			return [];
		}

		// In Annex B mode, we need to start from a true IDR frame
		// because WebCodecs requires IDR to start decoding
		const useAnnexB = this._resolvedVideoFormat === 'annexb';

		// Find nearest keyframe before target
		let keyframeSampleIdx = this.findNearestKeyframe(targetSampleIdx);

		// In Annex B mode, ensure we start from an IDR frame
		if (useAnnexB) {
			// Build IDR index if not already done
			if (!this._idrFrameChecked) {
				await this._buildIDRIndex();
			}

			// Find nearest IDR frame at or before the keyframe
			if (this._idrFrameIndex.length > 0) {
				let idrIdx = 0;
				for (let i = this._idrFrameIndex.length - 1; i >= 0; i--) {
					const idx = this._idrFrameIndex[i];
					if (idx !== undefined && idx <= keyframeSampleIdx) {
						idrIdx = idx;
						break;
					}
				}
				if (idrIdx !== keyframeSampleIdx) {
					keyframeSampleIdx = idrIdx;
				}
			}
		}

		// Verify the keyframe sample is actually a sync sample
		// If not, search backward for a valid keyframe
		let keyframeSample = this._sampleIndex[keyframeSampleIdx];
		if (keyframeSample && !keyframeSample.is_sync) {
			console.warn(`[MP4Demuxer] Sample ${keyframeSampleIdx} in keyframe index but is_sync=false, searching backward...`);
			// Search backward in keyframe index
			const keyframeIdxInList = this._keyframeIndex.indexOf(keyframeSampleIdx);
			if (keyframeIdxInList > 0) {
				const prevKeyframeIdx = this._keyframeIndex[keyframeIdxInList - 1];
				if (prevKeyframeIdx !== undefined) {
					keyframeSampleIdx = prevKeyframeIdx;
					keyframeSample = this._sampleIndex[keyframeSampleIdx];
				}
			}
		}

		// Calculate range to load: from keyframe to target + count samples AFTER target
		// This ensures we decode all frames from keyframe through target and beyond
		const endSampleIdx = Math.min(
			targetSampleIdx + count,
			this._sampleIndex.length - 1
		);

		// Load sample data if needed
		await this._loadSamplesRange(keyframeSampleIdx, endSampleIdx);

		// Get description from first sample in trak (for video config)
		if (!this._videoDescription) {
			const trak = this._mp4File.getTrackById(this._videoTrackId!);
			// @ts-expect-error - accessing internal mp4box structure
			const firstSample = trak?.samples?.[0];
			if (firstSample?.description) {
				this._videoDescription = firstSample.description;
				this._sendVideoConfig(firstSample.description);
			}
		}

		// Extract ALL chunks from keyframe to end (no count limit in loop)
		const chunks: EncodedVideoChunk[] = [];
		let foundFirstKeyframe = false;

		for (let i = keyframeSampleIdx; i <= endSampleIdx; i++) {
			const sampleInfo = this._sampleIndex[i];
			if (!sampleInfo) continue;

			// Verify first sample is actually a keyframe
			// If not, skip until we find one (handles index inconsistency)
			if (!foundFirstKeyframe) {
				if (!sampleInfo.is_sync) {
					console.warn(`[MP4Demuxer] Sample ${i} expected to be keyframe but is_sync=false, searching forward...`);
					continue;
				}
				foundFirstKeyframe = true;
			}

			// Manually extract sample data from loaded ArrayBuffer
			let sampleData = this._extractSampleData(sampleInfo.offset, sampleInfo.size);
			if (!sampleData) {
				console.warn(`[MP4Demuxer] Sample ${i} data not available after loading`);
				continue;
			}

			// In Annex B mode, convert AVCC to Annex B format
			const useAnnexB = this._resolvedVideoFormat === 'annexb';
			// Determine chunk type: in Annex B mode, use actual NAL type; otherwise use is_sync
			let chunkType: 'key' | 'delta' = sampleInfo.is_sync ? 'key' : 'delta';

			if (useAnnexB) {
				// In Annex B mode, check actual NAL type for keyframes
				// WebCodecs requires true IDR frames to be marked as 'key'
				if (sampleInfo.is_sync) {
					const hasIDR = isIDRFrame(sampleData, this._nalLengthSize);
					if (!hasIDR) {
						// This is a non-IDR I-frame (Open GOP), mark as delta
						// The decoder will need to decode from a previous IDR
						chunkType = 'delta';
					}
				}

				// Convert AVCC (length-prefixed) to Annex B (start code prefixed)
				const annexBData = avccToAnnexB(sampleData, this._nalLengthSize);

				// For true IDR keyframes, prepend SPS/PPS from avcC
				if (chunkType === 'key' && this._avcCData) {
					const spsPps = extractSPSPPSFromAvcC(this._avcCData);
					if (spsPps) {
						// Combine SPS/PPS + frame data
						const combined = new Uint8Array(spsPps.length + annexBData.length);
						combined.set(spsPps, 0);
						combined.set(annexBData, spsPps.length);
						sampleData = combined;
					} else {
						sampleData = annexBData;
					}
				} else {
					sampleData = annexBData;
				}
			}

			const chunk = new EncodedVideoChunk({
				type: chunkType,
				timestamp: (sampleInfo.cts * 1_000_000) / sampleInfo.timescale,
				duration: (sampleInfo.duration * 1_000_000) / sampleInfo.timescale,
				data: sampleData,
			});

			chunks.push(chunk);
		}

		// Warn if no keyframe was found
		if (!foundFirstKeyframe && chunks.length === 0) {
			console.error(`[MP4Demuxer] No keyframe found starting from sample ${keyframeSampleIdx}`);
		}

		return chunks;
	}

	/**
	 * Get a single sample at specific index
	 */
	async getSampleAt(sampleIndex: number): Promise<EncodedVideoChunk | null> {
		if (!this._mp4File || !this._mediaInfo?.video || !this._videoTrackId) {
			return null;
		}

		const sampleInfo = this._sampleIndex[sampleIndex];
		if (!sampleInfo) {
			return null;
		}

		// Load sample data if needed
		await this._loadSamplesRange(sampleIndex, sampleIndex);

		// Get description from trak if needed
		if (!this._videoDescription) {
			const trak = this._mp4File.getTrackById(this._videoTrackId);
			// @ts-expect-error - accessing internal mp4box structure
			const firstSample = trak?.samples?.[0];
			if (firstSample?.description) {
				this._videoDescription = firstSample.description;
				this._sendVideoConfig(firstSample.description);
			}
		}

		// Manually extract sample data
		const sampleData = this._extractSampleData(sampleInfo.offset, sampleInfo.size);
		if (!sampleData) {
			return null;
		}

		const chunk = new EncodedVideoChunk({
			type: sampleInfo.is_sync ? 'key' : 'delta',
			timestamp: (sampleInfo.cts * 1_000_000) / sampleInfo.timescale,
			duration: (sampleInfo.duration * 1_000_000) / sampleInfo.timescale,
			data: sampleData,
		});

		return chunk;
	}

	/**
	 * Get sample info without loading data
	 */
	getSampleInfo(sampleIndex: number): SampleInfo | null {
		return this._sampleIndex[sampleIndex] ?? null;
	}

	/**
	 * Get time for a sample index
	 */
	getSampleTime(sampleIndex: number): number {
		const sample = this._sampleIndex[sampleIndex];
		if (!sample) return 0;
		return sample.cts / sample.timescale;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = null;
		}

		if (this._mp4File) {
			this._mp4File.flush();
			this._mp4File = null;
		}

		this._mediaInfo = null;
		this._initialized = false;
		this._videoTrackId = null;
		this._videoDescription = null;
		this._audioTrackId = null;
		this._audioDescription = null;
		this._sampleIndex = [];
		this._keyframeIndex = [];
		this._audioSampleIndex = [];
		this._loadedRanges = [];
		this._loadedData.clear();
	}

	// ===========================================================================
	// Getters
	// ===========================================================================

	get mediaInfo(): DemuxedMediaInfo | null {
		return this._mediaInfo;
	}

	get isInitialized(): boolean {
		return this._initialized;
	}

	get sampleCount(): number {
		return this._sampleIndex.length;
	}

	get keyframeCount(): number {
		return this._keyframeIndex.length;
	}

	get audioSampleCount(): number {
		return this._audioSampleIndex.length;
	}

	get isFragmented(): boolean {
		return this._isFragmented;
	}

	/**
	 * Set fragment info for fragmented MP4
	 * This enables on-demand loading of fragments when seeking
	 * @param fragments Array of fragment info (time and moof offset)
	 */
	setFragmentInfo(fragments: Array<{ time: number; moofOffset: number }>): void {
		this._fragmentInfo = fragments;
		this._isFragmented = fragments.length > 0;

		// Mark fragments that are already within loaded ranges as loaded
		// This is important because the first fragment(s) may have been loaded during initialization
		for (const frag of fragments) {
			if (this._isRangeLoaded(frag.moofOffset, frag.moofOffset + 8)) {
				this._loadedFragmentOffsets.add(frag.moofOffset);
			}
		}

		const alreadyLoaded = this._loadedFragmentOffsets.size;
		console.log(`[MP4Demuxer] Set ${fragments.length} fragment entries for on-demand loading (${alreadyLoaded} already loaded)`);
	}

	// ===========================================================================
	// Audio Methods
	// ===========================================================================

	/**
	 * Get audio samples at a given time range
	 * Returns encoded audio samples ready for decoding
	 *
	 * @param time Start time in seconds
	 * @param duration Duration in seconds
	 */
	async getAudioSamplesAt(
		time: number,
		duration: number
	): Promise<EncodedAudioSample[]> {
		if (!this._mp4File || !this._mediaInfo?.audio || !this._audioTrackId) {
			return [];
		}

		if (this._audioSampleIndex.length === 0) {
			console.warn('[MP4Demuxer] No audio sample index');
			return [];
		}

		const timescale = this._audioSampleIndex[0]?.timescale ?? 1;
		const startCts = time * timescale;
		const endCts = (time + duration) * timescale;

		// Find first sample at or before start time
		let startIdx = 0;
		for (let i = 0; i < this._audioSampleIndex.length; i++) {
			const sample = this._audioSampleIndex[i];
			if (sample && sample.cts >= startCts) {
				startIdx = Math.max(0, i - 1);
				break;
			}
		}

		// Find last sample before end time
		let endIdx = this._audioSampleIndex.length - 1;
		for (let i = startIdx; i < this._audioSampleIndex.length; i++) {
			const sample = this._audioSampleIndex[i];
			if (sample && sample.cts > endCts) {
				endIdx = i;
				break;
			}
		}

		// Load sample data
		await this._loadAudioSamplesRange(startIdx, endIdx);

		// Extract samples
		const samples: EncodedAudioSample[] = [];
		for (let i = startIdx; i <= endIdx; i++) {
			const sampleInfo = this._audioSampleIndex[i];
			if (!sampleInfo) continue;

			const sampleData = this._extractSampleData(sampleInfo.offset, sampleInfo.size);
			if (!sampleData) {
				console.warn(`[MP4Demuxer] Audio sample ${i} data not available`);
				continue;
			}

			samples.push({
				data: sampleData,
				timestamp: (sampleInfo.cts * 1_000_000) / sampleInfo.timescale,
				duration: (sampleInfo.duration * 1_000_000) / sampleInfo.timescale,
				isKeyframe: sampleInfo.is_sync,
			});
		}

		return samples;
	}

	/**
	 * Get audio codec description for decoder initialization
	 */
	getAudioDescription(): AudioDescription | null {
		if (!this._mediaInfo?.audio) {
			return null;
		}

		const codecDescription = this._audioDescription
			? extractAudioCodecDescription(this._audioDescription)
			: undefined;

		return {
			codec: this._mediaInfo.audio.codec,
			sampleRate: this._mediaInfo.audio.sampleRate,
			channelCount: this._mediaInfo.audio.channelCount,
			description: codecDescription,
		};
	}

	/**
	 * Load audio sample data for a range of samples
	 */
	private async _loadAudioSamplesRange(startIdx: number, endIdx: number): Promise<void> {
		if (startIdx < 0 || endIdx >= this._audioSampleIndex.length) {
			return;
		}

		let minOffset = Infinity;
		let maxOffset = 0;

		for (let i = startIdx; i <= endIdx; i++) {
			const sample = this._audioSampleIndex[i];
			if (!sample) continue;

			minOffset = Math.min(minOffset, sample.offset);
			maxOffset = Math.max(maxOffset, sample.offset + sample.size);
		}

		if (minOffset === Infinity) {
			return;
		}

		await this._loadRange(minOffset, maxOffset - 1);
	}

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	/**
	 * Load a byte range from the source
	 * Uses Extension Host file reading if filePath is configured, otherwise falls back to fetch
	 */
	private async _loadRange(start: number, end: number): Promise<void> {
		// Check if already loaded
		if (this._isRangeLoaded(start, end)) {
			return;
		}

		const requestedSize = end - start + 1;
		console.log(`[MP4Demuxer] _loadRange: requesting bytes=${start}-${end} (${requestedSize} bytes)`);

		let data: ArrayBuffer;

		// Use Extension Host file reading if filePath is configured
		if (this._config.filePath) {
			console.log(`[MP4Demuxer] _loadRange: using Extension Host for ${this._config.filePath}`);
			try {
				data = await readFileRangeCached(this._config.filePath, start, end);
				// File size is set by the cache mechanism, but we need to get it
				// For now, we'll set it based on the data we receive on first load
				if (this._fileSize === 0 && start === 0) {
					// The cached data might be the entire file
					this._fileSize = data.byteLength;
				}
				console.log(`[MP4Demuxer] _loadRange: Extension Host returned ${data.byteLength} bytes`);
			} catch (error) {
				console.error(`[MP4Demuxer] _loadRange: Extension Host failed, falling back to fetch:`, error);
				// Fall back to fetch
				data = await this._fetchRange(start, end);
			}
		} else {
			// Use fetch (original behavior)
			data = await this._fetchRange(start, end);
		}

		const buffer = data as MP4ArrayBuffer;
		buffer.fileStart = start;

		// Debug: Log actual received data size
		console.log(`[MP4Demuxer] _loadRange: received ${data.byteLength} bytes (requested ${requestedSize} bytes)`);

		// Store for manual sample extraction
		this._loadedData.set(start, data);

		this._mp4File?.appendBuffer(buffer);
		this._markRangeLoaded(start, start + data.byteLength - 1);
	}

	/**
	 * Fetch a byte range using fetch API (original implementation)
	 */
	private async _fetchRange(start: number, end: number): Promise<ArrayBuffer> {
		const response = await fetch(this._config.source, {
			headers: { Range: `bytes=${start}-${end}` },
			signal: this._abortController?.signal,
		});

		// Debug: Log response status and headers
		console.log(`[MP4Demuxer] _fetchRange response: status=${response.status}, Content-Length=${response.headers.get('Content-Length')}, Content-Range=${response.headers.get('Content-Range')}`);

		if (!response.ok && response.status !== 206) {
			throw new Error(`Failed to fetch range: ${response.status}`);
		}

		// Get file size from Content-Range header
		const contentRange = response.headers.get('Content-Range');
		if (contentRange) {
			const match = contentRange.match(/\/(\d+)/);
			if (match) {
				this._fileSize = parseInt(match[1]!, 10);
			}
		}

		return response.arrayBuffer();
	}

	/**
	 * Load sample data for a range of samples
	 */
	private async _loadSamplesRange(startIdx: number, endIdx: number): Promise<void> {
		if (startIdx < 0 || endIdx >= this._sampleIndex.length) {
			return;
		}

		// Calculate byte range needed
		let minOffset = Infinity;
		let maxOffset = 0;

		for (let i = startIdx; i <= endIdx; i++) {
			const sample = this._sampleIndex[i];
			if (!sample) continue;

			minOffset = Math.min(minOffset, sample.offset);
			maxOffset = Math.max(maxOffset, sample.offset + sample.size);
		}

		if (minOffset === Infinity) {
			return;
		}

		// Load the range
		await this._loadRange(minOffset, maxOffset - 1);
	}

	/**
	 * Ensure the fragment containing the target time is loaded
	 * For fragmented MP4, loads moof+mdat on-demand and rebuilds sample index
	 * Note: We need to load ALL fragments up to the target time because
	 * mp4box.js needs them in order to build the sample index correctly
	 */
	private async _ensureFragmentLoaded(time: number): Promise<void> {
		if (!this._isFragmented || this._fragmentInfo.length === 0) {
			return;
		}

		// Find the fragment that contains this time
		// Fragments are sorted by time, find the last one with time <= target
		let targetFragmentIndex = -1;
		for (let i = this._fragmentInfo.length - 1; i >= 0; i--) {
			const frag = this._fragmentInfo[i];
			if (frag && frag.time <= time) {
				targetFragmentIndex = i;
				break;
			}
		}

		if (targetFragmentIndex < 0) {
			// Time is before first fragment, use first fragment
			targetFragmentIndex = 0;
		}

		// Load all fragments from the first unloaded one up to the target
		// This is necessary because mp4box.js needs fragments in order
		let fragmentsLoaded = 0;
		for (let i = 0; i <= targetFragmentIndex; i++) {
			const frag = this._fragmentInfo[i];
			if (!frag) continue;

			// Skip if already loaded
			if (this._loadedFragmentOffsets.has(frag.moofOffset)) {
				continue;
			}

			console.log(`[MP4Demuxer] Loading fragment ${i + 1}/${targetFragmentIndex + 1} at offset ${frag.moofOffset} for time ${time.toFixed(3)}s`);

			// Load the fragment (moof + mdat)
			await this._loadFragment(frag.moofOffset);

			// Mark as loaded
			this._loadedFragmentOffsets.add(frag.moofOffset);
			fragmentsLoaded++;
		}

		// Rebuild sample index after loading new fragments
		if (fragmentsLoaded > 0 && this._videoTrackId && this._mp4File) {
			const trak = this._mp4File.getTrackById(this._videoTrackId);
			if (trak) {
				this._rebuildSampleIndex();
			}
		}
	}

	/**
	 * Load a fragment (moof + mdat) from the given offset
	 */
	private async _loadFragment(moofOffset: number): Promise<void> {
		// First, load the moof box header to get its size
		const HEADER_SIZE = 8;
		await this._loadRange(moofOffset, moofOffset + HEADER_SIZE - 1);

		// Parse moof box size
		const headerData = this._extractSampleData(moofOffset, HEADER_SIZE);
		if (!headerData) {
			console.warn(`[MP4Demuxer] Failed to read moof header at offset ${moofOffset}`);
			return;
		}

		const view = new DataView(headerData.buffer, headerData.byteOffset, headerData.byteLength);
		const moofSize = view.getUint32(0);
		const boxType = String.fromCharCode(
			headerData[4] ?? 0,
			headerData[5] ?? 0,
			headerData[6] ?? 0,
			headerData[7] ?? 0
		);

		if (boxType !== 'moof') {
			console.warn(`[MP4Demuxer] Expected moof box at offset ${moofOffset}, got ${boxType}`);
			return;
		}

		// Load the entire moof box
		await this._loadRange(moofOffset, moofOffset + moofSize - 1);

		// Now load the mdat box that follows
		const mdatOffset = moofOffset + moofSize;
		await this._loadRange(mdatOffset, mdatOffset + HEADER_SIZE - 1);

		const mdatHeaderData = this._extractSampleData(mdatOffset, HEADER_SIZE);
		if (!mdatHeaderData) {
			console.warn(`[MP4Demuxer] Failed to read mdat header at offset ${mdatOffset}`);
			return;
		}

		const mdatView = new DataView(mdatHeaderData.buffer, mdatHeaderData.byteOffset, mdatHeaderData.byteLength);
		const mdatSize = mdatView.getUint32(0);
		const mdatType = String.fromCharCode(
			mdatHeaderData[4] ?? 0,
			mdatHeaderData[5] ?? 0,
			mdatHeaderData[6] ?? 0,
			mdatHeaderData[7] ?? 0
		);

		if (mdatType !== 'mdat') {
			console.warn(`[MP4Demuxer] Expected mdat box at offset ${mdatOffset}, got ${mdatType}`);
			return;
		}

		// Load the entire mdat box
		// Note: mdat can be large, but we need it for sample data
		console.log(`[MP4Demuxer] Loading mdat box: offset=${mdatOffset}, size=${mdatSize}`);
		await this._loadRange(mdatOffset, mdatOffset + mdatSize - 1);

		console.log(`[MP4Demuxer] Fragment loaded: moof=${moofSize} bytes, mdat=${mdatSize} bytes`);
	}

	/**
	 * Rebuild sample index after loading new fragments
	 * This updates the sample index with samples from newly loaded fragments
	 */
	private _rebuildSampleIndex(): void {
		if (!this._mp4File || !this._videoTrackId) {
			return;
		}

		const trak = this._mp4File.getTrackById(this._videoTrackId);
		if (!trak) {
			return;
		}

		// @ts-expect-error - accessing internal mp4box structure
		const samples = trak.samples as Array<{
			number: number;
			offset: number;
			size: number;
			cts: number;
			dts: number;
			duration: number;
			timescale: number;
			is_sync: boolean;
		}> | undefined;

		if (!samples || samples.length === 0) {
			return;
		}

		const prevSampleCount = this._sampleIndex.length;

		// Detect CTS offset (same logic as _buildSampleIndex)
		let ctsOffset = 0;
		const firstSample = samples[0];
		if (firstSample && firstSample.is_sync) {
			const firstCtsSeconds = firstSample.cts / firstSample.timescale;
			if (firstCtsSeconds > 0.01) {
				ctsOffset = firstSample.cts;
			}
		}

		// Rebuild the entire index
		this._sampleIndex = [];
		this._keyframeIndex = [];

		for (let i = 0; i < samples.length; i++) {
			const s = samples[i];
			if (!s) continue;

			const sampleInfo: SampleInfo = {
				number: s.number,
				offset: s.offset,
				size: s.size,
				cts: s.cts - ctsOffset,
				dts: s.dts,
				duration: s.duration,
				timescale: s.timescale,
				is_sync: s.is_sync,
			};

			this._sampleIndex.push(sampleInfo);

			if (s.is_sync) {
				this._keyframeIndex.push(i);
			}
		}

		if (this._sampleIndex.length > prevSampleCount) {
			console.log(`[MP4Demuxer] Sample index rebuilt: ${prevSampleCount} -> ${this._sampleIndex.length} samples, ${this._keyframeIndex.length} keyframes`);
		}
	}

	/**
	 * Check if a byte range is already loaded
	 */
	private _isRangeLoaded(start: number, end: number): boolean {
		for (const range of this._loadedRanges) {
			if (range.start <= start && range.end >= end) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Mark a byte range as loaded
	 */
	private _markRangeLoaded(start: number, end: number): void {
		// Merge with existing ranges
		const newRanges: Array<{ start: number; end: number }> = [];

		for (const range of this._loadedRanges) {
			if (range.end + 1 >= start && range.start - 1 <= end) {
				// Overlapping or adjacent - merge
				start = Math.min(start, range.start);
				end = Math.max(end, range.end);
			} else {
				newRanges.push(range);
			}
		}

		newRanges.push({ start, end });
		this._loadedRanges = newRanges;
	}

	/**
	 * Extract sample data from loaded ArrayBuffers
	 * @param offset Byte offset in file
	 * @param size Sample size in bytes
	 */
	private _extractSampleData(offset: number, size: number): Uint8Array | null {
		// Find the ArrayBuffer containing this offset
		for (const [bufferStart, buffer] of this._loadedData.entries()) {
			const bufferEnd = bufferStart + buffer.byteLength;

			if (offset >= bufferStart && offset + size <= bufferEnd) {
				// Sample is within this buffer
				const localOffset = offset - bufferStart;
				return new Uint8Array(buffer, localOffset, size);
			}
		}

		// Sample might span multiple buffers (rare) - need to combine
		// For now, return null and let caller handle it
		return null;
	}

	/**
	 * Handle mp4box ready event - build sample index
	 */
	private _handleReady(info: MP4Info): void {
		const videoTrack = info.videoTracks[this._config.videoTrackIndex ?? 0];
		if (videoTrack) {
			this._videoTrackId = videoTrack.id;

			// Build sample index from track
			this._buildSampleIndex(videoTrack);

			// Set extraction options (needed for sample data to be loaded)
			this._mp4File?.setExtractionOptions(videoTrack.id, null, {
				nbSamples: 1,
			});
		}

		const audioTrack = info.audioTracks[this._config.audioTrackIndex ?? 0];
		if (audioTrack) {
			this._audioTrackId = audioTrack.id;
			this._buildAudioSampleIndex(audioTrack);

			// Extract audio description for decoder initialization
			const trak = this._mp4File?.getTrackById(audioTrack.id);
			if (trak) {
				// @ts-expect-error - accessing internal mp4box structure
				const firstSample = trak.samples?.[0];
				if (firstSample?.description) {
					this._audioDescription = firstSample.description;
				}
			}
		}

		this._mediaInfo = this._buildMediaInfo(info, videoTrack, audioTrack);
	}

	/**
	 * Build sample index from track info
	 */
	private _buildSampleIndex(track: MP4VideoTrack): void {
		this._sampleIndex = [];
		this._keyframeIndex = [];

		console.log(`[MP4Demuxer] _buildSampleIndex called for track ${track.id}`);

		// mp4box stores samples in track.samples after setExtractionOptions
		// But we need to access the raw sample table from the track
		const trak = this._mp4File?.getTrackById(track.id);
		if (!trak) {
			console.warn('[MP4Demuxer] Track not found for building index');
			return;
		}

		// Access sample table - this is internal mp4box structure
		// @ts-expect-error - accessing internal mp4box structure
		const samples = trak.samples as Array<{
			number: number;
			offset: number;
			size: number;
			cts: number;
			dts: number;
			duration: number;
			timescale: number;
			is_sync: boolean;
		}> | undefined;

		console.log(`[MP4Demuxer] trak.samples length: ${samples?.length ?? 'undefined'}`);

		if (!samples || samples.length === 0) {
			console.warn('[MP4Demuxer] No samples found in track');
			return;
		}

		// Detect CTS offset for videos with B-frames
		// When DTS starts negative (e.g., -0.067s), mp4box.js may add an offset to CTS
		// We need to detect and correct this offset to ensure CTS matches actual PTS
		let ctsOffset = 0;
		const firstSample = samples[0];
		if (firstSample && firstSample.is_sync) {
			// First keyframe should have CTS = 0 (or very close to 0)
			// If it has a significant offset, we need to correct all CTS values
			const firstCtsSeconds = firstSample.cts / firstSample.timescale;
			// If first keyframe CTS is > 0.01s (more than ~1/3 frame at 30fps), it's likely an offset
			if (firstCtsSeconds > 0.01) {
				ctsOffset = firstSample.cts;
				console.log(`[MP4Demuxer] Detected CTS offset: ${firstCtsSeconds.toFixed(3)}s, correcting...`);
			}
		}

		for (let i = 0; i < samples.length; i++) {
			const s = samples[i];
			if (!s) continue;

			const sampleInfo: SampleInfo = {
				number: s.number,
				offset: s.offset,
				size: s.size,
				// Apply CTS offset correction
				cts: s.cts - ctsOffset,
				dts: s.dts,
				duration: s.duration,
				timescale: s.timescale,
				is_sync: s.is_sync,
			};

			this._sampleIndex.push(sampleInfo);

			if (s.is_sync) {
				this._keyframeIndex.push(i);
			}
		}

		console.log(`[MP4Demuxer] _buildSampleIndex complete: ${this._sampleIndex.length} samples, ${this._keyframeIndex.length} keyframes`);
	}

	/**
	 * Build audio sample index from track info
	 */
	private _buildAudioSampleIndex(track: MP4AudioTrack): void {
		this._audioSampleIndex = [];

		console.log(`[MP4Demuxer] _buildAudioSampleIndex called for track ${track.id}`);

		const trak = this._mp4File?.getTrackById(track.id);
		if (!trak) {
			console.warn('[MP4Demuxer] Audio track not found for building index');
			return;
		}

		// @ts-expect-error - accessing internal mp4box structure
		const samples = trak.samples as Array<{
			number: number;
			offset: number;
			size: number;
			cts: number;
			dts: number;
			duration: number;
			timescale: number;
			is_sync: boolean;
		}> | undefined;

		if (!samples || samples.length === 0) {
			console.warn('[MP4Demuxer] No audio samples found in track');
			return;
		}

		for (let i = 0; i < samples.length; i++) {
			const s = samples[i];
			if (!s) continue;

			this._audioSampleIndex.push({
				number: s.number,
				offset: s.offset,
				size: s.size,
				cts: s.cts,
				dts: s.dts,
				duration: s.duration,
				timescale: s.timescale,
				is_sync: s.is_sync,
			});
		}

		console.log(`[MP4Demuxer] _buildAudioSampleIndex complete: ${this._audioSampleIndex.length} audio samples`);
	}

	/**
	 * Build media info from MP4Info
	 */
	private _buildMediaInfo(
		info: MP4Info,
		videoTrack?: MP4VideoTrack,
		audioTrack?: MP4AudioTrack
	): DemuxedMediaInfo {
		// Calculate duration with fallback to track duration
		let duration = info.timescale > 0 ? info.duration / info.timescale : 0;

		// If container duration is 0 or invalid, try to get from tracks
		if (!duration || duration <= 0 || !isFinite(duration)) {
			if (videoTrack && videoTrack.duration > 0 && videoTrack.timescale > 0) {
				duration = videoTrack.duration / videoTrack.timescale;
			} else if (audioTrack && audioTrack.duration > 0 && audioTrack.timescale > 0) {
				duration = audioTrack.duration / audioTrack.timescale;
			} else {
				// Last resort: calculate from sample index if available
				if (this._sampleIndex.length > 0) {
					const lastSample = this._sampleIndex[this._sampleIndex.length - 1];
					if (lastSample && lastSample.timescale > 0) {
						duration = (lastSample.cts + lastSample.duration) / lastSample.timescale;
					}
				}
			}
		}

		const mediaInfo: DemuxedMediaInfo = {
			duration,
			timescale: info.timescale,
		};

		if (videoTrack) {
			const fps = calculateFps(videoTrack);
			mediaInfo.video = {
				trackId: videoTrack.id,
				codec: videoTrack.codec,
				codedWidth: videoTrack.video.width,
				codedHeight: videoTrack.video.height,
				displayWidth: videoTrack.track_width,
				displayHeight: videoTrack.track_height,
				fps,
				bitrate: videoTrack.bitrate,
				sampleCount: this._sampleIndex.length,
				timescale: videoTrack.timescale,
			};
		}

		if (audioTrack) {
			mediaInfo.audio = {
				trackId: audioTrack.id,
				codec: mapAudioCodec(audioTrack.codec),
				sampleRate: audioTrack.audio.sample_rate,
				channelCount: audioTrack.audio.channel_count,
				bitrate: audioTrack.bitrate,
				timescale: audioTrack.timescale,
			};
		}

		return mediaInfo;
	}

	/**
	 * Send video decoder config
	 */
	private _sendVideoConfig(description: MP4Sample['description']): void {
		if (!this._mediaInfo?.video) return;

		const webCodecsCodec = mapVideoCodecToWebCodecs(
			this._mediaInfo.video.codec,
			description
		);

		if (!webCodecsCodec) {
			const error = new Error(
				`Unsupported video codec: ${this._mediaInfo.video.codec}. ` +
					'Please switch to compatible mode for full format support.'
			);
			this.onError?.(error);
			return;
		}

		// Extract and store NAL length size and avcC data for later use
		if (description?.avcC) {
			this._nalLengthSize = (description.avcC.lengthSizeMinusOne ?? 3) + 1;

			// Check for multiple SPS/PPS (suggests in-band parameter sets)
			if (description.avcC.SPS.length > 1 || description.avcC.PPS.length > 1) {
				this._hasMultipleSPSPPS = true;
			}
		}

		const codecDescription = extractCodecDescription(description);

		// Store avcC data for Annex B mode (SPS/PPS injection)
		if (codecDescription) {
			this._avcCData = codecDescription;
		}

		// Determine video format mode
		this._resolvedVideoFormat = this._resolveVideoFormat();

		const config: VideoDecoderConfig = {
			codec: webCodecsCodec,
			codedWidth: this._mediaInfo.video.codedWidth,
			codedHeight: this._mediaInfo.video.codedHeight,
			// Only include description in AVCC mode (not Annex B)
			...(this._resolvedVideoFormat === 'avcc' && codecDescription && { description: codecDescription }),
		};

		this._mediaInfo.video.description = codecDescription;

		this.onVideoConfig?.(config);
	}

	/**
	 * Resolve video format mode from config
	 */
	private _resolveVideoFormat(): 'avcc' | 'annexb' {
		// Handle videoFormat option
		const format = this._config.videoFormat ?? 'auto';

		if (format === 'avcc') return 'avcc';
		if (format === 'annexb') return 'annexb';

		// Auto detection
		// Use Annex B if multiple SPS/PPS detected (suggests in-band parameter sets)
		if (this._hasMultipleSPSPPS) {
			return 'annexb';
		}

		// Default to AVCC (more reliable for most videos)
		return 'avcc';
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMP4Demuxer(config: MP4DemuxerConfig): MP4Demuxer {
	return new MP4Demuxer(config);
}

// =============================================================================
// Codec Support Check
// =============================================================================

export async function isVideoCodecSupported(
	codec: string
): Promise<{ supported: boolean; reason?: string }> {
	const webCodecsCodec = mapVideoCodecToWebCodecs(codec);

	if (!webCodecsCodec) {
		return {
			supported: false,
			reason: `Video codec "${codec}" is not supported by WebCodecs. Please switch to compatible mode.`,
		};
	}

	try {
		const support = await VideoDecoder.isConfigSupported({
			codec: webCodecsCodec,
			codedWidth: 1920,
			codedHeight: 1080,
		});

		if (!support.supported) {
			return {
				supported: false,
				reason: `Video codec "${codec}" (${webCodecsCodec}) is not supported by this browser.`,
			};
		}

		return { supported: true };
	} catch (error) {
		return {
			supported: false,
			reason: `Failed to check codec support: ${error}`,
		};
	}
}