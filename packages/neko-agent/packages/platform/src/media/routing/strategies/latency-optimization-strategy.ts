/**
 * Latency Optimization Strategy
 *
 * Scores candidates based on historical latency
 */

import type {
  MediaRoutingStrategy,
  MediaRoutingCandidate,
  MediaRoutingContext,
} from '../../types';

/**
 * Latency optimization strategy - prioritizes faster providers
 */
export class LatencyOptimizationStrategy implements MediaRoutingStrategy {
  readonly name = 'latency-optimization';
  readonly priority = 40;

  // Simulated latency data (in production, this would come from metrics)
  private latencyHistory: Map<string, number[]> = new Map();

  filter(
    candidates: MediaRoutingCandidate[],
    _context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // No filtering, just scoring
    return candidates;
  }

  score(
    candidates: MediaRoutingCandidate[],
    context: MediaRoutingContext
  ): MediaRoutingCandidate[] {
    // Only apply if user prefers speed optimization
    if (context.preference?.optimize !== 'speed') {
      return candidates.map((c) => ({
        ...c,
        scoreBreakdown: {
          ...c.scoreBreakdown,
          [this.name]: 0,
        },
      }));
    }

    // Get average latencies
    const latencies = candidates.map((c) => {
      const history = this.latencyHistory.get(c.provider.id);
      if (history && history.length > 0) {
        return history.reduce((a, b) => a + b, 0) / history.length;
      }
      // Default latency estimate based on provider type
      return this.estimateLatency(c.provider.type);
    });

    const maxLatency = Math.max(...latencies, 1); // Avoid division by zero

    return candidates.map((c, index) => {
      // Inverse latency scoring: lower latency = higher score
      // Score range: 0-40 points
      const latencyRatio = latencies[index] / maxLatency;
      const latencyScore = (1 - latencyRatio) * 40;

      return {
        ...c,
        score: c.score + latencyScore,
        scoreBreakdown: {
          ...c.scoreBreakdown,
          [this.name]: latencyScore,
        },
      };
    });
  }

  /**
   * Record latency for a provider
   */
  recordLatency(providerId: string, latencyMs: number): void {
    let history = this.latencyHistory.get(providerId);
    if (!history) {
      history = [];
      this.latencyHistory.set(providerId, history);
    }

    // Keep last 100 measurements
    history.push(latencyMs);
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Estimate latency based on provider type
   */
  private estimateLatency(providerType: string): number {
    // Estimated average generation times in ms
    const estimates: Record<string, number> = {
      openai: 30000, // OpenAI Sora: ~30s
      runway: 60000, // Runway: ~60s
      luma: 45000, // Luma: ~45s
      minimax: 90000, // MiniMax: ~90s
      liblib: 120000, // LiblibAI: ~120s
      suno: 30000, // Suno: ~30s
    };

    return estimates[providerType] || 60000;
  }

  /**
   * Clear latency history
   */
  clearHistory(): void {
    this.latencyHistory.clear();
  }
}
