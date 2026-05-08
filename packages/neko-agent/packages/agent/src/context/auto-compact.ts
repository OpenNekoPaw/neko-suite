/**
 * Auto-Compact — Automatic context compression with circuit breaker
 *
 * Monitors token usage during long sessions and triggers compression
 * when thresholds are exceeded. Includes a circuit breaker to prevent
 * repeated compression attempts when the summarizer is failing.
 *
 * Pure functions with explicit state management (no global state).
 */

import type { ChatMessage, IConversationCompressor } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('AutoCompact');

// =============================================================================
// Types
// =============================================================================

/** Mutable state for the auto-compact circuit breaker */
export interface AutoCompactState {
  /** Number of consecutive compression failures */
  consecutiveFailures: number;
  /** Timestamp of last successful compression */
  lastCompactTimestamp: number;
  /** Whether the circuit breaker is open (stop trying) */
  isCircuitOpen: boolean;
  /** Timestamp when circuit was opened (for half-open cooldown) */
  circuitOpenedAt: number;
}

/** Result of an auto-compact check */
export interface AutoCompactResult {
  /** Whether compression was performed */
  compressed: boolean;
  /** New history messages (only when compressed) */
  newHistory?: ChatMessage[];
  /** Full compression result when compaction succeeded */
  compressionResult?: import('@neko/shared').ConversationCompressionResult;
  /** Trigger that caused auto-compaction */
  trigger?: AutoCompactTrigger;
  /** Reason compression was skipped (if not compressed) */
  skipReason?: string;
  /** Error message when compression failed */
  errorMessage?: string;
  /** Consecutive failure count after this run */
  failureCount?: number;
}

export type AutoCompactTrigger = 'token_threshold' | 'turn_threshold';

// =============================================================================
// Constants
// =============================================================================

/** Max consecutive failures before circuit opens */
const MAX_FAILURES = 3;

/** Cooldown period before half-open retry (30 minutes) */
const CIRCUIT_COOLDOWN_MS = 30 * 60 * 1000;

/** Minimum interval between compression attempts (60 seconds) */
const MIN_COMPACT_INTERVAL_MS = 60 * 1000;

// =============================================================================
// Factory
// =============================================================================

/**
 * Create initial auto-compact state.
 */
export function createAutoCompactState(): AutoCompactState {
  return {
    consecutiveFailures: 0,
    lastCompactTimestamp: 0,
    isCircuitOpen: false,
    circuitOpenedAt: 0,
  };
}

// =============================================================================
// Core Function
// =============================================================================

/**
 * Check if compression is needed and perform it if so.
 *
 * Circuit breaker behavior:
 * - After MAX_FAILURES consecutive failures, circuit opens (stops trying)
 * - After CIRCUIT_COOLDOWN_MS, circuit becomes half-open (allows one retry)
 * - A successful compression resets the failure counter
 *
 * @param compressor - Conversation compressor instance
 * @param history - Current conversation history
 * @param currentTokens - Estimated current token count
 * @param state - Mutable circuit breaker state (modified in-place)
 * @param options - Optional configuration
 * @returns Compression result
 */
export async function autoCompactIfNeeded(
  compressor: IConversationCompressor,
  history: ChatMessage[],
  currentTokens: number,
  state: AutoCompactState,
  options?: { activeSkills?: string[] },
): Promise<AutoCompactResult> {
  const now = Date.now();
  const trigger = detectAutoCompactTrigger(compressor, history, currentTokens);

  // 1. Circuit breaker check
  if (state.isCircuitOpen) {
    // Check if cooldown has elapsed (half-open)
    if (now - state.circuitOpenedAt < CIRCUIT_COOLDOWN_MS) {
      return { compressed: false, skipReason: 'circuit_open' };
    }
    // Half-open: allow one retry
    logger.debug('Circuit breaker half-open, allowing retry');
  }

  // 2. Check if compression is needed
  if (!compressor.shouldCompress(history, currentTokens)) {
    return { compressed: false, skipReason: 'threshold_not_reached' };
  }

  // 3. Minimum interval check
  if (now - state.lastCompactTimestamp < MIN_COMPACT_INTERVAL_MS) {
    return { compressed: false, skipReason: 'too_soon' };
  }

  // 4. Attempt compression
  try {
    const result = await compressor.compress(history, {
      activeSkills: options?.activeSkills,
    });

    // Extract messages from compressed result
    const newHistory = result.messages.map((m) => m.message);

    // Success: reset circuit breaker
    state.consecutiveFailures = 0;
    state.isCircuitOpen = false;
    state.lastCompactTimestamp = now;

    logger.info('Auto-compact succeeded', {
      originalTokens: result.originalTokens,
      compressedTokens: result.compressedTokens,
      ratio: result.compressionRatio.toFixed(2),
      messagesRemoved: result.messagesRemoved,
    });

    return { compressed: true, newHistory, compressionResult: result, trigger };
  } catch (error) {
    // Failure: increment counter, maybe open circuit
    state.consecutiveFailures++;

    if (state.consecutiveFailures >= MAX_FAILURES) {
      state.isCircuitOpen = true;
      state.circuitOpenedAt = now;
      logger.warn('Auto-compact circuit breaker opened after consecutive failures', {
        failures: state.consecutiveFailures,
      });
    } else {
      logger.warn('Auto-compact failed', {
        failures: state.consecutiveFailures,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      compressed: false,
      trigger,
      skipReason: state.isCircuitOpen ? 'circuit_opened' : 'compression_failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      failureCount: state.consecutiveFailures,
    };
  }
}

function detectAutoCompactTrigger(
  compressor: IConversationCompressor,
  history: ChatMessage[],
  currentTokens: number,
): AutoCompactTrigger | undefined {
  const config = compressor.getConfig();
  if (currentTokens >= config.triggers.tokenThreshold) {
    return 'token_threshold';
  }

  const turns = compressor.getTurns(history);
  if (turns.length >= config.triggers.turnThreshold) {
    return 'turn_threshold';
  }

  return undefined;
}
