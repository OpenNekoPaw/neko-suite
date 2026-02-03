/**
 * LLM Routing Types - Type definitions for LLM routing
 */

import type { Model, Provider } from '../../types/provider';
import type {
  BaseRoutingResult,
  BaseRoutingPreference,
  RoutingCandidate,
  IRoutingStrategy,
} from '../../core/router';

/**
 * LLM routing context
 */
export interface LLMRoutingContext {
  /** Task type: chat, completion, embedding */
  taskType: 'chat' | 'completion' | 'embedding';
  /** Estimated input token count */
  estimatedInputTokens?: number;
  /** Whether streaming is required */
  requireStream?: boolean;
  /** Whether tool/function calling is required */
  requireToolCalling?: boolean;
  /** Whether vision capability is required */
  requireVision?: boolean;
  /** Whether JSON mode is required */
  requireJsonMode?: boolean;
  /** User routing preference */
  preference?: LLMRoutingPreference;
  /** Provider health status map */
  providerHealth: Map<string, boolean>;
}

/**
 * LLM routing preference
 */
export interface LLMRoutingPreference extends BaseRoutingPreference {
  /** Preferred provider ID */
  preferredProvider?: string;
  /** Preferred model ID */
  preferredModel?: string;
  /** Maximum cost per 1k tokens */
  maxCostPer1kTokens?: number;
  /** Minimum context window size */
  minContextWindow?: number;
}

/**
 * LLM routing candidate
 */
export interface LLMRoutingCandidate {
  /** Provider */
  provider: Provider;
  /** Model */
  model: Model;
}

/**
 * LLM routing result
 */
export interface LLMRoutingResult extends BaseRoutingResult {
  /** Selected provider ID */
  providerId: string;
  /** Selected model ID */
  modelId: string;
  /** Provider object */
  provider: Provider;
  /** Model object */
  model: Model;
}

/**
 * LLM routing strategy type alias
 */
export type LLMRoutingStrategy = IRoutingStrategy<
  LLMRoutingCandidate,
  LLMRoutingContext
>;

/**
 * Wrapped LLM routing candidate with score
 */
export type ScoredLLMCandidate = RoutingCandidate<LLMRoutingCandidate>;
