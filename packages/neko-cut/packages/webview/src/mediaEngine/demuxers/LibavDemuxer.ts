/**
 * LibavDemuxer - WebM/MKV/AVI container demuxer using libav.js
 *
 * On-demand loading model using virtual file system:
 * 1. Create virtual file device with mkblockreaderdev
 * 2. Use onblockread callback for Range requests
 * 3. Build sample index from packet stream
 */

import type { IDemuxer } from './IDemuxer';
import type {
	DemuxedMediaInfo,
	EncodedAudioSample,
	AudioDescription,
	LibavDemuxerConfig,
	SampleInfo,
} from './types';

// =============================================================================
// libav.js Types (minimal type definitions)
// =============================================================================

interface LibAV {
	// File operations
	mkblockreaderdev(filename: string, size: number): Promise<void>;
	unmkblockreaderdev(filename: string): Promise<void>;
	ff_block_reader_dev_send(filename: string, pos: number, data: Uint8Array): Promise<void>;
	onblockread?: (filename: string, pos: number, length: number) => void;

	// Demuxer operations
	ff_init_demuxer_file(filename: string): Promise<[number, number]>;
	avformat_find_stream_info(fmtCtx: number): Promise<number>;
	av_find_best_stream(fmtCtx: number, type: number, wanted: number, related: number, decoder: number, flags: number): Promise<number>;
	ff_read_frame_multi(fmtCtx: number, pkt: number, opts?: { limit?: number; unify?: boolean; copyoutPacket?: string }): Promise<Record<number, LibAVPacket[]>>;

	// Stream info
	AVFormatContext_nb_streams(fmtCtx: number): Promise<number>;
	AVFormatContext_streams_a(fmtCtx: number, idx: number): Promise<number>;
	AVFormatContext_duration_time_base_num(fmtCtx: number): Promise<number>;
	AVFormatContext_duration_time_base_den(fmtCtx: number): Promise<number>;
	AVFormatContext_duration(fmtCtx: number): Promise<number>;
	AVStream_codecpar(stream: number): Promise<number>;
	AVStream_time_base_num(stream: number): Promise<number>;
	AVStream_time_base_den(stream: number): Promise<number>;
	AVCodecParameters_codec_type(codecpar: number): Promise<number>;
	AVCodecParameters_codec_id(codecpar: number): Promise<number>;
	AVCodecParameters_width(codecpar: number): Promise<number>;
	AVCodecParameters_height(codecpar: number): Promise<number>;
	AVCodecParameters_bit_rate(codecpar: number): Promise<number>;
	AVCodecParameters_sample_rate(codecpar: number): Promise<number>;
	AVCodecParameters_channels(codecpar: number): Promise<number>;
	AVCodecParameters_extradata(codecpar: number): Promise<number>;
	AVCodecParameters_extradata_size(codecpar: number): Promise<number>;
	copyout_u8(ptr: number, size: number): Promise<Uint8Array>;

	// Packet operations
	av_packet_alloc(): Promise<number>;
	av_packet_free_js(pkt: number): Promise<void>;

	// Cleanup
	avformat_close_input_js(fmtCtx: number): Promise<void>;

	// Constants
	AVMEDIA_TYPE_VIDEO: number;
	AVMEDIA_TYPE_AUDIO: number;
	AV_PKT_FLAG_KEY: number;
}

interface LibAVPacket {
	data: Uint8Array;
	pts: number;
	ptshi: number;
	dts: number;
	dtshi: number;
	duration: number;
	durationhi: number;
	flags: number;
	stream_index: number;
}

// =============================================================================
// Codec Mapping
// =============================================================================

/** libav.js codec IDs to WebCodecs codec strings */
const CODEC_ID_MAP: Record<number, string> = {
	// Video codecs
	27: 'avc1.42E01E',    // AV_CODEC_ID_H264
	139: 'vp8',           // AV_CODEC_ID_VP8
	167: 'vp09.00.10.08', // AV_CODEC_ID_VP9
	225: 'av01.0.00M.08', // AV_CODEC_ID_AV1

	// Audio codecs
	86017: 'mp4a.40.2',   // AV_CODEC_ID_AAC
	86021: 'vorbis',      // AV_CODEC_ID_VORBIS
	86076: 'opus',        // AV_CODEC_ID_OPUS
	65536: 'mp3',         // AV_CODEC_ID_MP3
};

/** Get WebCodecs codec string from libav codec ID */
function getWebCodecsCodec(codecId: number, extradata?: Uint8Array): string | null {
	const baseCodec = CODEC_ID_MAP[codecId];
	if (!baseCodec) return null;

	// For H.264, try to extract profile from extradata (avcC)
	if (codecId === 27 && extradata && extradata.length >= 4) {
		const profile = extradata[1]?.toString(16).padStart(2, '0') ?? '42';
		const compat = extradata[2]?.toString(16).padStart(2, '0') ?? 'E0';
		const level = extradata[3]?.toString(16).padStart(2, '0') ?? '1E';
		return `avc1.${profile}${compat}${level}`;
	}

	// For VP9, try to extract profile from extradata
	if (codecId === 167 && extradata && extradata.length >= 4) {
		// VP9 CodecPrivate format varies, use default for now
		return 'vp09.00.10.08';
	}

	return baseCodec;
}

/** Get audio codec string */
function getAudioCodecString(codecId: number): string {
	switch (codecId) {
		case 86017: return 'aac';
		case 86021: return 'vorbis';
		case 86076: return 'opus';
		case 65536: return 'mp3';
		default: return 'unknown';
	}
}

// =============================================================================
// LibavDemuxer Class
// =============================================================================

export class LibavDemuxer implements IDemuxer {
	private _config: LibavDemuxerConfig;
	private _libav: LibAV | null = null;
	private _fmtCtx: number = 0;
	private _pkt: number = 0;
	private _mediaInfo: DemuxedMediaInfo | null = null;
	private _initialized = false;
	private _abortController: AbortController | null = null;

	// Track info
	private _videoStreamIdx: number = -1;
	private _audioStreamIdx: number = -1;
	private _videoTimeBaseNum: number = 1;
	private _videoTimeBaseDen: number = 1000;
	private _audioTimeBaseNum: number = 1;
	private _audioTimeBaseDen: number = 1000;
	private _videoCodecId: number = 0;
	private _audioCodecId: number = 0;
	private _videoExtradata: Uint8Array | null = null;
	private _audioExtradata: Uint8Array | null = null;

	// Sample index
	private _sampleIndex: SampleInfo[] = [];
	private _keyframeIndex: number[] = [];
	private _audioSampleIndex: SampleInfo[] = [];

	// File info
	private _fileSize: number = 0;
	private _filename: string = '';

	// Loaded data cache
	private _loadedRanges: Array<{ start: number; end: number }> = [];
	private _pendingReads: Map<string, Promise<void>> = new Map();

	// Callbacks
	onVideoConfig?: (config: VideoDecoderConfig) => void;
	onError?: (error: Error) => void;

	constructor(config: LibavDemuxerConfig) {
		this._config = config;
		this._filename = `input_${Date.now()}.mkv`;
	}

	// ===========================================================================
	// Public Methods - IDemuxer Implementation
	// ===========================================================================

	async initialize(): Promise<DemuxedMediaInfo> {
		if (this._initialized && this._mediaInfo) {
			return this._mediaInfo;
		}

		this._abortController = new AbortController();

		try {
			// Get file size first
			await this._getFileSize();

			// Load libav.js
			await this._loadLibav();

			if (!this._libav) {
				throw new Error('Failed to load libav.js');
			}

			// Create virtual file device
			await this._libav.mkblockreaderdev(this._filename, this._fileSize);

			// Set up block read callback
			this._libav.onblockread = (filename, pos, length) => {
				this._handleBlockRead(filename, pos, length);
			};

			// Initialize demuxer
			const [fmtCtx, streams] = await this._libav.ff_init_demuxer_file(this._filename);
			this._fmtCtx = fmtCtx;

			if (streams < 0) {
				throw new Error('Failed to initialize demuxer');
			}

			// Find stream info
			await this._libav.avformat_find_stream_info(fmtCtx);

			// Allocate packet
			this._pkt = await this._libav.av_packet_alloc();

			// Parse streams
			await this._parseStreams();

			// Build sample index by reading all packets
			await this._buildSampleIndex();

			// Send video config
			if (this._videoStreamIdx >= 0) {
				this._sendVideoConfig();
			}

			this._initialized = true;

			if (!this._mediaInfo) {
				throw new Error('Failed to parse media info');
			}

			return this._mediaInfo;
		} catch (error) {
			this._handleError(error);
			throw error;
		}
	}

	dispose(): void {
		if (this._abortController) {
			this._abortController.abort();
			this._abortController = null;
		}

		if (this._libav) {
			// Clean up libav resources
			if (this._pkt) {
				this._libav.av_packet_free_js(this._pkt).catch(() => {});
			}
			if (this._fmtCtx) {
				this._libav.avformat_close_input_js(this._fmtCtx).catch(() => {});
			}
			if (this._filename) {
				this._libav.unmkblockreaderdev(this._filename).catch(() => {});
			}
			this._libav = null;
		}

		this._mediaInfo = null;
		this._initialized = false;
		this._sampleIndex = [];
		this._keyframeIndex = [];
		this._audioSampleIndex = [];
		this._loadedRanges = [];
		this._pendingReads.clear();
	}

	async getVideoChunksAt(time: number, count: number = 16): Promise<EncodedVideoChunk[]> {
		if (!this._initialized || !this._mediaInfo?.video) {
			throw new Error('Demuxer not initialized');
		}

		const targetSampleIdx = this.getSampleIndexAtTime(time);
		if (targetSampleIdx < 0) {
			return [];
		}

		// Find nearest keyframe before target
		const keyframeSampleIdx = this.findNearestKeyframe(targetSampleIdx);

		// Calculate range to load
		const endSampleIdx = Math.min(
			targetSampleIdx + count,
			this._sampleIndex.length - 1
		);

		// Extract chunks
		const chunks: EncodedVideoChunk[] = [];

		for (let i = keyframeSampleIdx; i <= endSampleIdx; i++) {
			const sampleInfo = this._sampleIndex[i];
			if (!sampleInfo) continue;

			// Load sample data
			const data = await this._loadSampleData(sampleInfo);
			if (!data) continue;

			const chunk = new EncodedVideoChunk({
				type: sampleInfo.is_sync ? 'key' : 'delta',
				timestamp: (sampleInfo.cts * 1_000_000 * this._videoTimeBaseNum) / this._videoTimeBaseDen,
				duration: (sampleInfo.duration * 1_000_000 * this._videoTimeBaseNum) / this._videoTimeBaseDen,
				data,
			});

			chunks.push(chunk);
		}

		return chunks;
	}

	async getSampleAt(sampleIndex: number): Promise<EncodedVideoChunk | null> {
		if (!this._initialized || !this._mediaInfo?.video) {
			return null;
		}

		const sampleInfo = this._sampleIndex[sampleIndex];
		if (!sampleInfo) {
			return null;
		}

		const data = await this._loadSampleData(sampleInfo);
		if (!data) {
			return null;
		}

		return new EncodedVideoChunk({
			type: sampleInfo.is_sync ? 'key' : 'delta',
			timestamp: (sampleInfo.cts * 1_000_000 * this._videoTimeBaseNum) / this._videoTimeBaseDen,
			duration: (sampleInfo.duration * 1_000_000 * this._videoTimeBaseNum) / this._videoTimeBaseDen,
			data,
		});
	}

	async getAudioSamplesAt(time: number, duration: number): Promise<EncodedAudioSample[]> {
		if (!this._initialized || !this._mediaInfo?.audio) {
			return [];
		}

		const startCts = (time * this._audioTimeBaseDen) / this._audioTimeBaseNum;
		const endCts = ((time + duration) * this._audioTimeBaseDen) / this._audioTimeBaseNum;

		const samples: EncodedAudioSample[] = [];

		for (const sampleInfo of this._audioSampleIndex) {
			if (sampleInfo.cts >= startCts && sampleInfo.cts <= endCts) {
				const data = await this._loadSampleData(sampleInfo);
				if (data) {
					samples.push({
						data,
						timestamp: (sampleInfo.cts * 1_000_000 * this._audioTimeBaseNum) / this._audioTimeBaseDen,
						duration: (sampleInfo.duration * 1_000_000 * this._audioTimeBaseNum) / this._audioTimeBaseDen,
						isKeyframe: sampleInfo.is_sync,
					});
				}
			}
		}

		return samples;
	}

	getAudioDescription(): AudioDescription | null {
		if (!this._mediaInfo?.audio) {
			return null;
		}

		return {
			codec: this._mediaInfo.audio.codec,
			sampleRate: this._mediaInfo.audio.sampleRate,
			channelCount: this._mediaInfo.audio.channelCount,
			description: this._audioExtradata ?? undefined,
		};
	}

	getSampleIndexAtTime(time: number): number {
		if (this._sampleIndex.length === 0) return -1;

		const targetCts = (time * this._videoTimeBaseDen) / this._videoTimeBaseNum;

		// Binary search
		let left = 0;
		let right = this._sampleIndex.length - 1;
		let result = 0;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const sample = this._sampleIndex[mid];
			if (!sample) break;

			if (sample.cts <= targetCts) {
				result = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		return result;
	}

	getSampleTime(sampleIndex: number): number {
		const sample = this._sampleIndex[sampleIndex];
		if (!sample) return 0;
		return (sample.cts * this._videoTimeBaseNum) / this._videoTimeBaseDen;
	}

	findNearestKeyframe(sampleIndex: number): number {
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

	async getKeyframeTimes(): Promise<number[]> {
		return this._keyframeIndex.map(idx => this.getSampleTime(idx));
	}

	getNearestKeyframeTime(time: number): number {
		const sampleIdx = this.getSampleIndexAtTime(time);
		const keyframeSampleIdx = this.findNearestKeyframe(sampleIdx);
		return this.getSampleTime(keyframeSampleIdx);
	}

	/**
	 * Find the nearest IDR frame time to the given time
	 * For LibavDemuxer, we treat all keyframes as IDR frames since libav.js
	 * handles Open GOP internally and marks true sync points correctly
	 */
	async findNearestIDRTime(time: number): Promise<number> {
		// LibavDemuxer treats all keyframes as IDR frames
		// because libav.js handles Open GOP internally
		return this.getNearestKeyframeTime(time);
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

	// ===========================================================================
	// Private Methods
	// ===========================================================================

	private async _loadLibav(): Promise<void> {
		// Dynamic import of libav.js
		// Using the variant that supports WebM/MKV (VP8/VP9/Opus)
		const LibAVModule = await import('libav.js');
		this._libav = await LibAVModule.LibAV({ variant: 'webm' }) as unknown as LibAV;
	}

	private async _getFileSize(): Promise<void> {
		const response = await fetch(this._config.source, {
			method: 'HEAD',
			signal: this._abortController?.signal,
		});

		const contentLength = response.headers.get('Content-Length');
		if (contentLength) {
			this._fileSize = parseInt(contentLength, 10);
		} else {
			throw new Error('Cannot determine file size');
		}
	}

	private _handleBlockRead(filename: string, pos: number, length: number): void {
		if (filename !== this._filename || !this._libav) return;

		const key = `${pos}-${length}`;
		if (this._pendingReads.has(key)) return;

		const promise = this._fetchAndSend(pos, length);
		this._pendingReads.set(key, promise);
		promise.finally(() => this._pendingReads.delete(key));
	}

	private async _fetchAndSend(pos: number, length: number): Promise<void> {
		if (!this._libav) return;

		try {
			const end = Math.min(pos + length - 1, this._fileSize - 1);
			const response = await fetch(this._config.source, {
				headers: { Range: `bytes=${pos}-${end}` },
				signal: this._abortController?.signal,
			});

			if (!response.ok && response.status !== 206) {
				throw new Error(`Failed to fetch range: ${response.status}`);
			}

			const buffer = await response.arrayBuffer();
			const data = new Uint8Array(buffer);

			await this._libav.ff_block_reader_dev_send(this._filename, pos, data);

			this._markRangeLoaded(pos, pos + data.length - 1);
		} catch (error) {
			if ((error as Error).name !== 'AbortError') {
				console.error('[LibavDemuxer] Fetch error:', error);
			}
		}
	}

	private _markRangeLoaded(start: number, end: number): void {
		const newRanges: Array<{ start: number; end: number }> = [];

		for (const range of this._loadedRanges) {
			if (range.end + 1 >= start && range.start - 1 <= end) {
				start = Math.min(start, range.start);
				end = Math.max(end, range.end);
			} else {
				newRanges.push(range);
			}
		}

		newRanges.push({ start, end });
		this._loadedRanges = newRanges;
	}

	private async _parseStreams(): Promise<void> {
		if (!this._libav) return;

		// Find video stream
		this._videoStreamIdx = await this._libav.av_find_best_stream(
			this._fmtCtx,
			this._libav.AVMEDIA_TYPE_VIDEO,
			-1, -1, 0, 0
		);

		// Find audio stream
		this._audioStreamIdx = await this._libav.av_find_best_stream(
			this._fmtCtx,
			this._libav.AVMEDIA_TYPE_AUDIO,
			-1, -1, 0, 0
		);

		// Get duration
		const durationNum = await this._libav.AVFormatContext_duration_time_base_num(this._fmtCtx);
		const durationDen = await this._libav.AVFormatContext_duration_time_base_den(this._fmtCtx);
		const duration = await this._libav.AVFormatContext_duration(this._fmtCtx);
		const durationSec = (duration * durationNum) / durationDen;

		this._mediaInfo = {
			duration: durationSec,
			timescale: 1000,
		};

		// Parse video stream
		if (this._videoStreamIdx >= 0) {
			const stream = await this._libav.AVFormatContext_streams_a(this._fmtCtx, this._videoStreamIdx);
			const codecpar = await this._libav.AVStream_codecpar(stream);

			this._videoTimeBaseNum = await this._libav.AVStream_time_base_num(stream);
			this._videoTimeBaseDen = await this._libav.AVStream_time_base_den(stream);
			this._videoCodecId = await this._libav.AVCodecParameters_codec_id(codecpar);

			const width = await this._libav.AVCodecParameters_width(codecpar);
			const height = await this._libav.AVCodecParameters_height(codecpar);
			const bitrate = await this._libav.AVCodecParameters_bit_rate(codecpar);

			// Get extradata
			const extradataPtr = await this._libav.AVCodecParameters_extradata(codecpar);
			const extradataSize = await this._libav.AVCodecParameters_extradata_size(codecpar);
			if (extradataPtr && extradataSize > 0) {
				this._videoExtradata = await this._libav.copyout_u8(extradataPtr, extradataSize);
			}

			const codec = getWebCodecsCodec(this._videoCodecId, this._videoExtradata ?? undefined);

			this._mediaInfo.video = {
				trackId: this._videoStreamIdx,
				codec: codec ?? 'unknown',
				codedWidth: width,
				codedHeight: height,
				displayWidth: width,
				displayHeight: height,
				fps: 30, // Will be calculated from samples
				bitrate,
				sampleCount: 0, // Will be updated after building index
			};
		}

		// Parse audio stream
		if (this._audioStreamIdx >= 0) {
			const stream = await this._libav.AVFormatContext_streams_a(this._fmtCtx, this._audioStreamIdx);
			const codecpar = await this._libav.AVStream_codecpar(stream);

			this._audioTimeBaseNum = await this._libav.AVStream_time_base_num(stream);
			this._audioTimeBaseDen = await this._libav.AVStream_time_base_den(stream);
			this._audioCodecId = await this._libav.AVCodecParameters_codec_id(codecpar);

			const sampleRate = await this._libav.AVCodecParameters_sample_rate(codecpar);
			const channels = await this._libav.AVCodecParameters_channels(codecpar);
			const bitrate = await this._libav.AVCodecParameters_bit_rate(codecpar);

			// Get extradata
			const extradataPtr = await this._libav.AVCodecParameters_extradata(codecpar);
			const extradataSize = await this._libav.AVCodecParameters_extradata_size(codecpar);
			if (extradataPtr && extradataSize > 0) {
				this._audioExtradata = await this._libav.copyout_u8(extradataPtr, extradataSize);
			}

			this._mediaInfo.audio = {
				trackId: this._audioStreamIdx,
				codec: getAudioCodecString(this._audioCodecId),
				sampleRate,
				channelCount: channels,
				bitrate,
			};
		}
	}

	private async _buildSampleIndex(): Promise<void> {
		if (!this._libav || !this._mediaInfo) return;

		this._sampleIndex = [];
		this._keyframeIndex = [];
		this._audioSampleIndex = [];

		let videoSampleNumber = 0;
		let audioSampleNumber = 0;

		// Read all packets to build index
		// Note: This reads the entire file which may be slow for large files
		// A more efficient approach would be to use seeking, but libav.js
		// virtual file system makes this complex
		try {
			while (true) {
				const packets = await this._libav.ff_read_frame_multi(this._fmtCtx, this._pkt, {
					limit: 1000,
					unify: false,
					copyoutPacket: 'ptr',
				});

				let hasPackets = false;

				for (const [streamIdxStr, streamPackets] of Object.entries(packets)) {
					const streamIdx = parseInt(streamIdxStr, 10);

					for (const pkt of streamPackets) {
						hasPackets = true;

						if (streamIdx === this._videoStreamIdx) {
							const isKeyframe = (pkt.flags & this._libav.AV_PKT_FLAG_KEY) !== 0;

							const sampleInfo: SampleInfo = {
								number: videoSampleNumber++,
								offset: 0, // Not used for libav - data is in packet
								size: pkt.data.length,
								cts: pkt.pts,
								dts: pkt.dts,
								duration: pkt.duration,
								timescale: this._videoTimeBaseDen,
								is_sync: isKeyframe,
							};

							// Store packet data reference
							(sampleInfo as SampleInfo & { _data: Uint8Array })._data = pkt.data;

							this._sampleIndex.push(sampleInfo);

							if (isKeyframe) {
								this._keyframeIndex.push(this._sampleIndex.length - 1);
							}
						} else if (streamIdx === this._audioStreamIdx) {
							const sampleInfo: SampleInfo = {
								number: audioSampleNumber++,
								offset: 0,
								size: pkt.data.length,
								cts: pkt.pts,
								dts: pkt.dts,
								duration: pkt.duration,
								timescale: this._audioTimeBaseDen,
								is_sync: true, // Audio frames are typically all keyframes
							};

							(sampleInfo as SampleInfo & { _data: Uint8Array })._data = pkt.data;

							this._audioSampleIndex.push(sampleInfo);
						}
					}
				}

				if (!hasPackets) {
					break;
				}
			}
		} catch (error) {
			// End of file or error
			if ((error as Error).message?.includes('EOF')) {
				// Normal end of file
			} else {
				console.warn('[LibavDemuxer] Error reading packets:', error);
			}
		}

		// Update media info with sample count and calculated FPS
		if (this._mediaInfo.video && this._sampleIndex.length > 0) {
			this._mediaInfo.video.sampleCount = this._sampleIndex.length;

			// Calculate FPS from samples
			const lastSample = this._sampleIndex[this._sampleIndex.length - 1];
			const firstSample = this._sampleIndex[0];
			if (lastSample && firstSample) {
				const totalDuration = (lastSample.cts - firstSample.cts) * this._videoTimeBaseNum / this._videoTimeBaseDen;
				if (totalDuration > 0) {
					this._mediaInfo.video.fps = this._sampleIndex.length / totalDuration;
				}
			}
		}
	}

	private async _loadSampleData(sampleInfo: SampleInfo): Promise<Uint8Array | null> {
		// For libav demuxer, data is stored directly in the sample info
		const data = (sampleInfo as SampleInfo & { _data?: Uint8Array })._data;
		return data ?? null;
	}

	private _sendVideoConfig(): void {
		if (!this._mediaInfo?.video) return;

		const codec = this._mediaInfo.video.codec;
		if (codec === 'unknown') {
			this.onError?.(new Error(`Unsupported video codec ID: ${this._videoCodecId}`));
			return;
		}

		const config: VideoDecoderConfig = {
			codec,
			codedWidth: this._mediaInfo.video.codedWidth,
			codedHeight: this._mediaInfo.video.codedHeight,
		};

		// Add description for H.264 (avcC)
		if (this._videoCodecId === 27 && this._videoExtradata) {
			config.description = this._videoExtradata;
		}

		this._mediaInfo.video.description = this._videoExtradata ?? undefined;

		this.onVideoConfig?.(config);
	}

	private _handleError(error: unknown): void {
		const err = error instanceof Error ? error : new Error(String(error));
		console.error('[LibavDemuxer] Error:', err);
		this.onError?.(err);
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLibavDemuxer(config: LibavDemuxerConfig): LibavDemuxer {
	return new LibavDemuxer(config);
}
