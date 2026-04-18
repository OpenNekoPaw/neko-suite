/**
 * LLMRouter — Phase 3 routing layer powered by a small tool-using LLM.
 *
 * Invoked by the Router facade when FastProbe's confidence falls in the
 * ambiguous band (0.3..0.9). The LLM is given the FastProbe hint plus a
 * catalog of 5 tools (see llm-router-tools.ts) and must eventually call
 * `commit_route` to produce a decision.
 *
 * Budget discipline (see docs/architecture/workflow-routing.md §6):
 *   - Hard wall-clock cap (default 2000ms). When exceeded the router aborts
 *     the in-flight chat call and returns undefined so the facade can fall
 *     back to FastProbe. The user never waits on the LLM.
 *   - Max tool-use iterations (default 5). Guards against a runaway loop
 *     if the model keeps asking for more info.
 *   - In-session cache keyed by `hashInput(input, workDir)`. Re-invoking the
 *     router with the same input within one session is a free lookup.
 *
 * Persistence:
 *   - On commit, the decision is recorded through the injected `memory`
 *     (see router-memory.ts) so subsequent sessions can look it up.
 *   - The router does NOT read from memory itself — that's the Router
 *     facade's job (so FastProbe / user-override can also be memory-aware).
 */

import type { ChatMessage, ChatResponse, ToolDefinition } from '../../types/adapter';
import type { AssetLibrary } from '../asset-library/types';
import type { FastProbeResult, ProbeContext, RawInput, RouteLevel } from '../types';
import type { ServiceOptions } from '../../types/service';
import { hashInput } from './input-hash';
import type { RouterMemory } from '../memory/router-memory';
import {
  ROUTER_TOOL_DEFS,
  ROUTER_TOOL_NAMES,
  runAnalyzeTextStructure,
  runAskUser,
  runCheckExistingAssets,
  runEstimateDuration,
  type AnalyzeTextStructureArgs,
  type CheckExistingAssetsArgs,
  type CommitRouteArgs,
  type EstimateDurationArgs,
  type AskUserArgs,
} from './llm-router-tools';

// =============================================================================
// Public API
// =============================================================================

/**
 * Minimal contract the LLMRouter needs from `Service`. Allows tests to pass
 * a mock without constructing a full platform.
 */
export type LLMChatFn = (messages: ChatMessage[], options: ServiceOptions) => Promise<ChatResponse>;

export interface LLMRouterOptions {
  /** Chat adapter — usually `(msgs, opts) => platform.createService().chat(msgs, opts)` */
  chat: LLMChatFn;
  /** Optional memory for persisting committed decisions */
  memory?: RouterMemory;
  /** Optional AssetLibrary; enables the `check_existing_assets` tool */
  assetLibrary?: AssetLibrary;
  /**
   * `providerId:modelId` override (passed through as ServiceOptions.modelId).
   * When omitted, the platform's default fast model is used.
   */
  modelId?: string;
  /** Maximum tool-use iterations before giving up. Default 5 */
  maxIterations?: number;
  /** Wall-clock budget in ms. Default 2000 */
  budgetMs?: number;
  /** Clock (for tests) */
  now?: () => number;
}

export interface LLMRouterDecideInput {
  input: RawInput;
  ctx: ProbeContext;
  fastHint: FastProbeResult;
  /** Optional workDir for hash salting */
  workDir?: string;
  /** Caller-supplied signal. Composed with the internal budget signal. */
  signal?: AbortSignal;
}

export interface LLMRouterResult {
  level: RouteLevel;
  reason: string;
  skipStages: readonly string[];
  entryExtension?: 'agent' | 'story' | 'canvas' | 'sketch' | 'cut' | 'preview';
  /** Confidence — always 0.85 when the LLM commits (hard-coded for now) */
  confidence: number;
  /** Number of tool-use iterations it took */
  iterations: number;
  /** sha256 hex of the input (for memory keying) */
  inputHash: string;
  /** Whether this decision came from the in-session cache */
  fromCache: boolean;
}

export class LLMRouter {
  private readonly modelId: string | undefined;
  private readonly maxIterations: number;
  private readonly budgetMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, LLMRouterResult>();

  constructor(private readonly options: LLMRouterOptions) {
    this.modelId = options.modelId;
    this.maxIterations = options.maxIterations ?? 5;
    this.budgetMs = options.budgetMs ?? 2000;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Decide a route for an ambiguous input.
   *
   * Returns `undefined` when the budget / iteration cap is exceeded OR the
   * LLM raised an error — the Router facade treats undefined as "fall back
   * to FastProbe".
   */
  async decide(input: LLMRouterDecideInput): Promise<LLMRouterResult | undefined> {
    const hash = hashInput(
      input.input,
      input.workDir !== undefined ? { workDir: input.workDir } : {},
    );
    const cached = this.cache.get(hash);
    if (cached) return { ...cached, fromCache: true };

    const controller = new AbortController();
    const composedSignal = composeSignals(input.signal, controller.signal);
    const deadline = this.now() + this.budgetMs;
    const budgetTimer = setTimeout(() => controller.abort(), this.budgetMs);

    try {
      const result = await this.runLoop(input, hash, deadline, composedSignal);
      if (!result) return undefined;
      this.cache.set(hash, { ...result, fromCache: false });

      // Fire-and-forget persist. Errors go to the caller's logger through
      // the store; the router never blocks on memory I/O.
      if (this.options.memory) {
        void this.options.memory
          .record({
            hash,
            level: result.level,
            reason: result.reason,
            at: this.now(),
            source: 'llm',
            ...(input.ctx.textLength !== undefined && { textLength: input.ctx.textLength }),
          })
          .catch(() => undefined);
      }
      return result;
    } catch {
      return undefined;
    } finally {
      clearTimeout(budgetTimer);
    }
  }

  /** Session-local cache size — exposed for metrics / tests. */
  getCacheSize(): number {
    return this.cache.size;
  }

  /** Drop all cached results (used by tests and the /reset-cache command). */
  clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Tool-use loop
  // ---------------------------------------------------------------------------

  private async runLoop(
    input: LLMRouterDecideInput,
    hash: string,
    deadline: number,
    signal: AbortSignal,
  ): Promise<LLMRouterResult | undefined> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt(input) },
    ];

    for (let iter = 0; iter < this.maxIterations; iter++) {
      if (this.now() >= deadline || signal.aborted) return undefined;
      const response = await this.options.chat(messages, {
        ...(this.modelId !== undefined && { modelId: this.modelId }),
        tools: ROUTER_TOOL_DEFS as ToolDefinition[],
        toolChoice: 'auto',
        temperature: 0,
        signal,
      });
      const assistantMsg = response.message;
      messages.push(assistantMsg);

      const toolCalls = assistantMsg.toolCalls ?? [];
      if (toolCalls.length === 0) {
        // Model ended the turn without calling commit_route — treat as
        // "unable to decide" and bail out.
        return undefined;
      }

      for (const call of toolCalls) {
        if (call.function.name === ROUTER_TOOL_NAMES.commitRoute) {
          const args = safeJsonParse<CommitRouteArgs>(call.function.arguments);
          if (!args) return undefined;
          return {
            level: args.level,
            reason: args.reason,
            skipStages: args.skipStages ?? [],
            ...(args.entryExtension !== undefined && { entryExtension: args.entryExtension }),
            confidence: 0.85,
            iterations: iter + 1,
            inputHash: hash,
            fromCache: false,
          };
        }

        const toolResult = this.runTool(call.function.name, call.function.arguments);
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
          toolCallId: call.id,
        });
      }
    }
    return undefined;
  }

  private runTool(name: string, argsRaw: string): unknown {
    const parsed = safeJsonParse<Record<string, unknown>>(argsRaw) ?? {};
    switch (name) {
      case ROUTER_TOOL_NAMES.analyzeTextStructure:
        return runAnalyzeTextStructure(parsed as unknown as AnalyzeTextStructureArgs);
      case ROUTER_TOOL_NAMES.checkExistingAssets:
        return runCheckExistingAssets(parsed as unknown as CheckExistingAssetsArgs, {
          ...(this.options.assetLibrary !== undefined && {
            assetLibrary: this.options.assetLibrary,
          }),
        });
      case ROUTER_TOOL_NAMES.estimateDuration:
        return runEstimateDuration(parsed as unknown as EstimateDurationArgs);
      case ROUTER_TOOL_NAMES.askUser:
        return runAskUser(parsed as unknown as AskUserArgs);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
}

// =============================================================================
// Prompt builders
// =============================================================================

function systemPrompt(): string {
  return [
    'You are the neko-suite workflow router. Given a creative input, pick',
    'one of 5 route levels (L0..L4) that matches the shortest viable pipeline.',
    '',
    'L0: prompt → single-shot generation (one clip, no storyboard)',
    'L1: prompt → batch storyboard (MV / short video)',
    'L2: structured input → storyboard → batch (ad / trailer)',
    'L3: long text → full script pipeline (short drama / micro-movie)',
    'L4: visual input (comic, 3D) → redraw + storyboard',
    '',
    'You have 4 investigative tools (analyze_text_structure, check_existing_assets,',
    'estimate_duration, ask_user) and one terminal tool (commit_route). Call at',
    'most 2 investigative tools, then commit. Do not ask the user anything that',
    'can be answered by the tools.',
    '',
    'Return via commit_route with a short (< 80 char) reason. Prefer the',
    "lower-level route when in doubt — it's cheaper and faster for the user.",
  ].join('\n');
}

function userPrompt(input: LLMRouterDecideInput): string {
  const { ctx, fastHint } = input;
  const lines: string[] = [
    'Route this input:',
    '',
    `- inputType: ${ctx.inputType}`,
    ...(ctx.textLength !== undefined ? [`- textLength: ${ctx.textLength}`] : []),
    ...(ctx.fileExt !== undefined ? [`- fileExt: .${ctx.fileExt}`] : []),
    ...(ctx.fileCount !== undefined ? [`- fileCount: ${ctx.fileCount}`] : []),
    ...(ctx.dropTarget !== undefined ? [`- dropTarget: ${ctx.dropTarget}`] : []),
    ...(ctx.userHint !== undefined ? [`- userHint: ${ctx.userHint}`] : []),
    '',
    'FastProbe hint:',
    `- suggested: ${fastHint.route ?? '(none)'}`,
    `- confidence: ${fastHint.confidence.toFixed(2)}`,
    `- reason: ${fastHint.reason}`,
  ];
  if (input.input.kind === 'prompt') {
    const excerpt = input.input.text.slice(0, 2000);
    lines.push('', 'Text excerpt (first 2000 chars):', excerpt);
  }
  return lines.join('\n');
}

// =============================================================================
// Helpers
// =============================================================================

function composeSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  if (a.aborted) return a;
  const controller = new AbortController();
  const forward = (): void => controller.abort();
  a.addEventListener('abort', forward, { once: true });
  b.addEventListener('abort', forward, { once: true });
  return controller.signal;
}

function safeJsonParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
