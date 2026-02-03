/**
 * Media Engine Mode Slice
 *
 * Manages media engine mode state in Webview.
 * Communicates with Extension Host via postMessage.
 *
 * Only compatible mode is supported (Native FFmpeg + wgpu via NAPI).
 */

import { StateCreator } from 'zustand';
import type {
	MediaEngineMode,
	DownloadStatus,
} from '@neko/shared';
import { postMessage } from '../../utils/vscodeApi';
import { getKeyframeCacheClient } from '../../services/KeyframeCacheClient';
import type { ProjectSlice } from './projectSlice';
import type { ProjectData } from '../../types';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract video sources from project data for keyframe caching
 */
function extractVideoSources(project: ProjectData): Array<{
	videoPath: string;
	startTime: number;
	trimStart: number;
	duration: number;
}> {
	const sources: Array<{
		videoPath: string;
		startTime: number;
		trimStart: number;
		duration: number;
	}> = [];

	for (const track of project.tracks) {
		if (track.type !== 'media') continue;

		for (const element of track.elements) {
			if (element.type === 'media' && element.src) {
				sources.push({
					videoPath: element.src,
					startTime: element.startTime,
					trimStart: element.trimStart ?? 0,
					duration: element.duration,
				});
			}
		}
	}

	return sources;
}

/**
 * Trigger keyframe cache warmup for compatible mode
 * Calls Rust HTTP API via KeyframeCacheClient
 */
async function triggerKeyframeCacheWarmup(
	getState: () => MediaEngineModeSlice & ProjectSlice & { currentTime?: number }
): Promise<void> {
	const state = getState();
	const { frameServerPort } = state;

	if (!frameServerPort) {
		console.warn('[MediaEngineModeSlice] Frame server port not available for cache warmup');
		return;
	}

	// Get project data from ProjectSlice
	const project = state.project;
	if (!project) {
		console.warn('[MediaEngineModeSlice] No project data available for cache warmup');
		return;
	}

	const videoSources = extractVideoSources(project);
	if (videoSources.length === 0) {
		console.log('[MediaEngineModeSlice] No video sources to cache');
		return;
	}

	// Get current playhead time (default to 0)
	const playheadTime = state.currentTime ?? 0;

	console.log(
		`[MediaEngineModeSlice] Triggering compat mode cache warmup: ` +
		`${videoSources.length} sources, playhead=${playheadTime}`
	);

	try {
		const client = getKeyframeCacheClient();
		await client.triggerWarmup(
			videoSources,
			playheadTime,
			'compatible',
			project.resolution?.width ?? 1920,
			project.resolution?.height ?? 1080
		);
	} catch (error) {
		console.error('[MediaEngineModeSlice] Cache warmup failed:', error);
	}
}

// =============================================================================
// Types
// =============================================================================

export interface MediaEngineModeSlice {
	// State
	/** Current mode (always 'compatible') */
	currentMode: MediaEngineMode;
	/** Whether compatible mode is installed */
	compatibleModeInstalled: boolean;
	/** Download status for compatible mode */
	downloadStatus: DownloadStatus;
	/** Whether mode is being determined/switched */
	isModeLoading: boolean;
	/** Error message if any */
	modeError: string | null;
	/** Frame server port for compat mode (set by Extension) */
	frameServerPort: number | null;

	// Actions
	/** Set frame server port (called when Extension sends port info) */
	setFrameServerPort: (port: number | null) => void;
	/** Start download of compatible mode */
	startCompatibleModeDownload: () => void;
	/** Refresh current mode status from Extension */
	refreshModeStatus: () => void;

	// Internal actions (called from message handlers)
	_updateModeState: (updates: Partial<MediaEngineModeSlice>) => void;
	_setDownloadProgress: (progress: number, state: DownloadStatus['state']) => void;
	_setDownloadComplete: (success: boolean, error?: string, version?: string) => void;
}

// =============================================================================
// Request ID Generator
// =============================================================================

let requestCounter = 0;

function generateRequestId(prefix: string): string {
	return `${prefix}_${Date.now()}_${++requestCounter}`;
}

// =============================================================================
// Slice Creator
// =============================================================================

export const createMediaEngineModeSlice: StateCreator<
	MediaEngineModeSlice & ProjectSlice,
	[],
	[],
	MediaEngineModeSlice
> = (set, get) => ({
	// Initial state
	currentMode: 'compatible',
	compatibleModeInstalled: false,
	downloadStatus: {
		installed: false,
		state: 'idle',
	},
	isModeLoading: false,
	modeError: null,
	frameServerPort: null,

	// Actions
	setFrameServerPort: (port) => {
		set({ frameServerPort: port });
		// Update KeyframeCacheClient with the new port
		const client = getKeyframeCacheClient();
		client.setServerPort(port);

		// Trigger cache warmup when port becomes available
		if (port) {
			triggerKeyframeCacheWarmup(get);
		}
	},

	startCompatibleModeDownload: () => {
		set({
			isModeLoading: true,
			modeError: null,
			downloadStatus: {
				installed: false,
				state: 'downloading',
				progress: 0,
			},
		});
		postMessage({
			type: 'mediaEngine:startDownload',
			requestId: generateRequestId('download'),
			timestamp: Date.now(),
		});
	},

	refreshModeStatus: () => {
		set({ isModeLoading: true });
		// Request current mode
		postMessage({
			type: 'mediaEngine:getMode',
			requestId: generateRequestId('getMode'),
			timestamp: Date.now(),
		});
		// Request download status
		postMessage({
			type: 'mediaEngine:getDownloadStatus',
			requestId: generateRequestId('getDownloadStatus'),
			timestamp: Date.now(),
		});
	},

	// Internal actions
	_updateModeState: (updates) => {
		set((state) => ({
			...state,
			...updates,
			isModeLoading: updates.isModeLoading ?? false,
		}));
	},

	_setDownloadProgress: (progress, downloadState) => {
		set((state) => ({
			downloadStatus: {
				...state.downloadStatus,
				progress,
				state: downloadState,
			},
		}));
	},

	_setDownloadComplete: (success, error, version) => {
		set((state) => ({
			isModeLoading: false,
			compatibleModeInstalled: success,
			downloadStatus: {
				...state.downloadStatus,
				installed: success,
				state: success ? 'completed' : 'error',
				error: error,
				version: version,
				progress: success ? 100 : state.downloadStatus.progress,
			},
			modeError: error ?? null,
		}));
	},
});
