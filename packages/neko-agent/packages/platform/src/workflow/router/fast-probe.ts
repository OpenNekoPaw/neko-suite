/**
 * FastProbe — deterministic rule layer of the Router.
 *
 * Pure function: no I/O, no LLM, no side effects. Given a ProbeContext,
 * returns a FastProbeResult with a confidence 0..1.
 *
 * See docs/architecture/workflow-routing.md §5 for the rule table.
 *
 * Policy:
 *  - confidence ≥ 0.9 → caller commits without consulting LLMRouter
 *  - 0.6 ≤ confidence < 0.9 → caller may consult LLMRouter as refinement
 *  - confidence < 0.6 → LLMRouter takes over (or falls back to the default)
 *
 * Every rule here must be table-driven and unit-testable.
 */

import type { FastProbeResult, ProbeContext, RouteLevel } from '../types';

// =============================================================================
// Rule thresholds
// =============================================================================

/** Prompt shorter than this → always L0 (single-shot direct generation) */
const L0_PROMPT_MAX_LEN = 200;

/** Prompt 200..500 chars → L1 (batch storyboard with unified style) */
const L1_PROMPT_MAX_LEN = 500;

/** ≥ this many images → batch mode (L1 with parallel generation) */
const BATCH_IMAGE_MIN_COUNT = 3;

/** Long text threshold → L3 full pipeline */
const L3_LONG_TEXT_MIN_LEN = 2000;

// =============================================================================
// Extension classification
// =============================================================================

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'apng', 'tiff', 'tif']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']);
const MODEL_2D_EXTS = new Set(['nkpup', 'inp', 'psd', 'nksk']);
const MODEL_3D_EXTS = new Set(['gltf', 'glb', 'fbx', 'obj', 'stl']);
const MOTION_EXTS = new Set(['bvh', 'vmd']);
const DOC_EXTS = new Set(['txt', 'md', 'markdown', 'docx', 'doc', 'rtf', 'pdf', 'epub']);

function classifyExt(ext: string | undefined): string {
  if (!ext) return 'unknown';
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return 'image';
  if (VIDEO_EXTS.has(e)) return 'video';
  if (MODEL_2D_EXTS.has(e)) return 'model-2d';
  if (MODEL_3D_EXTS.has(e)) return 'model-3d';
  if (MOTION_EXTS.has(e)) return 'motion';
  if (DOC_EXTS.has(e)) return 'document';
  if (e === 'fountain') return 'fountain';
  if (e === 'nkc') return 'canvas';
  if (e === 'nkv') return 'timeline';
  if (e === 'nks') return 'script';
  if (e === 'nkproj') return 'project';
  return 'unknown';
}

// =============================================================================
// FastProbe entry
// =============================================================================

export function fastProbe(ctx: ProbeContext): FastProbeResult {
  // Rule priority: explicit drop target > project reference > file extension > text length > fallback.
  // Each rule returns the first matching result; no fall-through once a rule fires.

  // --- Drop target rules (strongest signal: user's explicit intent) ---
  const dropRule = probeByDropTarget(ctx);
  if (dropRule) return dropRule;

  // --- Project reference rules ---
  const projectRule = probeByProject(ctx);
  if (projectRule) return projectRule;

  // --- File-based rules ---
  const fileRule = probeByFile(ctx);
  if (fileRule) return fileRule;

  // --- Prompt-based rules ---
  const promptRule = probeByPrompt(ctx);
  if (promptRule) return promptRule;

  // --- Fallback: ambiguous, low confidence ---
  return {
    confidence: 0.3,
    skipStages: [],
    reason: 'No deterministic rule matched; defer to LLMRouter',
  };
}

// =============================================================================
// Rule families
// =============================================================================

function probeByDropTarget(ctx: ProbeContext): FastProbeResult | undefined {
  if (!ctx.dropTarget) return undefined;

  // When user drops directly onto Cut timeline — they want to work on an existing timeline
  if (ctx.dropTarget === 'cut') {
    return {
      confidence: 0.95,
      route: 'L0', // Direct post-production, no generation
      entryExtension: 'cut',
      skipStages: [
        'readDocument',
        'parseStoryboard',
        'importStoryboardToCanvas',
        'generatePrompts',
        'generatePilot',
        'batchGenerate',
        'qualityGate',
      ],
      reason: 'Drop onto Cut timeline — direct post-production',
    };
  }

  // Drop onto Canvas — user is working on a storyboard
  if (ctx.dropTarget === 'canvas') {
    return {
      confidence: 0.95,
      route: 'L2',
      entryExtension: 'canvas',
      skipStages: [],
      reason: 'Drop onto Canvas — storyboard-driven generation',
    };
  }

  // Drop onto Sketch — visual editing first
  if (ctx.dropTarget === 'sketch') {
    return {
      confidence: 0.95,
      route: 'L4',
      entryExtension: 'sketch',
      skipStages: ['readDocument'],
      reason: 'Drop onto Sketch — visual-first workflow',
    };
  }

  // Drop onto Story — script-driven
  if (ctx.dropTarget === 'story') {
    return {
      confidence: 0.9,
      route: 'L3',
      entryExtension: 'story',
      skipStages: [],
      reason: 'Drop onto Story — script-driven workflow',
    };
  }

  return undefined;
}

function probeByProject(ctx: ProbeContext): FastProbeResult | undefined {
  if (ctx.inputType !== 'project' && !ctx.existingProject) return undefined;

  // If project has a pinned workflow, the router should defer to it.
  // Caller inspects existingProject to extract the workflow field.
  return {
    confidence: 0.98,
    // Don't guess route level; the project file decides
    route: undefined,
    entryExtension: 'agent',
    skipStages: [],
    reason: 'Project reference — read workflow from .nkproj',
  };
}

function probeByFile(ctx: ProbeContext): FastProbeResult | undefined {
  if (ctx.inputType !== 'file' && ctx.inputType !== 'images') return undefined;

  const cat = classifyExt(ctx.fileExt);

  switch (cat) {
    case 'fountain':
      return {
        confidence: 0.95,
        route: 'L2',
        entryExtension: 'story',
        // Fountain is already parsed-ready; skip document reading
        skipStages: ['readDocument'],
        reason: 'Fountain script — structured, skip document reading',
      };
    case 'canvas':
      return {
        confidence: 0.95,
        route: 'L2',
        entryExtension: 'canvas',
        skipStages: ['readDocument', 'parseStoryboard'],
        reason: '.nkc canvas — storyboard already defined',
      };
    case 'timeline':
      return {
        confidence: 0.98,
        route: 'L0',
        entryExtension: 'cut',
        skipStages: [
          'readDocument',
          'parseStoryboard',
          'importStoryboardToCanvas',
          'generatePrompts',
          'generatePilot',
          'batchGenerate',
          'qualityGate',
        ],
        reason: '.nkv timeline — post-production only',
      };
    case 'script':
      return {
        confidence: 0.9,
        route: 'L3',
        entryExtension: 'story',
        skipStages: ['readDocument'],
        reason: '.nks script — skip to parsing',
      };
    case 'document':
      return {
        confidence: 0.85,
        route: 'L3',
        entryExtension: 'story',
        skipStages: [],
        reason: `Document (.${ctx.fileExt}) — full pipeline from reading`,
      };
    case 'model-2d':
      return {
        confidence: 0.9,
        route: 'L4',
        entryExtension: 'sketch',
        skipStages: ['readDocument'],
        reason: `2D model (.${ctx.fileExt}) — visual-first workflow`,
      };
    case 'model-3d':
      return {
        confidence: 0.9,
        route: 'L4',
        entryExtension: 'canvas',
        skipStages: ['readDocument'],
        reason: `3D model (.${ctx.fileExt}) — visual-first workflow`,
      };
    case 'image':
    case 'video':
      return probeByImageOrVideo(ctx);
    default:
      return undefined;
  }
}

function probeByImageOrVideo(ctx: ProbeContext): FastProbeResult {
  // Single image → ambiguous (could be reference, first frame, or final frame)
  const count = ctx.fileCount ?? 1;

  if (count >= BATCH_IMAGE_MIN_COUNT) {
    return {
      confidence: 0.9,
      route: 'L1',
      entryExtension: 'canvas',
      skipStages: ['readDocument', 'parseStoryboard'],
      reason: `${count} images — batch storyboard generation`,
    };
  }

  // 1-2 images: let LLMRouter decide (reference vs. first frame vs. direct)
  return {
    confidence: 0.55,
    route: 'L1',
    entryExtension: 'canvas',
    skipStages: ['readDocument', 'parseStoryboard'],
    reason: `${count} image(s) — ambiguous intent, LLMRouter should refine`,
  };
}

function probeByPrompt(ctx: ProbeContext): FastProbeResult | undefined {
  if (ctx.inputType !== 'prompt' && ctx.inputType !== 'text') return undefined;

  const len = ctx.textLength ?? 0;

  if (len < L0_PROMPT_MAX_LEN) {
    return {
      confidence: 0.92,
      route: 'L0',
      entryExtension: 'agent',
      skipStages: ['arrangeOnTimeline'],
      reason: `Short prompt (${len} chars) — direct single-shot generation`,
    };
  }

  if (len < L1_PROMPT_MAX_LEN) {
    return {
      confidence: 0.85,
      route: 'L1',
      entryExtension: 'agent',
      skipStages: [],
      reason: `Medium text (${len} chars) — batch storyboard, unified style`,
    };
  }

  if (len >= L3_LONG_TEXT_MIN_LEN) {
    return {
      confidence: 0.88,
      route: 'L3',
      entryExtension: 'story',
      skipStages: [],
      reason: `Long text (${len} chars) — full script pipeline`,
    };
  }

  // 500..2000 chars: ambiguous, leave for LLMRouter
  return {
    confidence: 0.6,
    route: 'L2',
    entryExtension: 'agent',
    skipStages: [],
    reason: `Medium-long text (${len} chars) — ambiguous, LLMRouter should refine`,
  };
}

// =============================================================================
// Exported helpers for tests
// =============================================================================

/** Internal — exposed for unit tests */
export const __internal = {
  classifyExt,
  L0_PROMPT_MAX_LEN,
  L1_PROMPT_MAX_LEN,
  L3_LONG_TEXT_MIN_LEN,
  BATCH_IMAGE_MIN_COUNT,
};

/** Type predicate: is this a high-confidence result ready to commit? */
export function isCommittable(
  result: FastProbeResult,
): result is FastProbeResult & { route: RouteLevel } {
  return result.confidence >= 0.9 && result.route !== undefined;
}
