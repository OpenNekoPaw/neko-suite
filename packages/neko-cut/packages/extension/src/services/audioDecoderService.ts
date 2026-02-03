/**
 * AudioDecoderService - Extension 端音频解码服务
 *
 * 职责：
 * - 使用 Rust N-API 解码音频片段（AAC → PCM/WAV）
 * - 支持按需解码指定时间段的音频
 * - 缓存已解码的音频片段
 * - 自动清理过期缓存
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

/**
 * 音频解码请求参数
 */
export interface AudioDecodeRequest {
	/** 视频文件路径 */
	videoPath: string;
	/** 开始时间（秒） */
	startTime: number;
	/** 持续时间（秒） */
	duration: number;
	/** 输出格式 */
	format?: 'wav' | 'mp3';
	/** 采样率 */
	sampleRate?: number;
	/** 声道数 */
	channels?: number;
}

/**
 * 音频解码结果
 */
export interface AudioDecodeResult {
	/** 解码后的音频数据（二进制 ArrayBuffer） */
	data: ArrayBuffer;
	/** MIME 类型 */
	mimeType: string;
	/** 实际持续时间 */
	duration: number;
	/** 是否来自缓存 */
	cached: boolean;
}

/**
 * 缓存项
 */
interface CacheEntry {
	/** 缓存文件路径 */
	filePath: string;
	/** 最后访问时间 */
	lastAccess: number;
	/** 文件大小 */
	size: number;
}

// =============================================================================
// AudioDecoderService
// =============================================================================

export class AudioDecoderService {
	private _cacheDir: string;
	private _cache = new Map<string, CacheEntry>();
	private _maxCacheSize = 100 * 1024 * 1024; // 100MB
	private _maxCacheAge = 3600 * 1000; // 1 hour
	private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		// 创建缓存目录
		this._cacheDir = path.join(os.tmpdir(), 'uniedit-audio-cache');
		if (!fs.existsSync(this._cacheDir)) {
			fs.mkdirSync(this._cacheDir, { recursive: true });
		}

		// 启动定期清理任务
		this._startCleanupTask();

		console.log('[AudioDecoderService] Initialized, cache dir:', this._cacheDir);
	}

	/**
	 * 解码音频片段
	 */
	async decodeAudioSegment(request: AudioDecodeRequest): Promise<AudioDecodeResult> {
		const {
			videoPath,
			startTime,
			duration,
			format = 'wav',
			sampleRate = 48000,
			channels = 2,
		} = request;

		console.log('[AudioDecoderService] Decode request:', {
			videoPath,
			startTime,
			duration,
			format,
		});

		// 生成缓存 key
		const cacheKey = this._generateCacheKey(videoPath, startTime, duration, format, sampleRate, channels);

		// 检查缓存
		const cached = this._cache.get(cacheKey);
		if (cached && fs.existsSync(cached.filePath)) {
			console.log('[AudioDecoderService] Cache hit:', cacheKey);
			cached.lastAccess = Date.now();

			const data = fs.readFileSync(cached.filePath);
			return {
				data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
				mimeType: this._getMimeType(format),
				duration,
				cached: true,
			};
		}

		// 使用 Rust N-API 解码音频
		const outputPath = path.join(this._cacheDir, `${cacheKey}.${format}`);
		await this._decodeWithRustNapi(videoPath, startTime, duration, outputPath, format, sampleRate, channels);

		// 读取结果
		const data = fs.readFileSync(outputPath);
		const size = data.length;

		// 添加到缓存
		this._cache.set(cacheKey, {
			filePath: outputPath,
			lastAccess: Date.now(),
			size,
		});

		// 检查缓存大小
		await this._evictCacheIfNeeded();

		console.log('[AudioDecoderService] Decode complete, size:', size);

		return {
			data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
			mimeType: this._getMimeType(format),
			duration,
			cached: false,
		};
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		console.log('[AudioDecoderService] Clearing cache');

		for (const entry of this._cache.values()) {
			try {
				if (fs.existsSync(entry.filePath)) {
					fs.unlinkSync(entry.filePath);
				}
			} catch (error) {
				console.error('[AudioDecoderService] Failed to delete cache file:', error);
			}
		}

		this._cache.clear();
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		console.log('[AudioDecoderService] Disposing');

		// 停止清理任务
		if (this._cleanupInterval) {
			clearInterval(this._cleanupInterval);
			this._cleanupInterval = null;
		}

		this.clearCache();

		// 删除缓存目录
		try {
			if (fs.existsSync(this._cacheDir)) {
				fs.rmSync(this._cacheDir, { recursive: true });
			}
		} catch (error) {
			console.error('[AudioDecoderService] Failed to delete cache dir:', error);
		}
	}

	// ---------------------------------------------------------------------------
	// Private Methods
	// ---------------------------------------------------------------------------

	/**
	 * 使用 Rust N-API 解码音频
	 */
	private async _decodeWithRustNapi(
		inputPath: string,
		startTime: number,
		duration: number,
		outputPath: string,
		format: string,
		sampleRate: number,
		channels: number
	): Promise<void> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const { MediaProcessor } = require('@neko/media-processor-rs');

			const processor = await MediaProcessor.create();

			// 解码音频范围
			const endTime = startTime + duration;
			const audioFrames = processor.decodeAudioRange(inputPath, startTime, endTime);

			if (!audioFrames || audioFrames.length === 0) {
				throw new Error('No audio frames decoded');
			}

			// 合并所有音频帧数据
			const totalSamples = audioFrames.reduce((sum: number, frame: { samples: number }) => sum + frame.samples, 0);
			const bytesPerSample = 2; // 16-bit PCM
			const totalBytes = totalSamples * channels * bytesPerSample;

			// 创建 WAV 文件
			if (format === 'wav') {
				const wavBuffer = this._createWavBuffer(audioFrames, sampleRate, channels);
				fs.writeFileSync(outputPath, wavBuffer);
			} else {
				// 对于其他格式，暂时只支持 WAV
				// TODO: 使用 AudioEncoderSession 编码为 MP3
				const wavBuffer = this._createWavBuffer(audioFrames, sampleRate, channels);
				fs.writeFileSync(outputPath, wavBuffer);
			}

			processor.dispose();
			console.log('[AudioDecoderService] Rust N-API decode complete');
		} catch (error) {
			console.error('[AudioDecoderService] Rust N-API decode failed:', error);
			throw error;
		}
	}

	/**
	 * 创建 WAV 文件 buffer
	 */
	private _createWavBuffer(
		audioFrames: Array<{ data: Buffer; samples: number }>,
		sampleRate: number,
		channels: number
	): Buffer {
		// 计算总数据大小
		let totalDataSize = 0;
		for (const frame of audioFrames) {
			totalDataSize += frame.data.length;
		}

		// WAV 文件头 (44 bytes)
		const headerSize = 44;
		const wavBuffer = Buffer.alloc(headerSize + totalDataSize);

		// RIFF header
		wavBuffer.write('RIFF', 0);
		wavBuffer.writeUInt32LE(36 + totalDataSize, 4); // File size - 8
		wavBuffer.write('WAVE', 8);

		// fmt chunk
		wavBuffer.write('fmt ', 12);
		wavBuffer.writeUInt32LE(16, 16); // Chunk size
		wavBuffer.writeUInt16LE(1, 20); // Audio format (1 = PCM)
		wavBuffer.writeUInt16LE(channels, 22); // Number of channels
		wavBuffer.writeUInt32LE(sampleRate, 24); // Sample rate
		wavBuffer.writeUInt32LE(sampleRate * channels * 2, 28); // Byte rate
		wavBuffer.writeUInt16LE(channels * 2, 32); // Block align
		wavBuffer.writeUInt16LE(16, 34); // Bits per sample

		// data chunk
		wavBuffer.write('data', 36);
		wavBuffer.writeUInt32LE(totalDataSize, 40);

		// 写入音频数据
		let offset = headerSize;
		for (const frame of audioFrames) {
			frame.data.copy(wavBuffer, offset);
			offset += frame.data.length;
		}

		return wavBuffer;
	}

	/**
	 * 生成缓存 key
	 */
	private _generateCacheKey(
		videoPath: string,
		startTime: number,
		duration: number,
		format: string,
		sampleRate: number,
		channels: number
	): string {
		const hash = crypto.createHash('md5');
		hash.update(videoPath);
		hash.update(startTime.toString());
		hash.update(duration.toString());
		hash.update(format);
		hash.update(sampleRate.toString());
		hash.update(channels.toString());
		return hash.digest('hex');
	}

	/**
	 * 获取 MIME 类型
	 */
	private _getMimeType(format: string): string {
		const mimeTypes: Record<string, string> = {
			wav: 'audio/wav',
			mp3: 'audio/mpeg',
		};
		return mimeTypes[format] || 'audio/wav';
	}

	/**
	 * 根据需要清理缓存
	 */
	private async _evictCacheIfNeeded(): Promise<void> {
		const totalSize = Array.from(this._cache.values()).reduce((sum, entry) => sum + entry.size, 0);

		if (totalSize <= this._maxCacheSize) {
			return;
		}

		console.log('[AudioDecoderService] Cache size exceeded, evicting...');

		// 按最后访问时间排序
		const entries = Array.from(this._cache.entries()).sort(
			([, a], [, b]) => a.lastAccess - b.lastAccess
		);

		// 删除最旧的条目，直到缓存大小低于限制
		let currentSize = totalSize;
		for (const [key, entry] of entries) {
			if (currentSize <= this._maxCacheSize * 0.8) {
				break;
			}

			try {
				if (fs.existsSync(entry.filePath)) {
					fs.unlinkSync(entry.filePath);
				}
				this._cache.delete(key);
				currentSize -= entry.size;
				console.log('[AudioDecoderService] Evicted cache entry:', key);
			} catch (error) {
				console.error('[AudioDecoderService] Failed to evict cache entry:', error);
			}
		}
	}

	/**
	 * 启动定期清理任务
	 */
	private _startCleanupTask(): void {
		this._cleanupInterval = setInterval(() => {
			const now = Date.now();
			const entriesToRemove: string[] = [];

			for (const [key, entry] of this._cache.entries()) {
				if (now - entry.lastAccess > this._maxCacheAge) {
					entriesToRemove.push(key);
				}
			}

			for (const key of entriesToRemove) {
				const entry = this._cache.get(key);
				if (entry) {
					try {
						if (fs.existsSync(entry.filePath)) {
							fs.unlinkSync(entry.filePath);
						}
						this._cache.delete(key);
						console.log('[AudioDecoderService] Removed expired cache entry:', key);
					} catch (error) {
						console.error('[AudioDecoderService] Failed to remove expired cache:', error);
					}
				}
			}
		}, 60000); // 每分钟清理一次
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: AudioDecoderService | null = null;

/**
 * 获取 AudioDecoderService 单例实例
 */
export function getAudioDecoderService(): AudioDecoderService {
	if (!instance) {
		instance = new AudioDecoderService();
	}
	return instance;
}

/**
 * 释放 AudioDecoderService 实例
 */
export function disposeAudioDecoderService(): void {
	if (instance) {
		instance.dispose();
		instance = null;
	}
}
