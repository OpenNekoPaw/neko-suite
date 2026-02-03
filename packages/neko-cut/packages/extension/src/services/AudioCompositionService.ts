/**
 * AudioCompositionService - 音频合成服务
 *
 * 职责：
 * - 分析 Timeline 中的所有音频源
 * - 生成 FFmpeg 音频滤镜链
 * - 支持音量、声像、淡入淡出、增益等效果
 * - 混合多个音频轨道
 *
 * FFmpeg 音频滤镜支持:
 * - volume: 音量调整
 * - pan: 声像调整
 * - afade: 淡入淡出
 * - equalizer: 均衡器
 * - amix: 音频混合
 *
 * 设计原则（SOLID）：
 * - 单一职责 (S)：仅负责音频相关的转换和滤镜生成
 * - 开闭原则 (O)：通过滤镜映射函数扩展音频效果
 * - 依赖倒置 (D)：依赖 ProjectData 接口
 */

import type {
	ProjectData,
	TimelineTrack,
	TimelineElement,
	MediaElement,
	AudioElement,
	AudioProperties,
} from '@uniedit/shared';
import * as path from 'path';
import { getFFmpegService } from './FFmpegService';

// =============================================================================
// Types
// =============================================================================

/**
 * 音频源信息
 */
export interface AudioSource {
	/** 音频文件路径 */
	audioPath: string;
	/** 开始时间（秒） */
	startTime: number;
	/** 持续时间（秒） */
	duration: number;
	/** 音频属性 */
	properties: AudioProperties;
	/** 轨道索引 */
	trackIndex: number;
	/** 元素 ID */
	elementId: string;
}

/**
 * 音频滤镜配置
 */
export interface AudioFilterConfig {
	/** 输入音频源列表 */
	sources: AudioSource[];
	/** 输出采样率 */
	sampleRate: number;
	/** 输出声道数 */
	channels: number;
	/** 总时长（秒） */
	totalDuration: number;
}

/**
 * FFmpeg 音频滤镜链
 */
export interface AudioFilterChain {
	/** 输入文件列表 */
	inputs: string[];
	/** 滤镜复杂命令 */
	filterComplex: string;
	/** 输出映射 */
	outputMap: string;
}

// =============================================================================
// Audio Source Collection
// =============================================================================

/**
 * 从 Timeline 收集所有音频源
 */
function collectAudioSources(
	project: ProjectData,
	projectRoot: string
): AudioSource[] {
	const sources: AudioSource[] = [];

	for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
		const track = project.tracks[trackIndex];

		// 跳过隐藏轨道
		if (track.hidden) continue;

		for (const element of track.elements) {
			// 跳过隐藏或静音元素
			if (element.hidden || element.muted) continue;

			let audioPath: string | null = null;
			let audioProperties: AudioProperties | undefined;

			// 处理不同类型的元素
			if (element.type === 'audio') {
				// 纯音频元素
				const audioElement = element as AudioElement;
				audioPath = audioElement.src;
				audioProperties = element.audio;
			} else if (element.type === 'media') {
				// 视频元素（可能包含音频）
				const mediaElement = element as MediaElement;
				audioPath = mediaElement.src;
				audioProperties = element.audio;
			}

			// 如果有音频源,添加到列表
			if (audioPath && audioProperties) {
				const effectiveDuration = element.duration - element.trimStart - element.trimEnd;

				sources.push({
					audioPath: resolveAudioPath(audioPath, projectRoot),
					startTime: element.startTime,
					duration: effectiveDuration,
					properties: audioProperties,
					trackIndex,
					elementId: element.id,
				});
			}
		}
	}

	return sources;
}

/**
 * 解析音频文件的绝对路径
 */
function resolveAudioPath(relativePath: string, projectRoot: string): string {
	if (path.isAbsolute(relativePath)) {
		return relativePath;
	}
	return path.resolve(projectRoot, relativePath);
}

/**
 * 判断文件是否为视频文件
 */
function isVideoFile(filePath: string): boolean {
	const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv', '.flv', '.wmv'];
	const lowerPath = filePath.toLowerCase();
	return videoExtensions.some(ext => lowerPath.endsWith(ext));
}

/**
 * 检查视频文件是否包含音频轨道
 */
async function checkVideoHasAudio(videoPath: string): Promise<boolean> {
	try {
		const ffmpegService = getFFmpegService();
		const mediaInfo = await ffmpegService.probeMediaInfo(videoPath);
		return mediaInfo.hasAudio;
	} catch (error) {
		console.warn('[AudioCompositionService] Failed to probe video for audio:', videoPath, error);
		// Fallback: assume video has audio if probe fails
		return true;
	}
}

/**
 * 从 Timeline 收集所有音频源（异步版本，会检查视频文件是否有音频轨道）
 */
async function collectAudioSourcesAsync(
	project: ProjectData,
	projectRoot: string
): Promise<AudioSource[]> {
	const sources: AudioSource[] = [];

	for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
		const track = project.tracks[trackIndex];

		// 跳过隐藏轨道
		if (track.hidden) continue;

		for (const element of track.elements) {
			// 跳过隐藏或静音元素
			if (element.hidden || element.muted) continue;

			let audioPath: string | null = null;
			let audioProperties: AudioProperties | undefined;
			let isVideo = false;

			// 处理不同类型的元素
			if (element.type === 'audio') {
				// 纯音频元素
				const audioElement = element as AudioElement;
				audioPath = audioElement.src;
				audioProperties = element.audio;
			} else if (element.type === 'media') {
				// 视频元素（可能包含音频）
				const mediaElement = element as MediaElement;
				audioPath = mediaElement.src;
				audioProperties = element.audio;
				isVideo = true;
			}

			// 如果有音频源,添加到列表
			if (audioPath && audioProperties) {
				const resolvedPath = resolveAudioPath(audioPath, projectRoot);

				// 如果是视频文件，检查是否有音频轨道
				if (isVideo && isVideoFile(resolvedPath)) {
					const hasAudio = await checkVideoHasAudio(resolvedPath);
					if (!hasAudio) {
						console.log('[AudioCompositionService] Skipping video without audio track:', resolvedPath);
						continue;
					}
				}

				const effectiveDuration = element.duration - element.trimStart - element.trimEnd;

				sources.push({
					audioPath: resolvedPath,
					startTime: element.startTime,
					duration: effectiveDuration,
					properties: audioProperties,
					trackIndex,
					elementId: element.id,
				});
			}
		}
	}

	return sources;
}

// =============================================================================
// Audio Filter Generation
// =============================================================================

/**
 * 为单个音频源生成滤镜
 *
 * @param source - 音频源
 * @param sourceIndex - 音频源在列表中的索引 (0-based)
 * @param ffmpegInputIndex - FFmpeg 输入索引 (考虑偏移后)
 * @param totalDuration - 总时长
 */
function buildAudioSourceFilter(
	source: AudioSource,
	sourceIndex: number,
	ffmpegInputIndex: number,
	totalDuration: number
): string {
	const filters: string[] = [];
	const { properties, startTime, duration } = source;

	// 1. 音量调整
	let volume = 1;
	if (typeof properties.volume === 'number') {
		volume = properties.volume;
	} else if (properties.volume && typeof properties.volume.baseValue === 'number') {
		volume = properties.volume.baseValue;
	}
	// Ensure volume is a valid number
	if (!Number.isFinite(volume)) {
		volume = 1;
	}

	// 应用增益 (dB → 线性)
	if (properties.gain && properties.gain !== 0) {
		const gainLinear = Math.pow(10, properties.gain / 20);
		volume *= gainLinear;
	}

	if (volume !== 1 && Number.isFinite(volume)) {
		filters.push(`volume=${volume}`);
	}

	// 2. 声像调整
	let pan = 0;
	if (typeof properties.pan === 'number') {
		pan = properties.pan;
	} else if (properties.pan && typeof properties.pan.baseValue === 'number') {
		pan = properties.pan.baseValue;
	}

	if (pan !== 0) {
		// pan: -1 (left) to 1 (right)
		// FFmpeg stereotools: sl/sr (send left/right)
		const leftGain = Math.max(0, 1 - pan);
		const rightGain = Math.max(0, 1 + pan);
		filters.push(`pan=stereo|c0=${leftGain}*c0|c1=${rightGain}*c1`);
	}

	// 3. 淡入淡出
	if (properties.fadeIn > 0) {
		filters.push(`afade=t=in:st=${startTime}:d=${properties.fadeIn}`);
	}

	if (properties.fadeOut > 0) {
		const fadeOutStart = startTime + duration - properties.fadeOut;
		filters.push(`afade=t=out:st=${fadeOutStart}:d=${properties.fadeOut}`);
	}

	// 4. 均衡器 (如果有)
	if (properties.eq) {
		const { lowGain, midGain, highGain } = properties.eq;
		if (lowGain !== 0) {
			filters.push(`equalizer=f=100:width_type=h:width=200:g=${lowGain}`);
		}
		if (midGain !== 0) {
			filters.push(`equalizer=f=1000:width_type=h:width=200:g=${midGain}`);
		}
		if (highGain !== 0) {
			filters.push(`equalizer=f=10000:width_type=h:width=200:g=${highGain}`);
		}
	}

	// 5. 时间延迟 (如果音频不是从 0 开始)
	if (startTime > 0) {
		filters.push(`adelay=${Math.round(startTime * 1000)}|${Math.round(startTime * 1000)}`);
	}

	// 6. 裁剪音频长度
	filters.push(`atrim=0:${duration}`);

	// 7. 补齐到总时长
	if (startTime + duration < totalDuration) {
		filters.push(`apad=whole_dur=${totalDuration}`);
	}

	// 组合滤镜
	const filterChain = filters.join(',');
	// Use ffmpegInputIndex for FFmpeg input reference, sourceIndex for output label
	return `[${ffmpegInputIndex}:a]${filterChain}[a${sourceIndex}]`;
}

/**
 * 构建音频混合滤镜链
 */
function buildAudioMixFilter(sourceCount: number): string {
	if (sourceCount === 0) {
		return '';
	}

	if (sourceCount === 1) {
		return '[a0]';
	}

	// 多个音频源,使用 amix 混合
	const inputs = Array.from({ length: sourceCount }, (_, i) => `[a${i}]`).join('');
	return `${inputs}amix=inputs=${sourceCount}:duration=longest[aout]`;
}

// =============================================================================
// AudioCompositionService
// =============================================================================

/**
 * 音频合成服务
 */
export class AudioCompositionService {
	/**
	 * 生成 FFmpeg 音频滤镜链
	 *
	 * @param project - 项目数据
	 * @param projectRoot - 项目根目录
	 * @param totalDuration - 总时长（秒）
	 * @param sampleRate - 采样率（默认 48000）
	 * @param channels - 声道数（默认 2）
	 * @param inputIndexOffset - FFmpeg 输入索引偏移（默认 0）
	 * @returns 音频滤镜链配置
	 */
	buildAudioFilterChain(
		project: ProjectData,
		projectRoot: string,
		totalDuration: number,
		sampleRate: number = 48000,
		channels: number = 2,
		inputIndexOffset: number = 0
	): AudioFilterChain | null {
		// 收集所有音频源
		const sources = collectAudioSources(project, projectRoot);

		// 如果没有音频源,返回 null
		if (sources.length === 0) {
			return null;
		}

		// 构建每个音频源的滤镜
		const sourceFilters: string[] = [];
		const inputs: string[] = [];

		for (let i = 0; i < sources.length; i++) {
			const source = sources[i];
			inputs.push(source.audioPath);
			// sourceIndex (i) for output label, ffmpegInputIndex (i + offset) for input reference
			sourceFilters.push(buildAudioSourceFilter(source, i, i + inputIndexOffset, totalDuration));
		}

		// 构建混合滤镜
		const mixFilter = buildAudioMixFilter(sources.length);

		// 组合完整的滤镜链
		let filterComplex: string;
		if (sources.length === 1) {
			filterComplex = `${sourceFilters[0]};${mixFilter}anull[aout]`;
		} else {
			filterComplex = `${sourceFilters.join(';')};${mixFilter}`;
		}

		// 添加重采样和声道转换
		filterComplex += `;[aout]aresample=${sampleRate},aformat=sample_rates=${sampleRate}:channel_layouts=stereo[audio_final]`;

		console.log('[AudioCompositionService] Generated filter_complex:', filterComplex);
		console.log('[AudioCompositionService] Audio inputs:', inputs);

		return {
			inputs,
			filterComplex,
			outputMap: '[audio_final]',
		};
	}

	/**
	 * 检查项目是否包含音频
	 */
	hasAudio(project: ProjectData): boolean {
		for (const track of project.tracks) {
			if (track.hidden) continue;

			for (const element of track.elements) {
				if (element.hidden || element.muted) continue;

				if (element.type === 'audio') {
					return true;
				}

				if (element.type === 'media' && element.audio) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * 生成 FFmpeg 音频滤镜链（异步版本，会检查视频文件是否有音频轨道）
	 *
	 * @param project - 项目数据
	 * @param projectRoot - 项目根目录
	 * @param totalDuration - 总时长（秒）
	 * @param sampleRate - 采样率（默认 48000）
	 * @param channels - 声道数（默认 2）
	 * @param inputIndexOffset - FFmpeg 输入索引偏移（默认 0）
	 * @returns 音频滤镜链配置
	 */
	async buildAudioFilterChainAsync(
		project: ProjectData,
		projectRoot: string,
		totalDuration: number,
		sampleRate: number = 48000,
		channels: number = 2,
		inputIndexOffset: number = 0
	): Promise<AudioFilterChain | null> {
		// 收集所有音频源（异步检查视频是否有音频轨道）
		const sources = await collectAudioSourcesAsync(project, projectRoot);

		// 如果没有音频源,返回 null
		if (sources.length === 0) {
			return null;
		}

		// 构建每个音频源的滤镜
		const sourceFilters: string[] = [];
		const inputs: string[] = [];

		for (let i = 0; i < sources.length; i++) {
			const source = sources[i];
			inputs.push(source.audioPath);
			// sourceIndex (i) for output label, ffmpegInputIndex (i + offset) for input reference
			sourceFilters.push(buildAudioSourceFilter(source, i, i + inputIndexOffset, totalDuration));
		}

		// 构建混合滤镜
		const mixFilter = buildAudioMixFilter(sources.length);

		// 组合完整的滤镜链
		let filterComplex: string;
		if (sources.length === 1) {
			filterComplex = `${sourceFilters[0]};${mixFilter}anull[aout]`;
		} else {
			filterComplex = `${sourceFilters.join(';')};${mixFilter}`;
		}

		// 添加重采样和声道转换
		filterComplex += `;[aout]aresample=${sampleRate},aformat=sample_rates=${sampleRate}:channel_layouts=stereo[audio_final]`;

		console.log('[AudioCompositionService] Generated filter_complex:', filterComplex);
		console.log('[AudioCompositionService] Audio inputs:', inputs);

		return {
			inputs,
			filterComplex,
			outputMap: '[audio_final]',
		};
	}
}

// =============================================================================
// Singleton
// =============================================================================

let instance: AudioCompositionService | null = null;

/**
 * 获取 AudioCompositionService 单例
 */
export function getAudioCompositionService(): AudioCompositionService {
	if (!instance) {
		instance = new AudioCompositionService();
	}
	return instance;
}
