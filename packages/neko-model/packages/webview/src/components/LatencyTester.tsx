import React, { useState, useCallback } from 'react';
import { postMessage } from '@neko/shared/vscode';

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
  samples: number[];
}

/**
 * Latency Tester - Measures round-trip time (RTT) to Rust engine.
 *
 * Sends latency_test messages and calculates statistics:
 * - Min/Max/Average RTT
 * - P95 percentile
 * - Real-time graph
 */
export function LatencyTester(): React.JSX.Element {
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState<LatencyStats | null>(null);
  const [currentRtt, setCurrentRtt] = useState<number | null>(null);

  const calculateStats = useCallback((samples: number[]): LatencyStats => {
    if (samples.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0, samples: [] };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = samples.reduce((acc, val) => acc + val, 0);
    const p95Index = Math.floor(samples.length * 0.95);

    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: sum / samples.length,
      p95: sorted[p95Index] ?? 0,
      samples,
    };
  }, []);

  const runTest = useCallback(async () => {
    setIsRunning(true);
    const samples: number[] = [];
    const testCount = 100;

    for (let i = 0; i < testCount; i++) {
      const startTime = performance.now();

      // Send message to extension
      postMessage({
        type: 'latency:test',
        timestamp: startTime,
      });

      // Wait for response
      await new Promise<void>((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.data.type === 'latency:response') {
            const rtt = performance.now() - startTime;
            samples.push(rtt);
            setCurrentRtt(rtt);
            window.removeEventListener('message', handler);
            resolve();
          }
        };
        window.addEventListener('message', handler);

        // Timeout after 1 second
        setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve();
        }, 1000);
      });

      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    setStats(calculateStats(samples));
    setIsRunning(false);
  }, [calculateStats]);

  return (
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">延迟测试</h2>
      </div>

      {/* Test Button */}
      <div className="px-3 py-3 border-b border-[var(--vscode-panel-border)]">
        <button
          onClick={runTest}
          disabled={isRunning}
          className="w-full px-3 py-2 text-sm bg-[var(--vscode-button-background)]
                     text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)]
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? '测试中...' : '开始测试 (100 次)'}
        </button>
      </div>

      {/* Current RTT */}
      {currentRtt !== null && (
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">当前 RTT</div>
          <div className="text-2xl font-mono text-[var(--vscode-foreground)]">
            {currentRtt.toFixed(2)} ms
          </div>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <div>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-1">最小值</div>
            <div className="text-lg font-mono text-[var(--vscode-foreground)]">
              {stats.min.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-1">最大值</div>
            <div className="text-lg font-mono text-[var(--vscode-foreground)]">
              {stats.max.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-1">平均值</div>
            <div className="text-lg font-mono text-[var(--vscode-foreground)]">
              {stats.avg.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-1">P95</div>
            <div className="text-lg font-mono text-[var(--vscode-foreground)]">
              {stats.p95.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-1">样本数</div>
            <div className="text-lg font-mono text-[var(--vscode-foreground)]">
              {stats.samples.length}
            </div>
          </div>

          {/* Recommendation */}
          <div className="mt-4 p-2 rounded bg-[var(--vscode-textBlockQuote-background)] border-l-2 border-[var(--vscode-textBlockQuote-border)]">
            <div className="text-xs text-[var(--vscode-foreground)]">
              {stats.avg < 15 && '✅ 延迟优秀，H.264 流方案足够'}
              {stats.avg >= 15 && stats.avg < 30 && '⚠️ 延迟中等，考虑 JPEG 单帧模式'}
              {stats.avg >= 30 && '❌ 延迟较高，建议 R3F 双渲染'}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] text-xs text-[var(--vscode-descriptionForeground)]">
        测量 Webview ↔ Rust 引擎往返时间
      </div>
    </div>
  );
}
