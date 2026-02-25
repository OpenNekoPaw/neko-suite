/**
 * ExportService - Unified video export service
 *
 * Responsibilities:
 * - Dispatches export requests to NativeEngine via FrameServerService
 * - Polls export progress and emits events
 * - Manages export lifecycle (start, poll, cancel)
 * - Independent of Webview — supports VSCode commands and tool handlers
 *
 * Action protocol:
 * - timelines:export          — start export
 * - timelines:export_progress — poll progress
 * - timelines:export_cancel   — cancel export
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { FrameServerService } from './FrameServerService';
import type { ProjectData } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

/** Export configuration from UI */
export interface ExportConfig {
	outputPath: string;
	format: 'mp4' | 'webm' | 'mov' | 'mkv';
	width: number;
	height: number;
	fps: number;
	quality: 'low' | 'medium' | 'high';
	audioBitrate: number;
	/** Explicit video codec — if omitted, default for format is used */
	videoCodec?: string;
	/** Explicit audio codec — if omitted, default for format is used */
	audioCodec?: string;
}

/** Progress reported by Rust export pipeline */
export interface ExportProgress {
	jobId: string;
	state: string;
	progress: number;
	currentFrame: number;
	totalFrames: number;
	elapsedMs: number;
	estimatedRemainingMs: number;
	error?: string;
	stats?: {
		avgFps: number;
		cpuUsagePercent: number;
		gpuUsagePercent?: number;
		hwDecodeMs: number;
		compositeMs: number;
		encodeSubmitMs: number;
		peakMemoryBytes: number;
		vramUsageBytes?: number;
	};
}

/** Export result */
export interface ExportResult {
	success: boolean;
	outputPath?: string;
	error?: string;
	totalFrames?: number;
	elapsedMs?: number;
}

// Internal ActionRequest/ActionResponse types (matching MediaService pattern)
interface ActionRequest {
	group: string;
	action: string;
	id?: string;
	options?: Record<string, unknown>;
	body?: unknown;
}

interface ActionResponse {
	id: string;
	status: 'ok' | 'error' | 'pending' | 'progress';
	data?: Record<string, unknown>;
	error?: { code: string; message: string } | null;
}

// =============================================================================
// Constants
// =============================================================================

const PROGRESS_POLL_INTERVAL_MS = 200;

/** Terminal states that stop polling */
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'error']);

/** Default video codec per container format (serde: rename_all = "lowercase") */
const FORMAT_TO_VIDEO_CODEC: Record<string, string> = {
	mp4: 'h264',
	mov: 'h264',
	webm: 'vp9',
	mkv: 'h264',
};

/** Default audio codec per container format (serde: rename_all = "lowercase") */
const FORMAT_TO_AUDIO_CODEC: Record<string, string> = {
	mp4: 'aac',
	mov: 'aac',
	webm: 'opus',
	mkv: 'aac',
};

/** Map UI quality to Rust EncoderPreset and base bitrate (for 1080p) */
const QUALITY_PRESETS: Record<string, { preset: string; baseBitrate: number }> = {
	high: { preset: 'slow', baseBitrate: 12_000_000 },
	medium: { preset: 'medium', baseBitrate: 6_000_000 },
	low: { preset: 'fast', baseBitrate: 3_000_000 },
};

// =============================================================================
// ExportService
// =============================================================================

export class ExportService implements vscode.Disposable {
	private _currentJobId: string | null = null;
	private _pollingTimer: ReturnType<typeof setInterval> | null = null;
	private _disposed = false;

	// Event emitters
	private readonly _onDidProgress = new vscode.EventEmitter<ExportProgress>();
	private readonly _onDidComplete = new vscode.EventEmitter<ExportResult>();
	private readonly _onDidError = new vscode.EventEmitter<string>();
	private readonly _onDidCancel = new vscode.EventEmitter<void>();

	/** Fired when export progress is updated */
	readonly onDidProgress = this._onDidProgress.event;
	/** Fired when export completes successfully */
	readonly onDidComplete = this._onDidComplete.event;
	/** Fired when export fails */
	readonly onDidError = this._onDidError.event;
	/** Fired when export is cancelled */
	readonly onDidCancel = this._onDidCancel.event;

	constructor(
		private readonly frameServer: FrameServerService,
		private readonly documentDir: string
	) {}

	// =========================================================================
	// Public API
	// =========================================================================

	/**
	 * Start an export job
	 * @returns The job ID for tracking
	 */
	async startExport(project: ProjectData, config: ExportConfig): Promise<string> {
		if (this._currentJobId) {
			throw new Error('An export is already in progress');
		}

		if (!this.frameServer.isAvailable()) {
			throw new Error('NativeEngine not available');
		}

		const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

		// Compute duration from project tracks
		const duration = this.computeProjectDuration(project);

		// Build the ExportJobConfig for Rust
		const exportJobConfig = this.buildExportJobConfig(jobId, project, config, duration);

		// Dispatch timelines:export
		const response = await this.dispatch({
			group: 'timelines',
			action: 'export',
			body: exportJobConfig,
		});

		const data = response.data;
		const actualJobId = (data?.jobId as string) ?? jobId;
		const totalFrames = (data?.totalFrames as number) ?? Math.ceil(duration * config.fps);

		this._currentJobId = actualJobId;

		console.log(`[ExportService] Export started: jobId=${actualJobId}, totalFrames=${totalFrames}`);

		// Start progress polling
		this.startPolling();

		return actualJobId;
	}

	/**
	 * Cancel the current export job
	 */
	async cancelExport(): Promise<void> {
		if (!this._currentJobId) return;

		const jobId = this._currentJobId;
		this.stopPolling();

		try {
			await this.dispatch({
				group: 'timelines',
				action: 'export_cancel',
				id: jobId,
			});
			console.log(`[ExportService] Export cancelled: jobId=${jobId}`);
		} catch (error) {
			console.warn('[ExportService] Failed to cancel export:', error);
		}

		this._currentJobId = null;
		this._onDidCancel.fire();
	}

	/**
	 * Get current export progress (one-shot query)
	 */
	async getProgress(): Promise<ExportProgress | null> {
		if (!this._currentJobId) return null;

		try {
			const response = await this.dispatch({
				group: 'timelines',
				action: 'export_progress',
				id: this._currentJobId,
			});
			return this.parseProgress(response.data);
		} catch {
			return null;
		}
	}

	/**
	 * Whether an export is currently in progress
	 */
	isExporting(): boolean {
		return this._currentJobId !== null;
	}

	/**
	 * Get the current job ID (if any)
	 */
	getCurrentJobId(): string | null {
		return this._currentJobId;
	}

	// =========================================================================
	// Progress Polling
	// =========================================================================

	private startPolling(): void {
		this.stopPolling();

		this._pollingTimer = setInterval(async () => {
			if (!this._currentJobId || this._disposed) {
				this.stopPolling();
				return;
			}

			try {
				const response = await this.dispatch({
					group: 'timelines',
					action: 'export_progress',
					id: this._currentJobId,
				});

				const progress = this.parseProgress(response.data);
				if (!progress) return;

				this._onDidProgress.fire(progress);

				// Check for terminal states
				if (TERMINAL_STATES.has(progress.state)) {
					this.stopPolling();
					const jobId = this._currentJobId;
					this._currentJobId = null;

					if (progress.state === 'completed') {
						this._onDidComplete.fire({
							success: true,
							outputPath: undefined, // Rust doesn't echo it back in progress
							totalFrames: progress.totalFrames,
							elapsedMs: progress.elapsedMs,
						});
					} else if (progress.state === 'cancelled') {
						this._onDidCancel.fire();
					} else if (progress.state === 'error') {
						this._onDidError.fire(progress.error ?? 'Export failed');
					}

					console.log(`[ExportService] Export ${progress.state}: jobId=${jobId}`);
				}
			} catch (error) {
				console.warn('[ExportService] Progress poll error:', error);
			}
		}, PROGRESS_POLL_INTERVAL_MS);
	}

	private stopPolling(): void {
		if (this._pollingTimer) {
			clearInterval(this._pollingTimer);
			this._pollingTimer = null;
		}
	}

	// =========================================================================
	// Config Building
	// =========================================================================

	/**
	 * Build ExportJobConfig for Rust timelines:export action
	 */
	private buildExportJobConfig(
		jobId: string,
		project: ProjectData,
		config: ExportConfig,
		duration: number
	): Record<string, unknown> {
		const qualityPreset = QUALITY_PRESETS[config.quality] ?? QUALITY_PRESETS.medium;

		// Scale bitrate by resolution relative to 1080p
		const pixelRatio = (config.width * config.height) / (1920 * 1080);
		const videoBitrate = Math.round(qualityPreset.baseBitrate * pixelRatio);

		// Build timeline from project data, resolving relative paths
		const timeline = this.buildTimeline(project, duration);

		return {
			jobId,
			outputPath: config.outputPath,
			settings: {
				width: config.width,
				height: config.height,
				fps: config.fps,
				videoCodec: config.videoCodec ?? FORMAT_TO_VIDEO_CODEC[config.format] ?? 'h264',
				videoBitrate,
				audioCodec: config.audioCodec ?? FORMAT_TO_AUDIO_CODEC[config.format] ?? 'aac',
				audioBitrate: config.audioBitrate,
				hwEncoder: 'auto',
				preset: qualityPreset.preset,
				useZeroCopyGpu: true,
			},
			timeline,
		};
	}

	/**
	 * Build a domain Timeline object for the Rust engine.
	 *
	 * Explicitly constructs domain-compatible elements instead of spreading
	 * raw project data, because the domain types (domain/timeline.rs) differ
	 * from the JVI file format in several ways:
	 * - Audio volume/pan must be plain numbers (not {baseValue: N} objects)
	 * - Transition type maps to "transitionType" (not "type")
	 * - EffectParams schema differs from EffectInstance
	 */
	private buildTimeline(project: ProjectData, duration: number): Record<string, unknown> {
		const tracks = project.tracks.map(track => ({
			id: track.id,
			name: track.name ?? '',
			type: track.type,
			elements: track.elements.map(el => this.convertElement(el)),
			muted: track.muted ?? false,
			locked: track.locked ?? false,
			hidden: track.hidden ?? false,
			isMain: track.isMain ?? false,
		}));

		return {
			duration,
			resolution: project.resolution,
			fps: project.fps,
			tracks,
			defaults: project.defaults ?? null,
		};
	}

	/**
	 * Convert a project element to domain-compatible format.
	 * Handles field name mapping and value sanitization.
	 */
	private convertElement(element: Record<string, unknown>): Record<string, unknown> {
		const el = element as Record<string, unknown>;

		// Base element fields (shared by all element types)
		const result: Record<string, unknown> = {
			id: el.id,
			name: el.name ?? '',
			type: el.type,
			startTime: this.asNumber(el.startTime, 0),
			duration: this.asNumber(el.duration, 0),
			trimStart: this.asNumber(el.trimStart, 0),
			trimEnd: this.asNumber(el.trimEnd, 0),
			opacity: this.asNumber(el.opacity, 1.0),
			blendMode: el.blendMode ?? 'normal',
			effects: [], // EffectInstance ↔ EffectParams schema differs; skip for export
			muted: el.muted ?? false,
			hidden: el.hidden ?? false,
			locked: el.locked ?? false,
		};

		// Transform
		const t = el.transform as Record<string, unknown> | undefined;
		if (t && typeof t === 'object') {
			result.transform = {
				x: this.asNumber(t.x, 0),
				y: this.asNumber(t.y, 0),
				scaleX: this.asNumber(t.scaleX, 1),
				scaleY: this.asNumber(t.scaleY, 1),
				rotation: this.asNumber(t.rotation, 0),
				anchorX: this.asNumber(t.anchorX, 0.5),
				anchorY: this.asNumber(t.anchorY, 0.5),
			};
		}

		// Type-specific fields (flattened into the element by Rust serde)
		switch (el.type) {
			case 'media': {
				const src = el.src as string | undefined;
				result.src = src ? this.resolveMediaPath(src) : '';
				if (el.resourceId) result.resourceId = el.resourceId;
				if (el.mediaType) result.mediaType = el.mediaType;
				if (el.linkedAudioId) result.linkedAudioId = el.linkedAudioId;
				if (el.audio) result.audio = this.sanitizeAudioProps(el.audio as Record<string, unknown>);
				break;
			}
			case 'audio': {
				const src = el.src as string | undefined;
				result.src = src ? this.resolveMediaPath(src) : '';
				if (el.resourceId) result.resourceId = el.resourceId;
				if (el.linkedVideoId) result.linkedVideoId = el.linkedVideoId;
				if (el.audio) result.audio = this.sanitizeAudioProps(el.audio as Record<string, unknown>);
				break;
			}
			case 'text':
				result.content = el.content ?? '';
				result.fontFamily = el.fontFamily ?? 'Arial';
				result.fontSize = this.asNumber(el.fontSize, 48);
				result.color = el.color ?? '#ffffff';
				result.backgroundColor = el.backgroundColor ?? 'transparent';
				result.textAlign = el.textAlign ?? 'center';
				result.fontWeight = el.fontWeight ?? 'normal';
				result.fontStyle = el.fontStyle ?? 'normal';
				result.textDecoration = el.textDecoration ?? 'none';
				result.lineHeight = this.asNumber(el.lineHeight, 1.2);
				result.letterSpacing = this.asNumber(el.letterSpacing, 0);
				result.strokeColor = el.strokeColor ?? 'transparent';
				result.strokeWidth = this.asNumber(el.strokeWidth, 0);
				if (el.shadow) result.shadow = el.shadow;
				break;
			case 'subtitle':
				result.text = el.text ?? '';
				result.fontSize = this.asNumber(el.fontSize, 48);
				result.color = el.color ?? '#ffffff';
				result.fontFamily = el.fontFamily ?? 'Arial';
				result.backgroundColor = el.backgroundColor ?? 'transparent';
				result.textAlign = el.textAlign ?? 'center';
				result.strokeColor = el.strokeColor ?? 'transparent';
				result.strokeWidth = this.asNumber(el.strokeWidth, 0);
				if (el.shadow) result.shadow = el.shadow;
				break;
			// shape: base fields are sufficient
		}

		// Speed properties
		const speed = el.speed as Record<string, unknown> | undefined;
		if (speed && typeof speed === 'object') {
			result.speed = {
				speed: this.asNumber(speed.speed, 1.0),
				reverse: speed.reverse ?? false,
				preservePitch: speed.preservePitch ?? true,
				...(speed.timeRemap ? { timeRemap: speed.timeRemap } : {}),
			};
		}

		// Transitions — map "type" → "transitionType", easing to PascalCase
		const transIn = el.transitionIn as Record<string, unknown> | undefined;
		if (transIn && typeof transIn === 'object') {
			result.transitionIn = {
				transitionType: transIn.type ?? '',
				duration: this.asNumber(transIn.duration, 0),
				easing: this.mapEasing(transIn.easing),
			};
		}
		const transOut = el.transitionOut as Record<string, unknown> | undefined;
		if (transOut && typeof transOut === 'object') {
			result.transitionOut = {
				transitionType: transOut.type ?? '',
				duration: this.asNumber(transOut.duration, 0),
				easing: this.mapEasing(transOut.easing),
			};
		}

		return result;
	}

	/**
	 * Sanitize audio properties: ensure volume/pan are plain numbers,
	 * not {baseValue: N} objects (which the JVI format may use).
	 */
	private sanitizeAudioProps(audio: Record<string, unknown>): Record<string, unknown> {
		return {
			volume: this.asNumber(audio.volume, 1.0),
			pan: this.asNumber(audio.pan, 0),
			muted: audio.muted ?? false,
			fadeIn: this.asNumber(audio.fadeIn, 0),
			fadeOut: this.asNumber(audio.fadeOut, 0),
			fadeInCurve: this.mapEasing(audio.fadeInCurve),
			fadeOutCurve: this.mapEasing(audio.fadeOutCurve),
			gain: this.asNumber(audio.gain, 0),
		};
	}

	/**
	 * Map frontend easing name (lowercase) to Rust EasingType (PascalCase).
	 * The Rust EasingType enum has no serde rename_all, so it expects PascalCase.
	 */
	private static readonly EASING_MAP: Record<string, string> = {
		linear: 'Linear',
		easein: 'EaseIn', easeinquad: 'EaseInQuad',
		easeout: 'EaseOut', easeoutquad: 'EaseOutQuad',
		easeinout: 'EaseInOut', easeinoutquad: 'EaseInOutQuad',
		easeincubic: 'EaseInCubic', easeoutcubic: 'EaseOutCubic', easeinoutcubic: 'EaseInOutCubic',
		easeinquart: 'EaseInQuart', easeoutquart: 'EaseOutQuart', easeinoutquart: 'EaseInOutQuart',
		easeinquint: 'EaseInQuint', easeoutquint: 'EaseOutQuint', easeinoutquint: 'EaseInOutQuint',
		easeinsine: 'EaseInSine', easeoutsine: 'EaseOutSine', easeinoutsine: 'EaseInOutSine',
		easeinexpo: 'EaseInExpo', easeoutexpo: 'EaseOutExpo', easeinoutexpo: 'EaseInOutExpo',
		easeincirc: 'EaseInCirc', easeoutcirc: 'EaseOutCirc', easeinoutcirc: 'EaseInOutCirc',
		easeinback: 'EaseInBack', easeoutback: 'EaseOutBack', easeinoutback: 'EaseInOutBack',
		easeinelastic: 'EaseInElastic', easeoutelastic: 'EaseOutElastic', easeinoutelastic: 'EaseInOutElastic',
		easeinbounce: 'EaseInBounce', easeoutbounce: 'EaseOutBounce', easeinoutbounce: 'EaseInOutBounce',
		cubicbezier: 'CubicBezier',
	};

	private mapEasing(value: unknown): string {
		if (typeof value !== 'string') return 'Linear';
		return ExportService.EASING_MAP[value.toLowerCase()] ?? value;
	}

	/**
	 * Coerce a value to a plain number.
	 * Handles: number, {baseValue: N}, null/undefined → default.
	 */
	private asNumber(value: unknown, defaultValue: number): number {
		if (typeof value === 'number' && !Number.isNaN(value)) return value;
		if (value && typeof value === 'object') {
			const obj = value as Record<string, unknown>;
			if (typeof obj.baseValue === 'number') return obj.baseValue;
		}
		return defaultValue;
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Compute the effective project duration from track elements
	 */
	private computeProjectDuration(project: ProjectData): number {
		let maxEnd = 0;
		for (const track of project.tracks) {
			for (const element of track.elements) {
				const end = element.startTime + element.duration;
				if (end > maxEnd) {
					maxEnd = end;
				}
			}
		}
		return maxEnd || 1; // Fallback to 1 second for empty projects
	}

	/**
	 * Resolve a media path to absolute (relative to .jvi document dir)
	 */
	private resolveMediaPath(mediaPath: string): string {
		if (path.isAbsolute(mediaPath)) return mediaPath;
		return path.resolve(this.documentDir, mediaPath);
	}

	/**
	 * Parse progress response data into ExportProgress
	 */
	private parseProgress(data: Record<string, unknown> | undefined): ExportProgress | null {
		if (!data) return null;

		const statsRaw = data.stats as Record<string, unknown> | undefined;

		return {
			jobId: (data.jobId as string) ?? '',
			state: (data.state as string) ?? 'pending',
			progress: (data.progress as number) ?? 0,
			currentFrame: (data.currentFrame as number) ?? 0,
			totalFrames: (data.totalFrames as number) ?? 0,
			elapsedMs: (data.elapsedMs as number) ?? 0,
			estimatedRemainingMs: (data.estimatedRemainingMs as number) ?? 0,
			error: data.error as string | undefined,
			stats: statsRaw ? {
				avgFps: (statsRaw.avgFps as number) ?? 0,
				cpuUsagePercent: (statsRaw.cpuUsagePercent as number) ?? 0,
				gpuUsagePercent: statsRaw.gpuUsagePercent as number | undefined,
				hwDecodeMs: (statsRaw.hwDecodeMs as number) ?? 0,
				compositeMs: (statsRaw.compositeMs as number) ?? 0,
				encodeSubmitMs: (statsRaw.encodeSubmitMs as number) ?? 0,
				peakMemoryBytes: (statsRaw.peakMemoryBytes as number) ?? 0,
				vramUsageBytes: statsRaw.vramUsageBytes as number | undefined,
			} : undefined,
		};
	}

	/**
	 * Dispatch an ActionRequest to NativeEngine via FrameServerService
	 */
	private async dispatch(req: ActionRequest): Promise<ActionResponse> {
		const json = JSON.stringify({
			group: req.group,
			action: req.action,
			id: req.id ?? '',
			options: req.options ?? {},
			body: req.body ?? null,
		});

		const responseJson = await this.frameServer.dispatch(json);
		const response = JSON.parse(responseJson) as ActionResponse;

		if (response.status === 'error') {
			const errMsg = response.error?.message ?? `${req.group}:${req.action} failed`;
			throw new Error(errMsg);
		}

		return response;
	}

	// =========================================================================
	// Disposal
	// =========================================================================

	dispose(): void {
		if (this._disposed) return;
		this._disposed = true;

		this.stopPolling();

		// Fire-and-forget cancel if export is running
		if (this._currentJobId) {
			this.cancelExport().catch(() => {});
		}

		this._onDidProgress.dispose();
		this._onDidComplete.dispose();
		this._onDidError.dispose();
		this._onDidCancel.dispose();
	}
}
