/**
 * LLM Capability Filter Strategy
 *
 * Priority: 80
 * - Filters models that don't have required capabilities
 */

import { addScore } from '../../../core/router';
import type {
  LLMRoutingStrategy,
  LLMRoutingContext,
  ScoredLLMCandidate,
} from '../types';

export class LLMCapabilityFilterStrategy implements LLMRoutingStrategy {
  readonly name = 'capability-filter';
  readonly priority = 80;

  filter(
    candidates: ScoredLLMCandidate[],
    context: LLMRoutingContext
  ): ScoredLLMCandidate[] {
    return candidates.filter((c) => {
      const caps = c.item.model.capabilities ?? [];

      // Check task type capability
      if (context.taskType === 'chat' && !caps.includes('chat')) {
        return false;
      }
      if (context.taskType === 'embedding' && !caps.includes('embedding')) {
        return false;
      }

      // Check streaming
      if (context.requireStream && !caps.includes('stream')) {
        return false;
      }

      // Check tool calling (function_call or tool_use)
      if (context.requireToolCalling) {
        const hasToolCalling =
          caps.includes('function_call') ||
          caps.includes('tool_use') ||
          caps.includes('tools');
        if (!hasToolCalling) {
          return false;
        }
      }

      // Check vision
      if (context.requireVision && !caps.includes('vision')) {
        return false;
      }

      // Check JSON mode
      if (context.requireJsonMode) {
        const hasJsonMode =
          caps.includes('json_mode') || caps.includes('json_output');
        if (!hasJsonMode) {
          return false;
        }
      }

      return true;
    });
  }

  score(candidates: ScoredLLMCandidate[]): ScoredLLMCandidate[] {
    // Capability filter doesn't add scores, just filters
    return candidates.map((c) => addScore(c, this.name, 0));
  }
}
