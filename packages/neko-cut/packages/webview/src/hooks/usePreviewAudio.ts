/**
 * usePreviewAudio - 预览音频播放 Hook
 * Preview Audio Playback Hook
 *
 * 使用 StreamingAudioPlayer 实现按需加载的流式音频播放
 * - Extension 端使用 FFmpeg 解码音频片段
 * - 支持 AAC 等 VSCode Webview 不支持的格式
 * - 自动缓存已解码的片段
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { StreamingAudioPlayer, type AudioSourceInfo } from '../audio';
import type { ProjectData, MediaElement, AudioElement } from '../types';
import { detectVideoHasAudio, isVideoFile, isAudioFile } from '../utils/audioDetection';

// =============================================================================
// Types
// =============================================================================

interface UsePreviewAudioOptions {
	enabled?: boolean;
}

interface UsePreviewAudioResult {
	isInitialized: boolean;
	isLoading: boolean;
	error: string | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 从项目中提取所有音频源信息（同步版本，只用于检测变化）
 */
function extractAudioSourceIds(project: ProjectData): Set<string> {
	const ids = new Set<string>();

	for (const track of project.tracks) {
		if (track.muted) continue;

		for (const element of track.elements) {
			if (element.hidden || element.muted) continue;

			const isAudio = element.type === 'audio';
			const isMedia = element.type === 'media';

			if (isAudio || isMedia) {
				const mediaElement = element as MediaElement | AudioElement;
				const src = mediaElement.src;

				const isAudioSrc = isAudioFile(src);
				const isVideoSrc = isVideoFile(src);
				if (!isAudioSrc && !isVideoSrc) continue;

				if (isMedia && 'linkedAudioId' in element && element.linkedAudioId) {
					continue;
				}

				// Use element.id as unique identifier (allows same src to be used multiple times)
				ids.add(element.id);
			}
		}
	}

	return ids;
}

/**
 * 从项目中提取单个音频源信息
 */
function getAudioSourceInfo(
	project: ProjectData,
	elementId: string
): { element: MediaElement | AudioElement } | null {
	for (const track of project.tracks) {
		if (track.muted) continue;

		for (const element of track.elements) {
			if (element.hidden || element.muted) continue;

			const isAudio = element.type === 'audio';
			const isMedia = element.type === 'media';

			if (isAudio || isMedia) {
				if (element.id === elementId) {
					return { element: element as MediaElement | AudioElement };
				}
			}
		}
	}

	return null;
}

/**
 * 构建 AudioSourceInfo
 */
function buildAudioSourceInfo(element: MediaElement | AudioElement): AudioSourceInfo {
	const audio = element.audio;
	const effectiveDuration = element.duration - element.trimStart - element.trimEnd;

	return {
		id: element.id,
		src: element.src,
		uri: '', // 新实现不使用 uri
		startTime: element.startTime,
		endTime: element.startTime + effectiveDuration,
		trimStart: element.trimStart,
		duration: effectiveDuration,
		volume: typeof audio?.volume === 'number' ? audio.volume : (audio?.volume?.baseValue ?? 1.0),
		pan: typeof audio?.pan === 'number' ? audio.pan : (audio?.pan?.baseValue ?? 0),
		muted: audio?.muted ?? false,
		fadeIn: audio?.fadeIn ?? 0,
		fadeOut: audio?.fadeOut ?? 0,
	};
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * 预览音频播放 Hook
 */
export function usePreviewAudio(
	project: ProjectData | null,
	currentTime: number,
	isPlaying: boolean,
	previewVolume: number,
	previewMuted: boolean,
	options: UsePreviewAudioOptions = {}
): UsePreviewAudioResult {
	const { enabled = true } = options;

	// State
	const [isInitialized, setIsInitialized] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Refs
	const playerRef = useRef<StreamingAudioPlayer | null>(null);
	const lastPlayingRef = useRef(false);
	const lastTimeRef = useRef(0);
	const sourcesRef = useRef<Set<string>>(new Set());

	// Get or create player
	const getPlayer = useCallback((): StreamingAudioPlayer => {
		if (!playerRef.current) {
			playerRef.current = new StreamingAudioPlayer({
				bufferAhead: 2,
				bufferBehind: 0.5,
				sampleRate: 48000,
				segmentDuration: 10, // 每次解码 10 秒
			});
		}
		return playerRef.current;
	}, []);

	// Initialize player
	useEffect(() => {
		if (!enabled) return;

		const player = getPlayer();

		// Initialize immediately (AudioContext will resume on first play)
		player
			.initialize()
			.then(() => {
				setIsInitialized(true);
			})
			.catch((e) => {
				console.error('[usePreviewAudio] Failed to initialize:', e);
				setError('Failed to initialize audio');
			});

		return () => {
			player.dispose();
			playerRef.current = null;
			setIsInitialized(false);
		};
	}, [enabled, getPlayer]);

	// Sync sources with project
	useEffect(() => {
		if (!isInitialized || !project) return;

		const player = getPlayer();
		const newSourceIds = extractAudioSourceIds(project);

		// Remove sources that no longer exist
		for (const id of sourcesRef.current) {
			if (!newSourceIds.has(id)) {
				player.removeSource(id);
				sourcesRef.current.delete(id);
			}
		}

		// Add or update sources
		const syncSources = async () => {
			setIsLoading(true);

			for (const id of newSourceIds) {
				const sourceData = getAudioSourceInfo(project, id);
				if (!sourceData) continue;

				const { element } = sourceData;
				const src = element.src;

				// Check if video file has audio track before adding
				if (isVideoFile(src)) {
					const hasAudio = await detectVideoHasAudio(src);
					if (!hasAudio) {
						// Skip video files without audio track
						continue;
					}
				}

				const info = buildAudioSourceInfo(element);

				if (!sourcesRef.current.has(id)) {
					// Add new source
					try {
						await player.addSource(info);
						sourcesRef.current.add(id);
					} catch (e) {
						console.error(`[usePreviewAudio] Failed to add source: ${id}`, e);
					}
				} else {
					// Update existing source
					player.updateSource(id, info);
				}
			}

			setIsLoading(false);
		};

		syncSources().catch((e) => {
			console.error('[usePreviewAudio] Failed to sync sources:', e);
			setError('Failed to load audio');
			setIsLoading(false);
		});
	}, [isInitialized, project, getPlayer]);

	// Playback control
	useEffect(() => {
		if (!isInitialized) return;

		const player = getPlayer();
		const wasPlaying = lastPlayingRef.current;
		const lastTime = lastTimeRef.current;

		lastPlayingRef.current = isPlaying;
		lastTimeRef.current = currentTime;

		// Pause -> Stop
		if (!isPlaying) {
			if (wasPlaying) {
				player.pause();
			}
			return;
		}

		// Start playing
		if (!wasPlaying && isPlaying) {
			player.play(currentTime).catch((e) => {
				console.error('[usePreviewAudio] Failed to play:', e);
			});
			return;
		}

		// Seek detection
		const timeDiff = Math.abs(currentTime - lastTime);
		if (timeDiff > 0.3) {
			player.seek(currentTime).catch((e) => {
				console.error('[usePreviewAudio] Failed to seek:', e);
			});
			return;
		}

		// Normal playback - sync (sync 是同步方法，不返回 Promise)
		player.sync(currentTime);
	}, [isInitialized, isPlaying, currentTime, getPlayer]);

	// Volume control
	useEffect(() => {
		if (!isInitialized) return;

		const player = getPlayer();
		const effectiveVolume = previewMuted ? 0 : previewVolume;
		player.setMasterVolume(effectiveVolume);
	}, [isInitialized, previewVolume, previewMuted, getPlayer]);

	return {
		isInitialized,
		isLoading,
		error,
	};
}

export default usePreviewAudio;
