/**
 * VideoDiffAnalyzer - Video Diff Analyzer
 *
 * Delegates video comparison to neko-engine's native videos:diff action.
 * Engine performs: FFmpeg SSIM/PSNR filter → per-frame metrics + diff regions.
 * This analyzer converts EngineDiffResult → Protocol VideoDiffDetails.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type {
  DiffOptions,
  DiffResult,
  VideoDiffDetails,
  KeyframeDiff,
  EngineVideoDiffRegion,
  EngineMediaInfo,
  EngineFieldDiff,
} from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { EngineMediaService } from '../../../services/EngineMediaService';
import { getLogger } from '../../../utils/logger';

const logger = getLogger('VideoDiffAnalyzer');

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

/**
 * Parse infoA/infoB which may be a JSON string or already-parsed object.
 * Rust serializes info_a as serde_json::Value (object), so depending on
 * the transport layer it may arrive as an object or a JSON string.
 */
function parseMediaInfo(raw: unknown): Partial<EngineMediaInfo> {
  if (!raw) return {};
  if (typeof raw === 'object' && raw !== null) return raw as Partial<EngineMediaInfo>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Partial<EngineMediaInfo>;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Extract a numeric value from engine fields array.
 * Fields contain probe metadata that's always available even when SSIM fails.
 */
function fieldValue(fields: EngineFieldDiff[], name: string, side: 'A' | 'B'): number | undefined {
  const f = fields.find((fd) => fd.field === name);
  if (!f) return undefined;
  const raw = side === 'A' ? f.valueA : f.valueB;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function fieldString(fields: EngineFieldDiff[], name: string, side: 'A' | 'B'): string | undefined {
  const f = fields.find((fd) => fd.field === name);
  if (!f) return undefined;
  const raw = side === 'A' ? f.valueA : f.valueB;
  return typeof raw === 'string' ? raw : String(raw);
}

export class VideoDiffAnalyzer extends BaseMediaDiffAnalyzer {
  readonly mediaType = 'video' as const;
  private readonly engineMediaService: EngineMediaService;
  private activeTempFiles = new Set<string>();

  constructor(engineMediaService?: EngineMediaService) {
    super(VIDEO_EXTENSIONS);
    this.engineMediaService = engineMediaService ?? new EngineMediaService();
  }

  async analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult> {
    this.createAbortController();
    const localTempFiles: string[] = [];

    try {
      let currentPath: string;
      let previousPath: string;
      if (options?.currentPath && options?.previousPath) {
        currentPath = options.currentPath;
        previousPath = options.previousPath;
      } else {
        const ext = options?.fileExtension ?? '.mp4';
        [currentPath, previousPath] = await this.writeTempFiles(
          current,
          previous,
          ext,
          localTempFiles,
        );
      }
      this.throwIfAborted();

      // Step 1: Quick probe to get durations for smart range selection
      const probeA = await this.engineMediaService.probe('videos', currentPath);
      const probeB = await this.engineMediaService.probe('videos', previousPath);
      const probeDurA = probeA?.duration ?? 0;
      const probeDurB = probeB?.duration ?? 0;

      // Step 2: Smart range selection
      // - If durations differ significantly, only compare the overlapping range
      // - This avoids processing the entire long video when comparing 120s vs 5s
      const minDur = Math.min(probeDurA, probeDurB);
      const maxDur = Math.max(probeDurA, probeDurB);
      const durRatio = maxDur > 0 ? minDur / maxDur : 1;

      let diffOptions: { sampleFps: number; startTime?: number; endTime?: number } = {
        sampleFps: 1.0,
      };

      // User-specified time range takes priority over auto-detection
      if (options?.startTime !== undefined || options?.endTime !== undefined) {
        if (options.startTime !== undefined) diffOptions.startTime = options.startTime;
        if (options.endTime !== undefined) diffOptions.endTime = options.endTime;
        logger.debug(
          `User-specified time range: ${diffOptions.startTime ?? 0}s - ${diffOptions.endTime ?? 'end'}s`,
        );
      } else if (durRatio < 0.8 && minDur > 0) {
        // Auto-detect: if duration difference > 20%, limit comparison to shorter video's length
        diffOptions.endTime = minDur;
        logger.debug(
          `Duration mismatch detected (${probeDurA.toFixed(1)}s vs ${probeDurB.toFixed(1)}s), limiting comparison to ${minDur.toFixed(1)}s`,
        );
      }

      // Use 1fps sampling for initial diff to reduce computation time
      // For 60min video: 108K frames → 3.6K frames → ~1-2s instead of 30s
      const engineResult = await this.engineMediaService.diff(
        'videos',
        currentPath,
        previousPath,
        diffOptions,
      );

      this.throwIfAborted();

      if (!engineResult) {
        throw new Error('Engine video diff unavailable');
      }

      const videoDiff = engineResult.videoDiff;
      const fields = engineResult.fields ?? [];
      const infoA = parseMediaInfo(engineResult.infoA);
      const infoB = parseMediaInfo(engineResult.infoB);

      if (!videoDiff) {
        logger.warn('videoDiff unavailable (SSIM/PSNR failed), using probe metadata');
      }

      const keyframeDiffs: KeyframeDiff[] = (videoDiff?.frameMetrics ?? []).map((fm) => ({
        time: fm.timestamp,
        similarity: fm.ssim,
      }));

      // Metadata priority: videoDiff > infoA/infoB > fields > 0
      const durationA =
        videoDiff?.durationA ?? infoA.duration ?? fieldValue(fields, 'duration', 'A') ?? 0;
      const durationB =
        videoDiff?.durationB ?? infoB.duration ?? fieldValue(fields, 'duration', 'B') ?? 0;
      const widthA = videoDiff?.widthA ?? infoA.width ?? fieldValue(fields, 'width', 'A') ?? 0;
      const heightA = videoDiff?.heightA ?? infoA.height ?? fieldValue(fields, 'height', 'A') ?? 0;
      const widthB = videoDiff?.widthB ?? infoB.width ?? fieldValue(fields, 'width', 'B') ?? 0;
      const heightB = videoDiff?.heightB ?? infoB.height ?? fieldValue(fields, 'height', 'B') ?? 0;
      const fpsA = videoDiff?.fpsA ?? infoA.fps ?? fieldValue(fields, 'fps', 'A') ?? 0;
      const fpsB = videoDiff?.fpsB ?? infoB.fps ?? fieldValue(fields, 'fps', 'B') ?? 0;
      const codecA = fieldString(fields, 'codec', 'A') ?? infoA.codec ?? 'unknown';
      const codecB = fieldString(fields, 'codec', 'B') ?? infoB.codec ?? 'unknown';

      const details: VideoDiffDetails = {
        duration: { current: durationA, previous: durationB },
        resolution: {
          current: { width: widthA, height: heightA },
          previous: { width: widthB, height: heightB },
        },
        fps: { current: fpsA, previous: fpsB },
        codec: { current: codecA, previous: codecB },
        keyframeDiffs,
        audioTrackChanged: videoDiff?.audioDiff !== undefined,
        diffRegions: videoDiff?.diffRegions?.map((r: EngineVideoDiffRegion) => ({
          start: r.start,
          end: r.end,
          avgSsim: r.avgSsim,
        })),
      };

      const durationDiff = Math.abs(durationA - durationB);
      const maxDuration = Math.max(durationA, durationB);

      let similarity: number;
      if (videoDiff) {
        // SSIM available — use it with metadata penalties
        similarity = videoDiff.avgSsim;
        if (maxDuration > 0) {
          similarity *= 1 - (durationDiff / maxDuration) * 0.3;
        }
        if (widthA !== widthB || heightA !== heightB) {
          similarity *= 0.9;
        }
      } else {
        // SSIM unavailable — estimate from metadata
        similarity = 1.0;
        if (maxDuration > 0) {
          similarity *= 1 - Math.min(1, durationDiff / maxDuration);
        }
        if (widthA !== widthB || heightA !== heightB) {
          similarity *= 0.8;
        }
        if (codecA !== codecB) {
          similarity *= 0.9;
        }
      }

      return {
        mediaType: 'video',
        similarity: Math.max(0, Math.min(1, similarity)),
        details,
        // Include audio waveform peaks when engine returns embedded audio diff
        visualization: videoDiff?.audioDiff
          ? {
              currentWaveform: videoDiff.audioDiff.waveformPeaksA ?? [],
              previousWaveform: videoDiff.audioDiff.waveformPeaksB ?? [],
            }
          : undefined,
      };
    } finally {
      await this.cleanupFiles(localTempFiles);
    }
  }

  private async writeTempFiles(
    current: Buffer,
    previous: Buffer,
    ext: string,
    localTempFiles: string[],
  ): Promise<[string, string]> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2);

    const currentPath = path.join(tempDir, `video-diff-a-${timestamp}-${random}${ext}`);
    const previousPath = path.join(tempDir, `video-diff-b-${timestamp}-${random}${ext}`);

    await Promise.all([fs.writeFile(currentPath, current), fs.writeFile(previousPath, previous)]);

    localTempFiles.push(currentPath, previousPath);
    this.activeTempFiles.add(currentPath);
    this.activeTempFiles.add(previousPath);
    return [currentPath, previousPath];
  }

  private async cleanupFiles(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch {
        /* ignore */
      }
      this.activeTempFiles.delete(file);
    }
  }

  override cancel(): void {
    super.cancel();
    const files = [...this.activeTempFiles];
    this.activeTempFiles.clear();
    for (const file of files) {
      fs.unlink(file).catch(() => {});
    }
  }
}
