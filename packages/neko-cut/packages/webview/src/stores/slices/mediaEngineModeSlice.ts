/**
 * Media Engine Mode Slice
 *
 * Manages media engine mode state in Webview.
 * Communicates with Extension Host via postMessage.
 *
 * Modes:
 * - basic: WebCodecs + libav.js + WebGPU (runs in Webview)
 * - compatible: Native FFmpeg + wgpu (runs in Extension Host)
 */

import { StateCreator } from 'zustand';
import type {
	MediaEngineMode,
	ModePreference,
	DownloadStatus,
	ModeSelectionResult,
	ResolveAutoModeContext,
	TimelineMediaAnalysisResult,
} from '@neko/shared';
import { postMessage } from '../../utils/vscodeApi';
import { getKeyframeCacheClient } from '../../services/KeyframeCacheClient';
import type { ProjectSlice } from './projectSlice';
import type { ProjectData } from '../../types';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract all media file paths from project data
 * Only extracts paths from media and audio elements (files that need codec analysis)
 */
function extractMediaPaths(project: ProjectData): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();

	for (const track of project.tracks) {
		for (const element of track.elements) {
			if (element.type === 'media' || element.type === 'audio') {
				const src = element.src;
				if (src && !seen.has(src)) {
					seen.add(src);
					paths.push(src);
				}
			}
		}
	}

	return paths;
}

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
 * Trigger keyframe cache warmup based on current mode
 * - Basic mode: Extension handles caching (no action needed here)
 * - Compat mode: Call Rust HTTP API via KeyframeCacheClient
 */
async function triggerKeyframeCacheWarmup(
	getState: () => MediaEngineModeSlice & ProjectSlice & { currentTime?: number },
	mode: MediaEngineMode
): Promise<void> {
	if (mode !== 'compatible') {
		console.log('[MediaEngineModeSlice] Skipping cache warmup for non-compat mode');
		return;
	}

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
			mode,
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
	/** Mode state per project (keyed by project ID/path) */
	modeByProject: Record<string, MediaEngineMode>;
	/** Track which projects have had their mode resolved (per principle.md: only resolve on timeline open) */
	modeResolvedByProject: Record<string, boolean>;
	/** Currently active project ID */
	activeProjectId: string | null;
	/** Current active mode (derived from activeProjectId and modeByProject) */
	currentMode: MediaEngineMode | null;
	/** User preference setting */
	modePreference: ModePreference;
	/** Whether compatible mode is installed */
	compatibleModeInstalled: boolean;
	/** Download status for compatible mode */
	downloadStatus: DownloadStatus;
	/** Whether mode is being determined/switched */
	isModeLoading: boolean;
	/** Error message if any */
	modeError: string | null;
	/** Last analysis result for current media */
	lastModeAnalysis: ModeSelectionResult | null;
	/** Last timeline media analysis result */
	lastTimelineAnalysis: TimelineMediaAnalysisResult | null;
	/** Frame server port for compat mode (set by Extension) */
	frameServerPort: number | null;

	// Actions
	/** Set active project ID */
	setActiveProject: (projectId: string) => void;
	/** Set frame server port (called when Extension sends port info) */
	setFrameServerPort: (port: number | null) => void;
	/** Set mode for a specific project */
	setProjectMode: (projectId: string, mode: MediaEngineMode) => void;
	/** Get mode for a specific project */
	getProjectMode: (projectId: string) => MediaEngineMode | null;
	/** Set mode preference and request mode switch */
	setModePreference: (preference: ModePreference) => void;
	/** Set mode preference with context and media paths (for editor context) */
	setModePreferenceWithContext: (
		preference: ModePreference,
		context: ResolveAutoModeContext,
		mediaPaths?: string[],
		projectDir?: string
	) => void;
	/**
	 * Resolve auto mode based on timeline media (editor context)
	 * Per docs/principle.md: "仅在打开时间线时进行判断，不要自动切换"
	 * This will only execute if the project hasn't been resolved yet.
	 * Use forceResolveAutoModeForTimeline for user-initiated mode switch.
	 */
	resolveAutoModeForTimeline: (mediaPaths: string[], projectDir?: string) => void;
	/**
	 * Force resolve auto mode (for user-initiated mode switch)
	 * Use this when user manually requests mode re-evaluation.
	 */
	forceResolveAutoModeForTimeline: (mediaPaths: string[], projectDir?: string) => void;
	/** Start download of compatible mode */
	startCompatibleModeDownload: () => void;
	/** Refresh current mode status from Extension */
	refreshModeStatus: () => void;
	/** Analyze media and get mode recommendation */
	analyzeMediaForMode: (videoPath: string) => void;

	// Internal actions (called from message handlers)
	_updateModeState: (updates: Partial<MediaEngineModeSlice>) => void;
	_setDownloadProgress: (progress: number, state: DownloadStatus['state']) => void;
	_setDownloadComplete: (success: boolean, error?: string, version?: string) => void;
	_setModeAnalysis: (analysis: ModeSelectionResult) => void;
	_setResolvedAutoMode: (
		mode: MediaEngineMode,
		analysis?: TimelineMediaAnalysisResult,
		requiresDownload?: boolean
	) => void;
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
	modeByProject: {},
	modeResolvedByProject: {},
	activeProjectId: null,
	currentMode: null,
	modePreference: 'auto',
	compatibleModeInstalled: false,
	downloadStatus: {
		installed: false,
		state: 'idle',
	},
	isModeLoading: false,
	modeError: null,
	lastModeAnalysis: null,
	lastTimelineAnalysis: null,
	frameServerPort: null,

	// Actions
	setActiveProject: (projectId) => {
		const { modeByProject } = get();
		set({
			activeProjectId: projectId,
			currentMode: modeByProject[projectId] ?? null,
		});
	},

	setFrameServerPort: (port) => {
		set({ frameServerPort: port });
		// Update KeyframeCacheClient with the new port
		const client = getKeyframeCacheClient();
		client.setServerPort(port);

		// Trigger cache warmup if we're in compatible mode and port just became available
		// This handles the case where mode was resolved before port was set
		const { currentMode, modeResolvedByProject, activeProjectId } = get();
		if (
			port &&
			currentMode === 'compatible' &&
			activeProjectId &&
			modeResolvedByProject[activeProjectId]
		) {
			triggerKeyframeCacheWarmup(get, currentMode);
		}
	},

	setProjectMode: (projectId, mode) => {
		const { activeProjectId } = get();
		set((state) => ({
			modeByProject: {
				...state.modeByProject,
				[projectId]: mode,
			},
			// Update currentMode if this is the active project
			currentMode: projectId === activeProjectId ? mode : state.currentMode,
		}));
	},

	getProjectMode: (projectId) => {
		return get().modeByProject[projectId] ?? null;
	},

	setModePreference: (preference) => {
		const { activeProjectId } = get();
		// Optimistic update: set preference immediately so UI reflects user's choice
		set({ modePreference: preference, isModeLoading: true, modeError: null });

		// For 'auto' mode in editor context, include timeline media paths
		// so Extension can analyze and choose the best mode
		if (preference === 'auto') {
			const { project, projectRoot } = get();
			if (project) {
				const mediaPaths = extractMediaPaths(project);
				postMessage({
					type: 'mediaEngine:setMode',
					requestId: generateRequestId('setMode'),
					timestamp: Date.now(),
					payload: {
						mode: preference,
						context: 'editor' as ResolveAutoModeContext,
						mediaPaths,
						projectDir: projectRoot ?? undefined,
						projectId: activeProjectId ?? undefined,
					},
				});
				return;
			}
		}

		postMessage({
			type: 'mediaEngine:setMode',
			requestId: generateRequestId('setMode'),
			timestamp: Date.now(),
			payload: {
				mode: preference,
				projectId: activeProjectId ?? undefined,
			},
		});
	},

	setModePreferenceWithContext: (preference, context, mediaPaths, projectDir) => {
		const { activeProjectId } = get();
		// Optimistic update
		set({ modePreference: preference, isModeLoading: true, modeError: null });
		postMessage({
			type: 'mediaEngine:setMode',
			requestId: generateRequestId('setMode'),
			timestamp: Date.now(),
			payload: {
				mode: preference,
				context,
				mediaPaths,
				projectDir,
				projectId: activeProjectId ?? undefined,
			},
		});
	},

	/**
	 * Resolve auto mode for timeline (only on first open)
	 * Per docs/principle.md: "仅在打开时间线时进行判断，不要自动切换"
	 */
	resolveAutoModeForTimeline: (mediaPaths, projectDir) => {
		const { activeProjectId, modeResolvedByProject } = get();

		// Check if this project has already been resolved
		// Per principle.md: only resolve on timeline open, not auto-switch
		if (activeProjectId && modeResolvedByProject[activeProjectId]) {
			console.log(
				`[MediaEngineModeSlice] Mode already resolved for project ${activeProjectId}, skipping. ` +
				`Use forceResolveAutoModeForTimeline for manual re-evaluation.`
			);
			return;
		}

		// Mark as resolving (will be marked as resolved when response comes back)
		set({ isModeLoading: true, modeError: null });
		postMessage({
			type: 'mediaEngine:resolveAutoMode',
			requestId: generateRequestId('resolveAutoMode'),
			timestamp: Date.now(),
			payload: {
				context: 'editor',
				mediaPaths,
				projectDir,
				projectId: activeProjectId ?? undefined,
			},
		});
	},

	/**
	 * Force resolve auto mode (for user-initiated mode switch)
	 * This bypasses the "already resolved" check for manual re-evaluation.
	 */
	forceResolveAutoModeForTimeline: (mediaPaths, projectDir) => {
		const { activeProjectId } = get();

		// Reset resolved state for this project to allow re-resolution
		if (activeProjectId) {
			set((state) => ({
				modeResolvedByProject: {
					...state.modeResolvedByProject,
					[activeProjectId]: false,
				},
			}));
		}

		set({ isModeLoading: true, modeError: null });
		postMessage({
			type: 'mediaEngine:resolveAutoMode',
			requestId: generateRequestId('resolveAutoMode'),
			timestamp: Date.now(),
			payload: {
				context: 'editor',
				mediaPaths,
				projectDir,
				projectId: activeProjectId ?? undefined,
			},
		});
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

	analyzeMediaForMode: (videoPath) => {
		set({ isModeLoading: true, modeError: null });
		postMessage({
			type: 'mediaEngine:analyzeMedia',
			requestId: generateRequestId('analyze'),
			timestamp: Date.now(),
			payload: { videoPath },
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

	_setModeAnalysis: (analysis) => {
		set({
			lastModeAnalysis: analysis,
			isModeLoading: false,
		});
	},

	_setResolvedAutoMode: (mode, analysis, requiresDownload) => {
		const { activeProjectId, frameServerPort } = get();
		set((state) => ({
			// Update mode for active project
			modeByProject: activeProjectId
				? { ...state.modeByProject, [activeProjectId]: mode }
				: state.modeByProject,
			// Mark project as resolved (per principle.md: only resolve on timeline open)
			modeResolvedByProject: activeProjectId
				? { ...state.modeResolvedByProject, [activeProjectId]: true }
				: state.modeResolvedByProject,
			// Update currentMode directly
			currentMode: activeProjectId ? mode : state.currentMode,
			lastTimelineAnalysis: analysis ?? null,
			isModeLoading: false,
			// If compatible mode is required but not installed, mark in error state
			modeError: requiresDownload ? '需要安装兼容模式' : null,
		}));

		// Trigger keyframe cache warmup based on mode
		// This is called when timeline opens or mode is resolved
		if (mode === 'compatible' && frameServerPort && !requiresDownload) {
			// For compat mode, trigger Rust HTTP API cache
			triggerKeyframeCacheWarmup(get, mode);
		}
	},
});
