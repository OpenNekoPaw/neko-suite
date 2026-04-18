/**
 * LLMRouter tools — the 5-tool catalog the model sees when routing ambiguous
 * inputs.
 *
 * The tool shapes are OpenAI-compatible (matching Platform's `ToolDefinition`).
 * Each tool has:
 *   - a JSON schema for the model to call with
 *   - a pure/async runner the router invokes locally to produce the tool's
 *     response (posted back as a `tool`-role message)
 *
 * See docs/architecture/workflow-routing.md §6 for the tool contract.
 *
 * Phase 3 MVP scope:
 *   ✓ analyze_text_structure — heuristic structural probe (pure)
 *   ✓ check_existing_assets — read-only count from AssetLibrary
 *   ✓ estimate_duration     — reuses the cost-estimator
 *   ✓ commit_route          — terminal; signals the router to stop
 *   △ ask_user              — returns a deferred placeholder; resolved to
 *                             fallback in Phase 3 MVP. Phase 3.5 wires it to
 *                             the webview for a real interactive prompt.
 */

import type { ToolDefinition } from '../../types/adapter';
import type { AssetLibrary, AssetKind } from '../asset-library/types';
import type { RouteLevel } from '../types';
import { estimateRouteCost } from './cost-estimator';

// =============================================================================
// Tool names (constants so both catalog + runner use the same spelling)
// =============================================================================

export const ROUTER_TOOL_NAMES = {
  analyzeTextStructure: 'analyze_text_structure',
  checkExistingAssets: 'check_existing_assets',
  estimateDuration: 'estimate_duration',
  askUser: 'ask_user',
  commitRoute: 'commit_route',
} as const;

export type RouterToolName = (typeof ROUTER_TOOL_NAMES)[keyof typeof ROUTER_TOOL_NAMES];

// =============================================================================
// Tool argument / result types
// =============================================================================

export interface AnalyzeTextStructureArgs {
  excerpt: string;
}

export interface AnalyzeTextStructureResult {
  lineCount: number;
  headingCount: number;
  dialogueLineCount: number;
  sceneBreakCount: number;
  hasFountainCues: boolean;
  hasChineseText: boolean;
}

export interface CheckExistingAssetsArgs {
  kind?: AssetKind;
}

export interface CheckExistingAssetsResult {
  assetCount: number;
  byKind: Partial<Record<AssetKind, number>>;
  entityCount: number;
}

export interface EstimateDurationArgs {
  level: RouteLevel;
}

export interface EstimateDurationResult {
  level: RouteLevel;
  tokens: number;
  credits: number;
  durationSec: number;
}

export interface AskUserArgs {
  question: string;
  options?: string[];
}

export interface AskUserResult {
  status: 'deferred';
  note: string;
}

export interface CommitRouteArgs {
  level: RouteLevel;
  reason: string;
  skipStages?: string[];
  entryExtension?: 'agent' | 'story' | 'canvas' | 'sketch' | 'cut' | 'preview';
}

export interface CommitRouteResult {
  status: 'committed';
  level: RouteLevel;
}

// =============================================================================
// Tool definitions (what the LLM sees)
// =============================================================================

export const ROUTER_TOOL_DEFS: readonly ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: ROUTER_TOOL_NAMES.analyzeTextStructure,
      description:
        'Run a cheap structural probe over a text excerpt. Returns counts ' +
        'of headings, dialogue lines, and scene breaks plus a flag for ' +
        'Fountain-style screenplay cues. Use when the FastProbe confidence ' +
        'is low on a long text input.',
      parameters: {
        type: 'object',
        properties: {
          excerpt: {
            type: 'string',
            description:
              'First ~2000 characters of the input text. Pass verbatim; ' +
              'this tool does not re-fetch.',
          },
        },
        required: ['excerpt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: ROUTER_TOOL_NAMES.checkExistingAssets,
      description:
        'Query the project AssetLibrary for what is already available. ' +
        'Use when choosing between L2 (has assets) vs L3 (need to generate).',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['image', 'video', 'puppet-2d', 'model-3d', 'motion', 'audio', 'document'],
            description: 'Optional filter by asset kind.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: ROUTER_TOOL_NAMES.estimateDuration,
      description:
        'Return the rough token/credit/duration cost of a given route level. ' +
        'Use to compare a cheap L1 against a full L3 before committing.',
      parameters: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['L0', 'L1', 'L2', 'L3', 'L4'],
          },
        },
        required: ['level'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: ROUTER_TOOL_NAMES.askUser,
      description:
        'Ask the user a clarifying question when routing is genuinely ' +
        'ambiguous. Returns `deferred` in Phase 3 MVP — the router will ' +
        'fall back to FastProbe rather than block. Use sparingly.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: ROUTER_TOOL_NAMES.commitRoute,
      description:
        'Commit a final route. Terminal — the router stops calling tools ' +
        'once this fires. Provide a short reason for the audit log.',
      parameters: {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['L0', 'L1', 'L2', 'L3', 'L4'],
          },
          reason: { type: 'string' },
          skipStages: {
            type: 'array',
            items: { type: 'string' },
          },
          entryExtension: {
            type: 'string',
            enum: ['agent', 'story', 'canvas', 'sketch', 'cut', 'preview'],
          },
        },
        required: ['level', 'reason'],
      },
    },
  },
];

// =============================================================================
// Runners (local execution of tool calls)
// =============================================================================

export interface RouterToolContext {
  /** Optional — enables `check_existing_assets` */
  assetLibrary?: AssetLibrary;
}

/** Run `analyze_text_structure`. Pure. */
export function runAnalyzeTextStructure(
  args: AnalyzeTextStructureArgs,
): AnalyzeTextStructureResult {
  const lines = args.excerpt.split(/\r?\n/);
  let headingCount = 0;
  let dialogueLineCount = 0;
  let sceneBreakCount = 0;
  let hasFountainCues = false;

  const fountainSceneHeading = /^(INT\.|EXT\.|I\/E\.|E\/I\.)/;
  const mdHeading = /^#{1,6}\s+/;
  const bracketedScene = /^\[[^\]]+\]$/;
  const dialogueBlock = /^\s{2,}/; // indented line in fountain/drama format
  const sceneBreak = /^-{3,}$|^={3,}$|^\*{3,}$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    if (fountainSceneHeading.test(line) || bracketedScene.test(line)) {
      headingCount++;
      hasFountainCues = hasFountainCues || fountainSceneHeading.test(line);
    } else if (mdHeading.test(line)) {
      headingCount++;
    } else if (sceneBreak.test(line)) {
      sceneBreakCount++;
    } else if (dialogueBlock.test(raw)) {
      dialogueLineCount++;
    }
  }

  return {
    lineCount: lines.length,
    headingCount,
    dialogueLineCount,
    sceneBreakCount,
    hasFountainCues,
    hasChineseText: /[\u4e00-\u9fff]/.test(args.excerpt),
  };
}

/** Run `check_existing_assets` against the AssetLibrary. */
export function runCheckExistingAssets(
  args: CheckExistingAssetsArgs,
  ctx: RouterToolContext,
): CheckExistingAssetsResult {
  const lib = ctx.assetLibrary;
  if (!lib) {
    return { assetCount: 0, byKind: {}, entityCount: 0 };
  }
  const assets = lib.listAssets(args.kind !== undefined ? { kind: args.kind } : undefined);
  const byKind: Partial<Record<AssetKind, number>> = {};
  for (const asset of assets) {
    byKind[asset.kind] = (byKind[asset.kind] ?? 0) + 1;
  }
  return {
    assetCount: assets.length,
    byKind,
    entityCount: lib.listEntities().length,
  };
}

/** Run `estimate_duration`. Pure. */
export function runEstimateDuration(args: EstimateDurationArgs): EstimateDurationResult {
  const cost = estimateRouteCost(args.level);
  return { level: args.level, ...cost };
}

/** Run `ask_user` — deferred in Phase 3 MVP. */
export function runAskUser(_args: AskUserArgs): AskUserResult {
  return {
    status: 'deferred',
    note:
      'Phase 3 MVP does not surface the question to the user. Commit your ' +
      'best-guess route or return control to FastProbe.',
  };
}
