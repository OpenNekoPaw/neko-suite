/**
 * Quality Check Tools — Multimodal LLM-based quality evaluation for AI-generated media
 *
 * Uses the Agent's ReAct loop (Path A) instead of a Pipeline ReactiveStage.
 * The tool internally handles the evaluate → optimize prompt → regenerate → re-evaluate
 * loop, returning a structured summary to keep the main Agent context clean.
 *
 * Returns structured MediaEvaluation with typed QualityIssue[] and RemediationAction[],
 * enabling the Agent to auto-execute repairs via existing ToolSets.
 *
 * P0: Image evaluation via vision-capable LLM
 * TODO(P1): Video evaluation via frame extraction (neko-engine RenderFrame)
 */

import * as vscode from 'vscode';
import type { Tool } from './extensionTools';
import { getLogger } from '../base';
import type {
  MediaEvaluation,
  QualityIssue,
  QualityIssueCategory,
  IssueSeverity,
  RemediationAction,
  EvalMediaType,
  AudioTechnicalMetrics,
  VideoTechnicalMetrics,
} from '@neko/agent/validation';
import { QUALITY_ISSUE_CATEGORIES, createRemediationPlanner } from '@neko/agent/validation';

const logger = getLogger('QualityCheckTools');

// =============================================================================
// Types (inline to avoid cross-package import issues)
// =============================================================================

/** LLM service abstraction — uses `unknown` to avoid cross-package type coupling */
interface ILLMService {
  chat(
    messages: unknown[],
    options?: { maxTokens?: number },
  ): Promise<{ message: { content: string | unknown[] } }>;
}

/** Extract text from LLM response content (string or ContentPart[]) */
function extractTextFromContent(content: string | unknown[]): string {
  if (typeof content === 'string') return content;
  for (const part of content) {
    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      (part as { type: string }).type === 'text' &&
      'text' in part
    ) {
      return (part as { text: string }).text;
    }
  }
  return '';
}

/** Media generator (mirrors pipeline IMediaGenerator) */
interface IMediaGenerator {
  generate(
    prompt: string,
    options: MediaGenerateOptions,
  ): Promise<{ path: string; duration?: number }>;
}

interface MediaGenerateOptions {
  type?: 'image' | 'video';
  duration?: number;
  resolution?: string;
  style?: string;
  aspectRatio?: string;
}

// =============================================================================
// Quality Evaluation Types
// =============================================================================

/** Input scene for quality check */
interface SceneInput {
  index: number;
  mediaPath: string;
  prompt: string;
  description?: string;
}

/** Final result returned to Agent */
interface QualityCheckResult {
  totalScenes: number;
  passed: number;
  failed: number;
  evaluations: Array<{
    index: number;
    finalScore: number;
    passed: boolean;
    attempts: number;
    issues: QualityIssue[];
    finalPath: string;
    dimensions?: MediaEvaluation['dimensions'];
    remediations?: RemediationAction[];
    audioMetrics?: AudioTechnicalMetrics;
    videoMetrics?: VideoTechnicalMetrics;
  }>;
}

// =============================================================================
// Dependencies
// =============================================================================

export interface QualityCheckToolsDeps {
  /** Creates an LLM service instance for multimodal chat */
  createService: () => ILLMService;
  /** Media generator for retry regeneration */
  mediaGenerator: IMediaGenerator;
  /** Audio analyzer — optional, enables audio quality evaluation via Engine */
  audioAnalyzer?: IAudioAnalyzer;
  /** Frame extractor — optional, enables video quality evaluation via frame sampling */
  frameExtractor?: IFrameExtractor;
}

// =============================================================================
// Evaluation parsing helpers
// =============================================================================

const VALID_CATEGORIES = new Set<string>(QUALITY_ISSUE_CATEGORIES);
const VALID_SEVERITIES = new Set<string>(['critical', 'major', 'minor', 'info']);

/** Coerce a value to a score in [0, 100] */
function coerceScore(value: unknown): number {
  if (typeof value !== 'number' || !isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Validate a raw issue object has a valid category */
function isValidIssue(
  raw: unknown,
): raw is { category: string; severity?: string; description?: string } {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return typeof obj['category'] === 'string' && VALID_CATEGORIES.has(obj['category']);
}

/** Normalize a raw issue to QualityIssue with defaults */
function normalizeIssue(raw: {
  category: string;
  severity?: string;
  description?: string;
}): QualityIssue {
  return {
    category: raw.category as QualityIssueCategory,
    severity: (typeof raw.severity === 'string' && VALID_SEVERITIES.has(raw.severity)
      ? raw.severity
      : 'major') as IssueSeverity,
    description: typeof raw.description === 'string' ? raw.description : raw.category,
  };
}

// =============================================================================
// Vision Evaluator — Internal multimodal LLM evaluator
// =============================================================================

const EVALUATION_SYSTEM_PROMPT = `You are a visual quality evaluator for AI-generated media.
Evaluate the provided image against the generation context.

Return ONLY valid JSON matching this exact schema:
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null if no script context>,
    "aesthetics": <0-100>
  },
  "issues": [
    {
      "category": "<category>",
      "severity": "<critical|major|minor|info>",
      "description": "<concise description>"
    }
  ]
}

Issue categories:
- artifact: visual noise, blur, distortion, deformities
- resolution: insufficient detail/sharpness for intended use
- color-distortion: unnatural colors, white balance issues
- prompt-mismatch: generated content doesn't match the prompt
- script-mismatch: doesn't match the scene description/dialogue
- style-drift: inconsistent with specified global style
- character-inconsistency: character appearance differs from reference
- composition-poor: poor framing, balance, or visual flow

Only report actual issues. Empty issues array is valid for a good image.`;

const PROMPT_OPTIMIZATION_SYSTEM_PROMPT = `You are an AI image/video generation prompt engineer.
Given the original prompt and quality issues found, produce an improved prompt.
Focus on fixing the specific issues while preserving the original intent.
Return ONLY the improved prompt text, nothing else. Max 200 words.`;

/** Evaluation context options */
interface EvalOptions {
  globalStyle?: string;
  dialogue?: string[];
}

class VisionEvaluator {
  constructor(private readonly createService: () => ILLMService) {}

  async evaluate(
    mediaPath: string,
    originalPrompt: string,
    description?: string,
    options?: EvalOptions,
  ): Promise<MediaEvaluation> {
    try {
      const base64 = await this.readFileAsBase64(mediaPath);
      const mimeType = this.detectMimeType(mediaPath);

      // Build context-rich text part
      const textParts = [`Original prompt: "${originalPrompt}"`];
      if (description) textParts.push(`Scene description: "${description}"`);
      if (options?.globalStyle) textParts.push(`Global style: "${options.globalStyle}"`);
      if (options?.dialogue?.length)
        textParts.push(`Dialogue: ${JSON.stringify(options.dialogue)}`);

      const service = this.createService();
      const response = await service.chat(
        [
          { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: textParts.join('\n'),
              },
              {
                type: 'image',
                imageUrl: `data:${mimeType};base64,${base64}`,
                detail: 'low',
              },
            ],
          },
        ],
        { maxTokens: 800 },
      );

      const text = extractTextFromContent(response.message.content);
      return this.parseEvaluation(text);
    } catch (error) {
      logger.warn('Vision evaluation failed', { mediaPath, error });
      return {
        overallScore: 0,
        dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0 },
        issues: [
          {
            category: 'artifact',
            severity: 'critical',
            description: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        passed: false,
      };
    }
  }

  async optimizePrompt(originalPrompt: string, issues: QualityIssue[]): Promise<string> {
    try {
      const issueDescriptions = issues.map((i) => `- [${i.category}] ${i.description}`);
      const service = this.createService();
      const response = await service.chat(
        [
          { role: 'system', content: PROMPT_OPTIMIZATION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Original prompt: "${originalPrompt}"\n\nIssues found:\n${issueDescriptions.join('\n')}\n\nProvide an improved prompt:`,
          },
        ],
        { maxTokens: 500 },
      );

      const text = extractTextFromContent(response.message.content);
      return text.trim() || originalPrompt;
    } catch {
      return originalPrompt;
    }
  }

  private parseEvaluation(text: string): MediaEvaluation {
    try {
      const cleaned = text
        .replace(/```json?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      const overallScore = coerceScore(parsed['overallScore']);

      const dims = (parsed['dimensions'] ?? {}) as Record<string, unknown>;
      const dimensions = {
        technicalQuality: coerceScore(dims['technicalQuality']),
        promptAdherence: coerceScore(dims['promptAdherence']),
        scriptAdherence:
          dims['scriptAdherence'] != null ? coerceScore(dims['scriptAdherence']) : undefined,
        aesthetics: coerceScore(dims['aesthetics']),
      };

      const rawIssues = Array.isArray(parsed['issues']) ? parsed['issues'] : [];
      const issues: QualityIssue[] = rawIssues.filter(isValidIssue).map(normalizeIssue);

      return { overallScore, dimensions, issues, passed: false };
    } catch {
      return {
        overallScore: 0,
        dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0 },
        issues: [
          {
            category: 'artifact',
            severity: 'critical',
            description: 'Failed to parse LLM evaluation response',
          },
        ],
        passed: false,
      };
    }
  }

  private async readFileAsBase64(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('base64');
  }

  private detectMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      opus: 'audio/opus',
      m4a: 'audio/mp4',
      flac: 'audio/flac',
    };
    return mimeMap[ext] ?? 'image/png';
  }
}

// =============================================================================
// Audio Evaluator — Deterministic Engine-based analysis (no LLM cost)
// =============================================================================

/** Engine client abstraction for audio analysis */
export interface IAudioAnalyzer {
  analyzeLoudness(
    source: string,
    targetLufs?: number,
  ): Promise<{
    integratedLufs: number;
    truePeakDbfs: number;
    loudnessRange: number;
    recommendedGain: number;
    targetLufs: number;
  }>;
  detectSilence(
    source: string,
    thresholdDbfs?: number,
    minDuration?: number,
  ): Promise<{
    totalDuration: number;
    silenceDuration: number;
    silenceRatio: number;
    regionCount: number;
  }>;
}

// Audio quality thresholds (broadcast standard: ITU-R BS.1770-4)
const CLIPPING_THRESHOLD_DBFS = -1;
const LOUDNESS_MIN_LUFS = -24;
const LOUDNESS_MAX_LUFS = -8;
const LOUDNESS_BROADCAST_MIN = -16;
const LOUDNESS_BROADCAST_MAX = -12;
const SILENCE_RATIO_WARN = 0.5;
const LOUDNESS_RANGE_MAX_LU = 20;

class AudioEvaluator {
  constructor(private readonly analyzer: IAudioAnalyzer) {}

  async evaluate(mediaPath: string): Promise<MediaEvaluation> {
    try {
      const [loudness, silence] = await Promise.all([
        this.analyzer.analyzeLoudness(mediaPath),
        this.analyzer.detectSilence(mediaPath),
      ]);

      const metrics: AudioTechnicalMetrics = {
        integratedLufs: loudness.integratedLufs,
        truePeakDbfs: loudness.truePeakDbfs,
        loudnessRange: loudness.loudnessRange,
        silenceRatio: silence.silenceRatio,
        silenceRegionCount: silence.regionCount,
        clippingDetected: loudness.truePeakDbfs > CLIPPING_THRESHOLD_DBFS,
        loudnessInRange:
          loudness.integratedLufs >= LOUDNESS_BROADCAST_MIN &&
          loudness.integratedLufs <= LOUDNESS_BROADCAST_MAX,
      };

      const issues = this.detectIssues(metrics);
      const audioQuality = this.computeAudioScore(metrics);

      return {
        overallScore: audioQuality,
        dimensions: {
          technicalQuality: audioQuality,
          promptAdherence: 100, // N/A for pure technical audio eval
          aesthetics: 100, // N/A for pure technical audio eval
          audioQuality,
        },
        issues,
        passed: false, // Caller sets this based on minScore
        audioMetrics: metrics,
      };
    } catch (error) {
      logger.warn('Audio evaluation failed', { mediaPath, error });
      return {
        overallScore: 0,
        dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0, audioQuality: 0 },
        issues: [
          {
            category: 'audio-noise',
            severity: 'critical',
            description: `Audio analysis failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        passed: false,
      };
    }
  }

  private detectIssues(metrics: AudioTechnicalMetrics): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Clipping detection
    if (metrics.truePeakDbfs > CLIPPING_THRESHOLD_DBFS) {
      issues.push({
        category: 'audio-clipping',
        severity: metrics.truePeakDbfs > 0 ? 'critical' : 'major',
        description: `True peak at ${metrics.truePeakDbfs.toFixed(1)} dBFS exceeds ${CLIPPING_THRESHOLD_DBFS} dBFS threshold`,
      });
    }

    // Loudness out of range
    if (metrics.integratedLufs < LOUDNESS_MIN_LUFS || metrics.integratedLufs > LOUDNESS_MAX_LUFS) {
      issues.push({
        category: 'loudness-off',
        severity: 'major',
        description: `Integrated loudness ${metrics.integratedLufs.toFixed(1)} LUFS outside acceptable range (${LOUDNESS_MIN_LUFS} to ${LOUDNESS_MAX_LUFS} LUFS)`,
      });
    } else if (!metrics.loudnessInRange) {
      issues.push({
        category: 'loudness-off',
        severity: 'minor',
        description: `Loudness ${metrics.integratedLufs.toFixed(1)} LUFS outside broadcast range (${LOUDNESS_BROADCAST_MIN} to ${LOUDNESS_BROADCAST_MAX} LUFS)`,
      });
    }

    // Excessive dynamic range
    if (metrics.loudnessRange > LOUDNESS_RANGE_MAX_LU) {
      issues.push({
        category: 'loudness-off',
        severity: 'minor',
        description: `Loudness range ${metrics.loudnessRange.toFixed(1)} LU exceeds ${LOUDNESS_RANGE_MAX_LU} LU — dynamic range too wide`,
      });
    }

    // Excessive silence
    if (metrics.silenceRatio > SILENCE_RATIO_WARN) {
      issues.push({
        category: 'audio-noise',
        severity: 'info',
        description: `${(metrics.silenceRatio * 100).toFixed(0)}% silence detected (${metrics.silenceRegionCount} regions)`,
      });
    }

    return issues;
  }

  private computeAudioScore(metrics: AudioTechnicalMetrics): number {
    let score = 100;

    // Clipping: heavy penalty
    if (metrics.clippingDetected) {
      const overshoot = Math.max(0, metrics.truePeakDbfs - CLIPPING_THRESHOLD_DBFS);
      score -= Math.min(40, overshoot * 20);
    }

    // Loudness out of range: moderate penalty
    if (metrics.integratedLufs < LOUDNESS_MIN_LUFS) {
      score -= Math.min(30, Math.abs(metrics.integratedLufs - LOUDNESS_MIN_LUFS) * 2);
    } else if (metrics.integratedLufs > LOUDNESS_MAX_LUFS) {
      score -= Math.min(30, (metrics.integratedLufs - LOUDNESS_MAX_LUFS) * 2);
    } else if (!metrics.loudnessInRange) {
      score -= 10; // Minor penalty for outside broadcast range
    }

    // Excessive dynamic range: light penalty
    if (metrics.loudnessRange > LOUDNESS_RANGE_MAX_LU) {
      score -= Math.min(15, metrics.loudnessRange - LOUDNESS_RANGE_MAX_LU);
    }

    // Excessive silence: light penalty
    if (metrics.silenceRatio > SILENCE_RATIO_WARN) {
      score -= Math.min(10, (metrics.silenceRatio - SILENCE_RATIO_WARN) * 20);
    }

    return coerceScore(Math.round(score));
  }
}

// =============================================================================
// Video Frame Evaluator — Multi-frame LLM-based video analysis
// =============================================================================

/** Engine client abstraction for video frame extraction */
export interface IFrameExtractor {
  /** Extract a single frame at given time (seconds), returns base64 JPEG or null */
  extractFrame(source: string, time: number): Promise<string | null>;
  /** Get video metadata */
  probe(source: string): Promise<{ duration: number; fps: number; width: number; height: number }>;
}

const VIDEO_EVALUATION_SYSTEM_PROMPT = `You are a video quality evaluator for AI-generated video.
You will be shown multiple frames sampled from a video. Evaluate both per-frame quality
AND inter-frame consistency (temporal coherence).

Return ONLY valid JSON matching this exact schema:
{
  "overallScore": <0-100>,
  "dimensions": {
    "technicalQuality": <0-100>,
    "promptAdherence": <0-100>,
    "scriptAdherence": <0-100 or null if no script context>,
    "aesthetics": <0-100>,
    "videoQuality": <0-100>
  },
  "issues": [
    {
      "category": "<category>",
      "severity": "<critical|major|minor|info>",
      "description": "<concise description>"
    }
  ]
}

Issue categories (in addition to standard image categories):
- jitter: flickering, sudden brightness/color changes between frames
- tearing: visual tearing, misaligned frames, stitching artifacts
- stuttering: apparent frame drops, uneven motion, frozen segments
- artifact: visual noise, blur, distortion, deformities
- resolution: insufficient detail/sharpness
- color-distortion: unnatural colors, white balance issues
- prompt-mismatch: content doesn't match the prompt
- script-mismatch: doesn't match the scene description
- style-drift: inconsistent style across frames
- character-inconsistency: character appearance changes between frames
- composition-poor: poor framing or visual flow
- motion-unnatural: physically impossible or unnatural movement

Pay special attention to temporal issues: consistency of lighting, color, character appearance,
and object positions across frames. Only report actual issues found.`;

/** Default number of frames to sample from a video */
const DEFAULT_VIDEO_SAMPLE_FRAMES = 4;

class VideoFrameEvaluator {
  constructor(
    private readonly createService: () => ILLMService,
    private readonly frameExtractor: IFrameExtractor,
    private readonly maxFrames: number = DEFAULT_VIDEO_SAMPLE_FRAMES,
  ) {}

  async evaluate(
    mediaPath: string,
    originalPrompt: string,
    description?: string,
    options?: EvalOptions,
  ): Promise<MediaEvaluation> {
    try {
      // 1. Probe video metadata
      const meta = await this.frameExtractor.probe(mediaPath);
      if (meta.duration <= 0) {
        return this.errorResult('Video has zero duration');
      }

      // 2. Compute uniform sample times (exclude first/last 5% to avoid black frames)
      const margin = meta.duration * 0.05;
      const effectiveDuration = meta.duration - 2 * margin;
      const frameCount = Math.min(
        this.maxFrames,
        Math.max(2, Math.floor(meta.fps * meta.duration)),
      );
      const times: number[] = [];
      for (let i = 0; i < frameCount; i++) {
        times.push(margin + (effectiveDuration * i) / (frameCount - 1 || 1));
      }

      // 3. Extract frames concurrently
      const frameResults = await Promise.allSettled(
        times.map((t) => this.frameExtractor.extractFrame(mediaPath, t)),
      );

      const frames: Array<{ base64: string; time: number }> = [];
      for (let i = 0; i < frameResults.length; i++) {
        const r = frameResults[i];
        if (r?.status === 'fulfilled' && r.value) {
          frames.push({
            base64:
              typeof r.value === 'string'
                ? r.value
                : Buffer.from(r.value as ArrayBuffer).toString('base64'),
            time: times[i]!,
          });
        }
      }

      if (frames.length === 0) {
        return this.errorResult('Failed to extract any frames from video');
      }

      // 4. Build multimodal message with all frames
      const textParts = [
        `Original prompt: "${originalPrompt}"`,
        `Video metadata: ${meta.width}x${meta.height}, ${meta.fps}fps, ${meta.duration.toFixed(1)}s`,
        `Frames sampled: ${frames.length} (at ${frames.map((f) => f.time.toFixed(1) + 's').join(', ')})`,
      ];
      if (description) textParts.push(`Scene description: "${description}"`);
      if (options?.globalStyle) textParts.push(`Global style: "${options.globalStyle}"`);
      if (options?.dialogue?.length)
        textParts.push(`Dialogue: ${JSON.stringify(options.dialogue)}`);

      const contentParts: unknown[] = [{ type: 'text', text: textParts.join('\n') }];

      // Add each frame as an image part
      for (const frame of frames) {
        contentParts.push({
          type: 'image',
          imageUrl: `data:image/jpeg;base64,${frame.base64}`,
          detail: 'low',
        });
      }

      // 5. Call LLM for evaluation
      const service = this.createService();
      const response = await service.chat(
        [
          { role: 'system', content: VIDEO_EVALUATION_SYSTEM_PROMPT },
          { role: 'user', content: contentParts },
        ],
        { maxTokens: 1000 },
      );

      const text = extractTextFromContent(response.message.content);
      const evaluation = this.parseEvaluation(text);

      // 6. Attach video metrics
      const videoMetrics: VideoTechnicalMetrics = {
        duration: meta.duration,
        fps: meta.fps,
        width: meta.width,
        height: meta.height,
        framesSampled: frames.length,
      };

      return {
        ...evaluation,
        videoMetrics,
        dimensions: {
          ...evaluation.dimensions,
          videoQuality: evaluation.dimensions.videoQuality ?? evaluation.overallScore,
        },
      };
    } catch (error) {
      logger.warn('Video evaluation failed', { mediaPath, error });
      return this.errorResult(
        `Video evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private parseEvaluation(text: string): MediaEvaluation {
    try {
      const cleaned = text
        .replace(/```json?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      const overallScore = coerceScore(parsed['overallScore']);

      const dims = (parsed['dimensions'] ?? {}) as Record<string, unknown>;
      const dimensions: MediaEvaluation['dimensions'] = {
        technicalQuality: coerceScore(dims['technicalQuality']),
        promptAdherence: coerceScore(dims['promptAdherence']),
        scriptAdherence:
          dims['scriptAdherence'] != null ? coerceScore(dims['scriptAdherence']) : undefined,
        aesthetics: coerceScore(dims['aesthetics']),
        videoQuality: dims['videoQuality'] != null ? coerceScore(dims['videoQuality']) : undefined,
      };

      const rawIssues = Array.isArray(parsed['issues']) ? parsed['issues'] : [];
      const issues: QualityIssue[] = rawIssues.filter(isValidIssue).map(normalizeIssue);

      return { overallScore, dimensions, issues, passed: false };
    } catch {
      return this.errorResult('Failed to parse LLM video evaluation response');
    }
  }

  private errorResult(message: string): MediaEvaluation {
    return {
      overallScore: 0,
      dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0, videoQuality: 0 },
      issues: [
        {
          category: 'artifact',
          severity: 'critical',
          description: message,
        },
      ],
      passed: false,
    };
  }
}

// =============================================================================
// Media Type Detection
// =============================================================================

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'opus', 'm4a', 'flac', 'ogg', 'aac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi']);

function detectMediaType(filePath: string): EvalMediaType {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'image';
}

// =============================================================================
// QualityCheck Tool
// =============================================================================

/**
 * Create quality check tools for AI-generated media evaluation
 */
export function createQualityCheckTools(deps: QualityCheckToolsDeps): Tool[] {
  const evaluator = new VisionEvaluator(deps.createService);
  const audioEvaluator = deps.audioAnalyzer ? new AudioEvaluator(deps.audioAnalyzer) : undefined;
  const videoEvaluator = deps.frameExtractor
    ? new VideoFrameEvaluator(deps.createService, deps.frameExtractor)
    : undefined;
  const planner = createRemediationPlanner();

  return [
    {
      name: 'QualityCheck',
      description:
        'Evaluate AI-generated media quality using multimodal LLM vision analysis. ' +
        'Returns structured issues with categories (artifact, prompt-mismatch, style-drift, etc.) ' +
        'and remediation actions mapped to existing tools (AddEffect, SetColorCorrection, etc.). ' +
        'Automatically retries low-scoring scenes with optimized prompts. ' +
        'IMPORTANT: Only use when the user explicitly requests quality checking — ' +
        'each evaluation costs a vision LLM call. Do NOT call automatically after generation.',
      parameters: {
        type: 'object',
        properties: {
          scenes: {
            type: 'array',
            description:
              'Array of scenes to evaluate. Each scene has: index (number), ' +
              'mediaPath (file path), prompt (generation prompt), description (optional scene description)',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number', description: 'Scene index' },
                mediaPath: { type: 'string', description: 'Path to generated media file' },
                prompt: { type: 'string', description: 'Prompt used for generation' },
                description: { type: 'string', description: 'Scene description for context' },
              },
              required: ['index', 'mediaPath', 'prompt'],
            },
          },
          maxRetries: {
            type: 'number',
            description: 'Maximum retries per failed scene (default: 2)',
          },
          minScore: {
            type: 'number',
            description: 'Minimum passing score 0-100 (default: 60)',
          },
          style: {
            type: 'string',
            description:
              'Global visual style for regeneration and consistency context (e.g., "anime", "cinematic")',
          },
          sceneDialogue: {
            type: 'array',
            items: { type: 'string' },
            description: 'Scene dialogue lines for script adherence evaluation',
          },
        },
        required: ['scenes'],
      },

      async execute(args: Record<string, unknown>): Promise<unknown> {
        const scenes = args['scenes'] as SceneInput[];
        const maxRetries = (args['maxRetries'] as number | undefined) ?? 2;
        const minScore = (args['minScore'] as number | undefined) ?? 60;
        const style = args['style'] as string | undefined;
        const sceneDialogue = args['sceneDialogue'] as string[] | undefined;

        if (!scenes || scenes.length === 0) {
          return {
            success: true,
            data: { totalScenes: 0, passed: 0, failed: 0, evaluations: [] },
          };
        }

        const evalOptions: EvalOptions = {
          globalStyle: style,
          dialogue: sceneDialogue,
        };

        logger.info('Starting quality check', {
          sceneCount: scenes.length,
          maxRetries,
          minScore,
        });

        // Phase 1: Concurrent initial evaluation (route by media type)
        const initialResults = await Promise.allSettled(
          scenes.map(async (scene) => {
            const mediaType = detectMediaType(scene.mediaPath);
            let result: MediaEvaluation;

            if (mediaType === 'audio' && audioEvaluator) {
              result = await audioEvaluator.evaluate(scene.mediaPath);
            } else if (mediaType === 'video' && videoEvaluator) {
              result = await videoEvaluator.evaluate(
                scene.mediaPath,
                scene.prompt,
                scene.description,
                evalOptions,
              );
            } else {
              result = await evaluator.evaluate(
                scene.mediaPath,
                scene.prompt,
                scene.description,
                evalOptions,
              );
            }

            return { ...result, sceneIndex: scene.index, mediaType };
          }),
        );

        // Collect results and identify failures
        const evaluations: QualityCheckResult['evaluations'] = [];
        const needsRetry: Array<{
          scene: SceneInput;
          evaluation: MediaEvaluation;
          mediaType: EvalMediaType;
        }> = [];

        for (let i = 0; i < initialResults.length; i++) {
          const settled = initialResults[i];
          const scene = scenes[i];
          if (!scene) continue;

          if (settled?.status === 'fulfilled') {
            const evalResult = settled.value;
            const mediaType = evalResult.mediaType;

            if (evalResult.overallScore >= minScore) {
              // Compute remediations even for passing scenes (info-level issues)
              const remediations = evalResult.issues
                .filter((iss) => iss.severity === 'critical' || iss.severity === 'major')
                .map((iss) => planner.plan(iss, mediaType));

              evaluations.push({
                index: scene.index,
                finalScore: evalResult.overallScore,
                passed: true,
                attempts: 1,
                issues: evalResult.issues,
                finalPath: scene.mediaPath,
                dimensions: evalResult.dimensions,
                remediations: remediations.length > 0 ? remediations : undefined,
                audioMetrics: evalResult.audioMetrics,
                videoMetrics: evalResult.videoMetrics,
              });
            } else if (mediaType === 'audio') {
              // Audio: no retry — deterministic fixes via remediations
              const remediations = evalResult.issues
                .filter((iss) => iss.severity === 'critical' || iss.severity === 'major')
                .map((iss) => planner.plan(iss, 'audio'));

              evaluations.push({
                index: scene.index,
                finalScore: evalResult.overallScore,
                passed: false,
                attempts: 1,
                issues: evalResult.issues,
                finalPath: scene.mediaPath,
                dimensions: evalResult.dimensions,
                remediations: remediations.length > 0 ? remediations : undefined,
                audioMetrics: evalResult.audioMetrics,
              });
            } else {
              needsRetry.push({ scene, evaluation: evalResult, mediaType });
            }
          } else {
            // Evaluation itself failed
            needsRetry.push({
              scene,
              mediaType: detectMediaType(scene.mediaPath),
              evaluation: {
                overallScore: 0,
                dimensions: { technicalQuality: 0, promptAdherence: 0, aesthetics: 0 },
                issues: [
                  {
                    category: 'artifact',
                    severity: 'critical',
                    description: 'Evaluation failed',
                  },
                ],
                passed: false,
              },
            });
          }
        }

        // Phase 2: Sequential retry for failed scenes (image/video only; audio skips retry)
        for (const { scene, evaluation, mediaType } of needsRetry) {
          let currentPath = scene.mediaPath;
          let currentPrompt = scene.prompt;
          let bestScore = evaluation.overallScore;
          let bestPath = currentPath;
          let bestIssues = evaluation.issues;
          let bestDimensions = evaluation.dimensions;
          let bestVideoMetrics = evaluation.videoMetrics;
          let attempts = 1;

          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              // Optimize prompt based on evaluation feedback
              const optimizedPrompt = await evaluator.optimizePrompt(
                currentPrompt,
                evaluation.issues,
              );

              // Regenerate media
              const result = await deps.mediaGenerator.generate(optimizedPrompt, {
                type: mediaType === 'video' ? 'video' : 'image',
                style,
              });

              currentPath = result.path;
              currentPrompt = optimizedPrompt;

              // Re-evaluate (route video to VideoFrameEvaluator)
              let reEval: MediaEvaluation;
              if (mediaType === 'video' && videoEvaluator) {
                reEval = await videoEvaluator.evaluate(
                  currentPath,
                  optimizedPrompt,
                  scene.description,
                  evalOptions,
                );
              } else {
                reEval = await evaluator.evaluate(
                  currentPath,
                  optimizedPrompt,
                  scene.description,
                  evalOptions,
                );
              }

              attempts++;

              if (reEval.overallScore > bestScore) {
                bestScore = reEval.overallScore;
                bestPath = currentPath;
                bestIssues = reEval.issues;
                bestDimensions = reEval.dimensions;
                bestVideoMetrics = reEval.videoMetrics;
              }

              if (reEval.overallScore >= minScore) {
                break; // Passed!
              }
            } catch (error) {
              logger.warn('Retry failed for scene', {
                sceneIndex: scene.index,
                retry,
                error,
              });
              attempts++;
            }
          }

          // Compute remediations for remaining issues
          const remediations = bestIssues
            .filter((iss) => iss.severity === 'critical' || iss.severity === 'major')
            .map((iss) => planner.plan(iss, mediaType));

          evaluations.push({
            index: scene.index,
            finalScore: bestScore,
            passed: bestScore >= minScore,
            attempts,
            issues: bestIssues,
            finalPath: bestPath,
            dimensions: bestDimensions,
            remediations: remediations.length > 0 ? remediations : undefined,
            videoMetrics: bestVideoMetrics,
          });
        }

        // Sort by scene index
        evaluations.sort((a, b) => a.index - b.index);

        const result: QualityCheckResult = {
          totalScenes: scenes.length,
          passed: evaluations.filter((e) => e.passed).length,
          failed: evaluations.filter((e) => !e.passed).length,
          evaluations,
        };

        logger.info('Quality check complete', {
          total: result.totalScenes,
          passed: result.passed,
          failed: result.failed,
        });

        return {
          success: true,
          data: result,
        };
      },
    },
  ];
}
