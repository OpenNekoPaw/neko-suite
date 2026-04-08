/**
 * AIActionHandler - Routes webview AI action requests to backend services.
 *
 * Responsibilities:
 * - Receive 'executeAIAction' messages from webview
 * - Route to EngineClient (local ONNX) or neko-agent (cloud AI) depending on action type
 * - Send progress/result messages back to webview
 *
 * Design:
 * - Lazy dependency resolution (EngineClient, neko-agent commands)
 * - Graceful degradation when backend unavailable
 * - P0/P1/P2 priority: implemented → connected → stubbed
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import type { EngineClient } from '@neko/neko-client';
import type { TimelineElement } from '@neko/shared';
import { getLogger, getService } from '../base';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import type { VideoEditorModel } from '../editor/video/videoEditorModel';

const logger = getLogger('AIActionHandler');

// =============================================================================
// Types
// =============================================================================

type AIActionId =
  | 'ai-enhance'
  | 'ai-background-remove'
  | 'ai-style-transfer'
  | 'ai-upscale'
  | 'ai-denoise'
  | 'ai-speech-to-text'
  | 'ai-generate-subtitles'
  | 'ai-auto-edit'
  | 'ai-match-music'
  | 'ai-remove-silence'
  | 'ai-color-grade'
  | 'ai-smart-crop';

interface AIActionContext {
  actionId: AIActionId;
  elementIds: string[];
  trackIds?: string[];
  params?: Record<string, unknown>;
}

// =============================================================================
// AIActionHandler
// =============================================================================

export class AIActionHandler implements vscode.Disposable {
  private _engineClient: EngineClient | null = null;
  private _engineInitPromise: Promise<EngineClient | null> | null = null;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly _documentUri: vscode.Uri,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Handle an AI action request from the webview.
   */
  async handleAction(
    actionId: string,
    elementIds: string[],
    trackIds?: string[],
    params?: Record<string, unknown>,
  ): Promise<void> {
    const ctx: AIActionContext = {
      actionId: actionId as AIActionId,
      elementIds,
      trackIds,
      params,
    };

    logger.info(`AI action requested: ${actionId}`, { elementIds, trackIds });
    this.sendStarted(ctx);

    try {
      switch (ctx.actionId) {
        // P0: Local ONNX via EngineClient
        case 'ai-upscale':
          await this.handleUpscale(ctx);
          break;
        case 'ai-denoise':
          await this.handleDenoise(ctx);
          break;
        case 'ai-enhance':
          await this.handleEnhance(ctx);
          break;
        case 'ai-speech-to-text':
          await this.handleSpeechToText(ctx);
          break;
        case 'ai-generate-subtitles':
          await this.handleGenerateSubtitles(ctx);
          break;

        // P1: Cloud AI via neko-agent
        case 'ai-style-transfer':
          await this.handleStyleTransfer(ctx);
          break;
        case 'ai-color-grade':
          await this.handleColorGrade(ctx);
          break;

        // P0: Local engine audio analysis
        case 'ai-remove-silence':
          await this.handleRemoveSilence(ctx);
          break;

        // P1: Cloud AI via neko-agent
        case 'ai-background-remove':
          await this.handleBackgroundRemove(ctx);
          break;
        case 'ai-smart-crop':
          await this.handleSmartCrop(ctx);
          break;

        // P2: Stub (future implementation)
        case 'ai-auto-edit':
        case 'ai-match-music':
          this.sendResult(ctx, false, undefined, `${actionId} is not yet available. Coming soon.`);
          break;

        default:
          this.sendResult(ctx, false, undefined, `Unknown AI action: ${actionId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`AI action ${actionId} failed`, err);
      this.sendResult(ctx, false, undefined, message);
    }
  }

  dispose(): void {
    this._engineClient = null;
    this._engineInitPromise = null;
  }

  // ===========================================================================
  // P0: Local ONNX handlers
  // ===========================================================================

  private async handleUpscale(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    const scale = (ctx.params?.['scale'] as number) ?? 4;
    const model = (ctx.params?.['model'] as string) ?? 'realesrgan-x4';

    this.sendProgress(ctx, 10, 'Preparing upscale...');

    const inputPath = this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    const outputPath = this.buildOutputPath(inputPath, '_upscaled');
    this.sendProgress(ctx, 30, 'Running upscale model...');

    await engine.upscale(model, inputPath, outputPath, scale);

    this.sendProgress(ctx, 90, 'Upscale complete');
    this.sendResult(ctx, true, { outputPath });
  }

  private async handleDenoise(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    const strength = (ctx.params?.['strength'] as number) ?? 0.5;
    const model = (ctx.params?.['model'] as string) ?? 'denoise-default';

    this.sendProgress(ctx, 10, 'Preparing denoise...');

    const inputPath = this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    const outputPath = this.buildOutputPath(inputPath, '_denoised');
    this.sendProgress(ctx, 30, 'Running denoise model...');

    await engine.denoiseImage(model, inputPath, outputPath, strength);

    this.sendProgress(ctx, 90, 'Denoise complete');
    this.sendResult(ctx, true, { outputPath });
  }

  private async handleEnhance(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    this.sendProgress(ctx, 10, 'Preparing enhance (upscale + denoise)...');

    const inputPath = this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    // Step 1: Denoise
    const denoisedPath = this.buildOutputPath(inputPath, '_denoised_tmp');
    this.sendProgress(ctx, 20, 'Running denoise...');
    await engine.denoiseImage('denoise-default', inputPath, denoisedPath, 0.4);

    // Step 2: Upscale
    const outputPath = this.buildOutputPath(inputPath, '_enhanced');
    this.sendProgress(ctx, 50, 'Running upscale...');
    await engine.upscale('realesrgan-x4', denoisedPath, outputPath, 2);

    this.sendProgress(ctx, 90, 'Enhancement complete');
    this.sendResult(ctx, true, { outputPath });
  }

  private async handleSpeechToText(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    const model = (ctx.params?.['model'] as string) ?? 'whisper-base';

    this.sendProgress(ctx, 10, 'Preparing transcription...');

    const inputPath = this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    this.sendProgress(ctx, 30, 'Transcribing audio...');
    const result = await engine.transcribe(model, inputPath);

    this.sendProgress(ctx, 90, 'Transcription complete');
    this.sendResult(ctx, true, result);
  }

  private async handleGenerateSubtitles(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    const model = (ctx.params?.['model'] as string) ?? 'whisper-base';

    this.sendProgress(ctx, 10, 'Preparing subtitle generation...');

    const inputPath = this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    this.sendProgress(ctx, 30, 'Transcribing for subtitles...');
    const result = await engine.transcribe(model, inputPath);

    // Convert segments to SRT format
    const srt = this.segmentsToSrt(result.segments);

    this.sendProgress(ctx, 90, 'Subtitles generated');
    this.sendResult(ctx, true, { srt, segments: result.segments, language: result.language });
  }

  // ===========================================================================
  // P0: Local engine audio analysis
  // ===========================================================================

  private async handleRemoveSilence(ctx: AIActionContext): Promise<void> {
    const engine = await this.ensureEngine();
    if (!engine) return this.sendEngineUnavailable(ctx);

    const thresholdDbfs = (ctx.params?.['thresholdDbfs'] as number) ?? -40;
    const minDuration = (ctx.params?.['minDuration'] as number) ?? 0.5;

    this.sendProgress(ctx, 10, 'Preparing silence detection...');

    const inputPath = this.resolveElementSourcePath(ctx.elementIds[0], ctx.params);
    if (!inputPath) {
      return this.sendResult(ctx, false, undefined, 'Could not resolve element source file');
    }

    this.sendProgress(ctx, 30, 'Analyzing audio for silence regions...');
    const result = await engine.detectSilence(inputPath, thresholdDbfs, minDuration);

    this.sendProgress(ctx, 90, 'Silence detection complete');
    this.sendResult(ctx, true, result);
  }

  // ===========================================================================
  // P1: Cloud AI handlers (via neko-agent commands)
  // ===========================================================================

  private async handleStyleTransfer(ctx: AIActionContext): Promise<void> {
    const prompt = (ctx.params?.['prompt'] as string) ?? '';
    const style = (ctx.params?.['style'] as string) ?? 'Anime';

    if (!prompt && !style) {
      return this.sendResult(
        ctx,
        false,
        undefined,
        'Style transfer requires a prompt or style parameter',
      );
    }

    this.sendProgress(ctx, 10, 'Requesting style transfer...');

    try {
      const result = await vscode.commands.executeCommand<{ dataUrl: string } | undefined>(
        'neko.agent.generateForNode',
        {
          nodeId: ctx.elementIds[0] ?? 'cut-style-transfer',
          prompt: prompt || `Apply ${style} style`,
          style,
          ratio: '16:9',
          count: 1,
        },
      );

      if (!result?.dataUrl) {
        return this.sendResult(
          ctx,
          false,
          undefined,
          'Style transfer returned no result. Is neko-agent installed?',
        );
      }

      this.sendProgress(ctx, 90, 'Style transfer complete');
      this.sendResult(ctx, true, { dataUrl: result.dataUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendResult(ctx, false, undefined, `Style transfer failed: ${message}`);
    }
  }

  private async handleColorGrade(ctx: AIActionContext): Promise<void> {
    const prompt = (ctx.params?.['prompt'] as string) ?? 'cinematic color grading';

    this.sendProgress(ctx, 10, 'Requesting color grading...');

    try {
      const result = await vscode.commands.executeCommand<{ dataUrl: string } | undefined>(
        'neko.agent.generateForNode',
        {
          nodeId: ctx.elementIds[0] ?? 'cut-color-grade',
          prompt: `Color grade: ${prompt}`,
          count: 1,
        },
      );

      if (!result?.dataUrl) {
        return this.sendResult(
          ctx,
          false,
          undefined,
          'Color grading returned no result. Is neko-agent installed?',
        );
      }

      this.sendProgress(ctx, 90, 'Color grading complete');
      this.sendResult(ctx, true, { dataUrl: result.dataUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendResult(ctx, false, undefined, `Color grading failed: ${message}`);
    }
  }

  private async handleBackgroundRemove(ctx: AIActionContext): Promise<void> {
    this.sendProgress(ctx, 10, 'Requesting background removal...');

    try {
      const result = await vscode.commands.executeCommand<{ dataUrl: string } | undefined>(
        'neko.agent.generateForNode',
        {
          nodeId: ctx.elementIds[0] ?? 'cut-bg-remove',
          prompt:
            'Remove the background from this image, keeping only the main subject with a transparent background',
          count: 1,
        },
      );

      if (!result?.dataUrl) {
        return this.sendResult(
          ctx,
          false,
          undefined,
          'Background removal returned no result. Is neko-agent installed?',
        );
      }

      this.sendProgress(ctx, 90, 'Background removal complete');
      this.sendResult(ctx, true, { dataUrl: result.dataUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendResult(ctx, false, undefined, `Background removal failed: ${message}`);
    }
  }

  private async handleSmartCrop(ctx: AIActionContext): Promise<void> {
    const aspectRatio = (ctx.params?.['aspectRatio'] as string) ?? '16:9';
    const focus = (ctx.params?.['focus'] as string) ?? '';

    this.sendProgress(ctx, 10, 'Analyzing composition for smart crop...');

    try {
      const promptParts = [
        `Analyze the image and determine the best crop region for a ${aspectRatio} aspect ratio.`,
        'Focus on the main subject and apply rule-of-thirds composition.',
      ];
      if (focus) {
        promptParts.push(`Priority focus area: ${focus}.`);
      }
      promptParts.push(
        'Return the crop region as JSON: { "x": number, "y": number, "width": number, "height": number } where values are normalized 0-1.',
      );

      const result = await vscode.commands.executeCommand<{ dataUrl: string } | undefined>(
        'neko.agent.generateForNode',
        {
          nodeId: ctx.elementIds[0] ?? 'cut-smart-crop',
          prompt: promptParts.join(' '),
          aspectRatio,
          count: 1,
        },
      );

      if (!result?.dataUrl) {
        return this.sendResult(
          ctx,
          false,
          undefined,
          'Smart crop returned no result. Is neko-agent installed?',
        );
      }

      this.sendProgress(ctx, 90, 'Smart crop complete');
      this.sendResult(ctx, true, { dataUrl: result.dataUrl, aspectRatio });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendResult(ctx, false, undefined, `Smart crop failed: ${message}`);
    }
  }

  // ===========================================================================
  // Message helpers
  // ===========================================================================

  private sendStarted(ctx: AIActionContext): void {
    this.webview.postMessage({
      type: 'aiActionStatus',
      actionId: ctx.actionId,
      status: 'running',
      progress: 0,
      message: 'Started',
    });
  }

  private sendProgress(ctx: AIActionContext, progress: number, message: string): void {
    this.webview.postMessage({
      type: 'aiActionStatus',
      actionId: ctx.actionId,
      status: 'running',
      progress,
      message,
    });
  }

  private sendResult(
    ctx: AIActionContext,
    success: boolean,
    _data?: unknown,
    error?: string,
  ): void {
    this.webview.postMessage({
      type: 'aiActionStatus',
      actionId: ctx.actionId,
      status: success ? 'completed' : 'failed',
      progress: success ? 100 : undefined,
      message: success ? 'Completed' : undefined,
      error,
    });
  }

  private sendEngineUnavailable(ctx: AIActionContext): void {
    this.sendResult(
      ctx,
      false,
      undefined,
      'neko-engine is not available. Please ensure the engine extension is installed and running.',
    );
  }

  // ===========================================================================
  // Dependency resolution
  // ===========================================================================

  private async ensureEngine(): Promise<EngineClient | null> {
    if (this._engineClient) return this._engineClient;
    if (this._engineInitPromise) return this._engineInitPromise;

    this._engineInitPromise = (async () => {
      try {
        const result = await vscode.commands.executeCommand<{ port: number }>(
          'neko.engine.ensureFrameServer',
        );
        if (!result?.port) {
          logger.warn('Engine frame server not available');
          return null;
        }
        const { EngineClient } = await import('@neko/neko-client');
        this._engineClient = new EngineClient(result.port);
        return this._engineClient;
      } catch (err) {
        logger.error('Failed to initialize EngineClient', err);
        return null;
      }
    })();

    const client = await this._engineInitPromise;
    this._engineInitPromise = null;
    return client;
  }

  // ===========================================================================
  // File path helpers
  // ===========================================================================

  /**
   * Resolve the source file path for a timeline element.
   *
   * Priority:
   *   1. Explicit sourcePath from action params (webview passes it)
   *   2. Lookup element by ID from the active VideoEditorModel
   *   3. Project directory fallback (from _documentUri)
   */
  private resolveElementSourcePath(
    elementId: string | undefined,
    params?: Record<string, unknown>,
  ): string | null {
    // 1. Explicit sourcePath from caller
    const explicit = params?.['sourcePath'];
    if (typeof explicit === 'string' && explicit.length > 0) {
      return explicit;
    }

    // 2. Lookup element src from project data
    if (elementId) {
      const src = this.findElementSrc(elementId);
      if (src) {
        // Resolve relative paths against the project file directory
        if (!path.isAbsolute(src) && this._documentUri) {
          return path.resolve(path.dirname(this._documentUri.fsPath), src);
        }
        return src;
      }
    }

    // 3. Fallback: project file directory
    if (this._documentUri) {
      return path.dirname(this._documentUri.fsPath);
    }
    return null;
  }

  /**
   * Find element src from active VideoEditorModel's project data.
   */
  private findElementSrc(elementId: string): string | null {
    const editorRegistry = getService(IEditorRegistry);
    if (!editorRegistry) return null;

    const editor = editorRegistry.getEditorByUri(this._documentUri);
    if (!editor || editor.type !== 'video') return null;

    const model = editor as unknown as VideoEditorModel;
    const project = model.getProjectData();
    if (!project?.tracks) return null;

    for (const track of project.tracks) {
      for (const element of track.elements) {
        if (element.id === elementId && 'src' in element) {
          return (element as TimelineElement & { src: string }).src;
        }
      }
    }
    return null;
  }

  /**
   * Build an output file path with a suffix, placed in a temp directory.
   */
  private buildOutputPath(inputPath: string, suffix: string): string {
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const tmpDir = path.join(os.tmpdir(), 'neko-cut-ai');
    return path.join(tmpDir, `${base}${suffix}${ext}`);
  }

  /**
   * Convert whisper segments to SRT subtitle format.
   */
  private segmentsToSrt(segments: Array<{ start: number; end: number; text: string }>): string {
    return segments
      .map((seg, i) => {
        const startTs = this.formatSrtTimestamp(seg.start);
        const endTs = this.formatSrtTimestamp(seg.end);
        return `${i + 1}\n${startTs} --> ${endTs}\n${seg.text.trim()}\n`;
      })
      .join('\n');
  }

  private formatSrtTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds * 1000) % 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}
