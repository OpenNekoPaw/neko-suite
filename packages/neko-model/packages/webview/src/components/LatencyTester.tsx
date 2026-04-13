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
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">延迟测试</h2>
      </div>

      <div className="model-panel-section">
        <button onClick={runTest} disabled={isRunning} className="model-btn-primary w-full text-sm">
          {isRunning ? '测试中...' : '开始测试 (100 次)'}
        </button>
      </div>

      {currentRtt !== null && (
        <div className="model-panel-section">
          <div className="text-xs text-[var(--model-fg-secondary)]">当前 RTT</div>
          <div className="text-2xl font-mono text-[var(--model-fg)]">
            {currentRtt.toFixed(2)} ms
          </div>
        </div>
      )}

      {stats && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <div>
            <div className="mb-1 text-xs text-[var(--model-fg-secondary)]">最小值</div>
            <div className="text-lg font-mono text-[var(--model-fg)]">
              {stats.min.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--model-fg-secondary)]">最大值</div>
            <div className="text-lg font-mono text-[var(--model-fg)]">
              {stats.max.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--model-fg-secondary)]">平均值</div>
            <div className="text-lg font-mono text-[var(--model-fg)]">
              {stats.avg.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--model-fg-secondary)]">P95</div>
            <div className="text-lg font-mono text-[var(--model-fg)]">
              {stats.p95.toFixed(2)} ms
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--model-fg-secondary)]">样本数</div>
            <div className="text-lg font-mono text-[var(--model-fg)]">{stats.samples.length}</div>
          </div>

          <div className="model-quote mt-4 p-2">
            <div className="text-xs text-[var(--model-fg)]">
              {stats.avg < 15 && '✅ 延迟优秀，H.264 流方案足够'}
              {stats.avg >= 15 && stats.avg < 30 && '⚠️ 延迟中等，考虑 JPEG 单帧模式'}
              {stats.avg >= 30 && '❌ 延迟较高，建议 R3F 双渲染'}
            </div>
          </div>
        </div>
      )}

      <div className="model-panel-footer text-xs">测量 Webview ↔ Rust 引擎往返时间</div>
    </div>
  );
}
