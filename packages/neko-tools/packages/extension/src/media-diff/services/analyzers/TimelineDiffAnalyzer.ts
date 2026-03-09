/**
 * TimelineDiffAnalyzer - JVI Project Structural Diff
 *
 * Delegates timeline comparison to neko-engine's native timelines:diff action.
 * Engine performs: JVI JSON parsing → track/element structural diff + optional content diff.
 * This analyzer converts EngineDiffResult → Protocol TimelineDiffDetails.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { DiffOptions, DiffResult, TimelineDiffDetails } from '@neko/shared';
import { BaseMediaDiffAnalyzer } from './IMediaDiffAnalyzer';
import { EngineMediaService } from '../../../services/EngineMediaService';

export class TimelineDiffAnalyzer extends BaseMediaDiffAnalyzer {
  readonly mediaType = 'timeline' as const;
  private readonly engineMediaService: EngineMediaService;
  private activeTempFiles = new Set<string>();

  constructor(engineMediaService?: EngineMediaService) {
    super(['.jvi']);
    this.engineMediaService = engineMediaService ?? new EngineMediaService();
  }

  async analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult> {
    this.createAbortController();
    const localTempFiles: string[] = [];

    try {
      const ext = options?.fileExtension ?? '.jvi';
      const [currentPath, previousPath] = await this.writeTempFiles(
        current,
        previous,
        ext,
        localTempFiles,
      );
      this.throwIfAborted();

      const engineResult = await this.engineMediaService.diff(
        'timelines',
        currentPath,
        previousPath,
      );

      this.throwIfAborted();

      if (!engineResult) {
        throw new Error('Engine timeline diff unavailable');
      }

      const tl = engineResult.timelineDiff;

      // Convert Engine types → Protocol types
      const details: TimelineDiffDetails = {
        project: {
          name: {
            current: tl?.currentProject?.name ?? 'Untitled',
            previous: tl?.previousProject?.name ?? 'Untitled',
          },
          resolution: {
            current: {
              width: tl?.currentProject?.resolutionWidth ?? 1920,
              height: tl?.currentProject?.resolutionHeight ?? 1080,
            },
            previous: {
              width: tl?.previousProject?.resolutionWidth ?? 1920,
              height: tl?.previousProject?.resolutionHeight ?? 1080,
            },
          },
          fps: {
            current: tl?.currentProject?.fps ?? 30,
            previous: tl?.previousProject?.fps ?? 30,
          },
        },
        trackChanges: (tl?.trackChanges ?? []).map((tc) => ({
          trackId: tc.trackId,
          trackName: tc.trackName,
          trackType: tc.trackType,
          changeType: tc.changeType,
          propertyChanges: tc.propertyChanges?.length
            ? tc.propertyChanges.map((pc) => ({
                property: pc.property,
                previous: pc.previous,
                current: pc.current,
              }))
            : undefined,
          elementChanges: tc.elementChanges?.length
            ? tc.elementChanges.map((ec) => ({
                elementId: ec.elementId,
                elementName: ec.elementName,
                elementType: ec.elementType,
                changeType: ec.changeType,
                propertyChanges: ec.propertyChanges?.length
                  ? ec.propertyChanges.map((pc) => ({
                      property: pc.property,
                      previous: pc.previous,
                      current: pc.current,
                    }))
                  : undefined,
                src: ec.src,
                previousSrc: ec.previousSrc,
                startTime: ec.startTime,
                duration: ec.duration,
              }))
            : undefined,
        })),
        summary: tl?.summary ?? {
          tracksAdded: 0,
          tracksRemoved: 0,
          tracksModified: 0,
          elementsAdded: 0,
          elementsRemoved: 0,
          elementsModified: 0,
          mediaSourceChanges: 0,
        },
        duration: {
          current: tl?.durationCurrent ?? 0,
          previous: tl?.durationPrevious ?? 0,
        },
      };

      const similarity = this.calcSimilarity(details);

      return {
        mediaType: 'timeline',
        similarity,
        details,
      };
    } finally {
      await this.cleanupFiles(localTempFiles);
    }
  }

  private calcSimilarity(details: TimelineDiffDetails): number {
    const { summary } = details;
    const totalChanges =
      summary.tracksAdded +
      summary.tracksRemoved +
      summary.tracksModified +
      summary.elementsAdded +
      summary.elementsRemoved +
      summary.elementsModified;

    if (totalChanges === 0) {
      const metaChanged =
        details.project.name.current !== details.project.name.previous ||
        details.project.fps.current !== details.project.fps.previous ||
        details.project.resolution.current.width !== details.project.resolution.previous.width ||
        details.project.resolution.current.height !== details.project.resolution.previous.height;
      return metaChanged ? 0.95 : 1.0;
    }

    const totalItems =
      details.trackChanges.reduce((sum, tc) => sum + (tc.elementChanges?.length ?? 0), 0) +
      details.trackChanges.length;

    if (totalItems === 0) return 1.0;

    const changeRatio = totalChanges / Math.max(totalItems * 2, 1);
    return Math.max(0, 1 - changeRatio);
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

    const currentPath = path.join(tempDir, `timeline-diff-a-${timestamp}-${random}${ext}`);
    const previousPath = path.join(tempDir, `timeline-diff-b-${timestamp}-${random}${ext}`);

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
