/**
 * ExportService - Unified video export service with FIFO queue support
 *
 * Responsibilities:
 * - Dispatches export requests to NativeEngine via EngineClient
 * - Polls export progress for all active jobs and emits events
 * - Manages export lifecycle (enqueue, poll, cancel)
 * - Independent of Webview — supports VSCode commands and tool handlers
 *
 * Action protocol:
 * - timelines:export          — start export (immediate, backward compat)
 * - timelines:export_enqueue  — enqueue export (FIFO, new)
 * - timelines:export_progress — poll progress
 * - timelines:export_cancel   — cancel export
 * - timelines:export_queue    — list queue entries
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { EngineClient, type ActionRequest, type ActionResponse } from '@neko/neko-client';
import type { ProjectData } from '@neko/shared';
import { getLogger } from '../base';

const logger = getLogger('ExportService');

// =============================================================================
// Types
// =============================================================================

/** Export configuration from UI */
export interface ExportConfig {
  outputPath: string;
  format: 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';
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

/** Per-job info tracked by the service */
interface ExportJobInfo {
  config: ExportConfig;
  startedAt: number;
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

/** Queue status sent to Webview */
export interface ExportQueueStatus {
  /** Jobs currently running */
  active: number;
  /** Jobs waiting in queue */
  pending: number;
}

// =============================================================================
// Constants
// =============================================================================

const PROGRESS_POLL_INTERVAL_MS = 200;

/** Terminal states that stop polling a specific job */
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'error']);

/** Default video codec per container format (serde: rename_all = "lowercase") */
const FORMAT_TO_VIDEO_CODEC: Record<string, string> = {
  mp4: 'h264',
  mov: 'h264',
  webm: 'vp9',
  mkv: 'h264',
  avi: 'h264',
  ts: 'h264',
};

/** Default audio codec per container format (serde: rename_all = "lowercase") */
const FORMAT_TO_AUDIO_CODEC: Record<string, string> = {
  mp4: 'aac',
  mov: 'aac',
  webm: 'opus',
  mkv: 'aac',
  avi: 'mp3',
  ts: 'aac',
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
  /** Active jobs being polled (jobId → info) */
  private _activeJobs = new Map<string, ExportJobInfo>();
  private _pollingTimer: ReturnType<typeof setInterval> | null = null;
  private _disposed = false;

  // Event emitters
  private readonly _onDidProgress = new vscode.EventEmitter<ExportProgress>();
  private readonly _onDidComplete = new vscode.EventEmitter<ExportResult>();
  private readonly _onDidError = new vscode.EventEmitter<string>();
  private readonly _onDidCancel = new vscode.EventEmitter<void>();
  private readonly _onDidQueueChange = new vscode.EventEmitter<ExportQueueStatus>();

  /** Fired when export progress is updated */
  readonly onDidProgress = this._onDidProgress.event;
  /** Fired when export completes successfully */
  readonly onDidComplete = this._onDidComplete.event;
  /** Fired when export fails */
  readonly onDidError = this._onDidError.event;
  /** Fired when export is cancelled */
  readonly onDidCancel = this._onDidCancel.event;
  /** Fired when the queue state changes (job added, started, or finished) */
  readonly onDidQueueChange = this._onDidQueueChange.event;

  constructor(
    private readonly client: EngineClient,
    private readonly documentDir: string,
  ) {}

  // =========================================================================
  // Public API
  // =========================================================================

  /**
   * Enqueue an export job.
   * If no job is currently running on the Rust side, it starts immediately.
   * Otherwise it is placed in the FIFO queue and starts when ready.
   *
   * @returns The job ID for tracking
   */
  async enqueueExport(project: ProjectData, config: ExportConfig): Promise<string> {
    const jobId = `export-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const duration = this.computeProjectDuration(project);
    const exportJobConfig = this.buildExportJobConfig(jobId, project, config, duration);

    // Dispatch timelines:export_enqueue
    const response = await this.dispatch({
      group: 'timelines',
      action: 'export_enqueue',
      body: exportJobConfig,
    });

    const responseData = response.data as Record<string, unknown> | undefined;
    const actualJobId = (responseData?.jobId as string) ?? jobId;

    this._activeJobs.set(actualJobId, { config, startedAt: Date.now() });

    logger.info(`Export enqueued: jobId=${actualJobId}`);

    this._onDidQueueChange.fire(this.buildQueueStatus());

    // Ensure polling is running
    if (!this._pollingTimer) {
      this.startPolling();
    }

    return actualJobId;
  }

  /**
   * Start an export job immediately (backward-compatible entry point).
   * Internally delegates to `enqueueExport`.
   *
   * @returns The job ID for tracking
   */
  async startExport(project: ProjectData, config: ExportConfig): Promise<string> {
    return this.enqueueExport(project, config);
  }

  /**
   * Cancel the most-recently enqueued export job (or the first running one).
   */
  async cancelExport(): Promise<void> {
    const jobId = [...this._activeJobs.keys()].at(-1);
    if (!jobId) return;

    try {
      await this.dispatch({
        group: 'timelines',
        action: 'export_cancel',
        id: jobId,
      });
      logger.info(`Export cancelled: jobId=${jobId}`);
    } catch (error) {
      logger.warn('Failed to cancel export:', error);
    }

    this._activeJobs.delete(jobId);
    this._onDidCancel.fire();
    this._onDidQueueChange.fire(this.buildQueueStatus());

    if (this._activeJobs.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Cancel a specific export job by ID.
   */
  async cancelJob(jobId: string): Promise<void> {
    if (!this._activeJobs.has(jobId)) return;

    try {
      await this.dispatch({
        group: 'timelines',
        action: 'export_cancel',
        id: jobId,
      });
      logger.info(`Export job cancelled: jobId=${jobId}`);
    } catch (error) {
      logger.warn('Failed to cancel export job:', error);
    }

    this._activeJobs.delete(jobId);
    this._onDidCancel.fire();
    this._onDidQueueChange.fire(this.buildQueueStatus());

    if (this._activeJobs.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Get current export progress for a specific job (one-shot query)
   */
  async getProgress(jobId?: string): Promise<ExportProgress | null> {
    const id = jobId ?? [...this._activeJobs.keys()].at(-1);
    if (!id) return null;

    try {
      const response = await this.dispatch({
        group: 'timelines',
        action: 'export_progress',
        id,
      });
      return this.parseProgress(response.data as Record<string, unknown> | undefined);
    } catch {
      return null;
    }
  }

  /**
   * Whether any export job is currently active
   */
  isExporting(): boolean {
    return this._activeJobs.size > 0;
  }

  /**
   * Get the most recently added job ID (if any)
   */
  getCurrentJobId(): string | null {
    return [...this._activeJobs.keys()].at(-1) ?? null;
  }

  /**
   * Get the current queue status summary
   */
  getQueueStatus(): ExportQueueStatus {
    return this.buildQueueStatus();
  }

  /**
   * Query hardware encoder availability for each video codec.
   * Returns a map of codec name → hw encoder name (or null if software-only).
   * Example: { h264: "h264_videotoolbox", vp9: null }
   * Returns empty object on error (engine not running).
   */
  async queryHwCapabilities(): Promise<Record<string, string | null>> {
    try {
      const response = await this.dispatch({
        group: 'nodes',
        action: 'hw_capabilities',
      });
      return (response.data as Record<string, string | null>) ?? {};
    } catch {
      return {};
    }
  }

  // =========================================================================
  // Progress Polling
  // =========================================================================

  private startPolling(): void {
    this.stopPolling();

    this._pollingTimer = setInterval(async () => {
      if (this._disposed) {
        this.stopPolling();
        return;
      }
      if (this._activeJobs.size === 0) {
        this.stopPolling();
        return;
      }

      // Poll all active jobs in parallel
      const jobIds = [...this._activeJobs.keys()];
      await Promise.allSettled(jobIds.map((jobId) => this.pollJob(jobId)));
    }, PROGRESS_POLL_INTERVAL_MS);
  }

  private async pollJob(jobId: string): Promise<void> {
    try {
      const response = await this.dispatch({
        group: 'timelines',
        action: 'export_progress',
        id: jobId,
      });

      const progress = this.parseProgress(response.data as Record<string, unknown> | undefined);
      if (!progress) return;

      this._onDidProgress.fire(progress);

      // Handle terminal state
      if (TERMINAL_STATES.has(progress.state)) {
        this._activeJobs.delete(jobId);
        this._onDidQueueChange.fire(this.buildQueueStatus());

        if (progress.state === 'completed') {
          this._onDidComplete.fire({
            success: true,
            outputPath: undefined,
            totalFrames: progress.totalFrames,
            elapsedMs: progress.elapsedMs,
          });
        } else if (progress.state === 'cancelled') {
          this._onDidCancel.fire();
        } else if (progress.state === 'error') {
          this._onDidError.fire(progress.error ?? 'Export failed');
        }

        logger.info(`Export ${progress.state}: jobId=${jobId}`);

        if (this._activeJobs.size === 0) {
          this.stopPolling();
        }
      }
    } catch (error) {
      logger.warn(`Progress poll error for jobId=${jobId}:`, error);
    }
  }

  private stopPolling(): void {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer);
      this._pollingTimer = null;
    }
  }

  private buildQueueStatus(): ExportQueueStatus {
    return { active: this._activeJobs.size, pending: 0 };
  }

  // =========================================================================
  // Config Building
  // =========================================================================

  /**
   * Build ExportJobConfig for Rust timelines:export_enqueue action
   */
  private buildExportJobConfig(
    jobId: string,
    project: ProjectData,
    config: ExportConfig,
    duration: number,
  ): Record<string, unknown> {
    const qualityPreset = QUALITY_PRESETS[config.quality] ?? {
      preset: 'medium',
      baseBitrate: 6_000_000,
    };

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
    const tracks = project.tracks.map((track) => ({
      id: track.id,
      name: track.name ?? '',
      type: track.type,
      elements: track.elements.map((el) =>
        this.convertElement(el as unknown as Record<string, unknown>),
      ),
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
    easein: 'EaseIn',
    easeinquad: 'EaseInQuad',
    easeout: 'EaseOut',
    easeoutquad: 'EaseOutQuad',
    easeinout: 'EaseInOut',
    easeinoutquad: 'EaseInOutQuad',
    easeincubic: 'EaseInCubic',
    easeoutcubic: 'EaseOutCubic',
    easeinoutcubic: 'EaseInOutCubic',
    easeinquart: 'EaseInQuart',
    easeoutquart: 'EaseOutQuart',
    easeinoutquart: 'EaseInOutQuart',
    easeinquint: 'EaseInQuint',
    easeoutquint: 'EaseOutQuint',
    easeinoutquint: 'EaseInOutQuint',
    easeinsine: 'EaseInSine',
    easeoutsine: 'EaseOutSine',
    easeinoutsine: 'EaseInOutSine',
    easeinexpo: 'EaseInExpo',
    easeoutexpo: 'EaseOutExpo',
    easeinoutexpo: 'EaseInOutExpo',
    easeincirc: 'EaseInCirc',
    easeoutcirc: 'EaseOutCirc',
    easeinoutcirc: 'EaseInOutCirc',
    easeinback: 'EaseInBack',
    easeoutback: 'EaseOutBack',
    easeinoutback: 'EaseInOutBack',
    easeinelastic: 'EaseInElastic',
    easeoutelastic: 'EaseOutElastic',
    easeinoutelastic: 'EaseInOutElastic',
    easeinbounce: 'EaseInBounce',
    easeoutbounce: 'EaseOutBounce',
    easeinoutbounce: 'EaseInOutBounce',
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
   * Resolve a media path to absolute (relative to .nkv document dir)
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
      stats: statsRaw
        ? {
            avgFps: (statsRaw.avgFps as number) ?? 0,
            cpuUsagePercent: (statsRaw.cpuUsagePercent as number) ?? 0,
            gpuUsagePercent: statsRaw.gpuUsagePercent as number | undefined,
            hwDecodeMs: (statsRaw.hwDecodeMs as number) ?? 0,
            compositeMs: (statsRaw.compositeMs as number) ?? 0,
            encodeSubmitMs: (statsRaw.encodeSubmitMs as number) ?? 0,
            peakMemoryBytes: (statsRaw.peakMemoryBytes as number) ?? 0,
            vramUsageBytes: statsRaw.vramUsageBytes as number | undefined,
          }
        : undefined,
    };
  }

  /**
   * Dispatch an ActionRequest to NativeEngine via EngineClient
   */
  private async dispatch(req: ActionRequest): Promise<ActionResponse> {
    const response = await this.client.dispatch(req);

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

    // Fire-and-forget cancel for all active jobs
    for (const jobId of this._activeJobs.keys()) {
      this.dispatch({
        group: 'timelines',
        action: 'export_cancel',
        id: jobId,
      }).catch(() => {});
    }
    this._activeJobs.clear();

    this._onDidProgress.dispose();
    this._onDidComplete.dispose();
    this._onDidError.dispose();
    this._onDidCancel.dispose();
    this._onDidQueueChange.dispose();
  }
}
