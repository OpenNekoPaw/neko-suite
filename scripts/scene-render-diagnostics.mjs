#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const inputPath = process.argv[2];

if (!inputPath) {
  printUsage();
  process.exit(1);
}

const events = parseEvents(readFileSync(inputPath, 'utf8'));
const report = buildDiagnostics(events);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function printUsage() {
  process.stderr.write(
    'Usage: node scripts/scene-render-diagnostics.mjs <events.json|events.jsonl>\n',
  );
}

function parseEvents(content) {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('Diagnostics JSON input must be an array');
    }
    return parsed;
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function buildDiagnostics(events) {
  const ackLatencies = [];
  const gpuFrameTimes = [];
  const gpuUploadTimes = [];
  const encodeTimes = [];
  const qualityTiers = new Map();
  let droppedFrames = 0;
  let frameCount = 0;

  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }

    const ackLatencyMs = numberFrom(event.ackLatencyMs ?? event.ack_latency_ms);
    if (ackLatencyMs !== undefined) {
      ackLatencies.push(ackLatencyMs);
    }

    const meta = isRecord(event.meta) ? event.meta : event;
    const diagnostics = isRecord(meta.diagnostics) ? meta.diagnostics : meta;
    const gpuMs = numberFrom(diagnostics.gpuFrameTimeMs ?? diagnostics.gpu_frame_time_ms);
    const gpuUploadMs = numberFrom(
      diagnostics.gpuUploadTimeMs ?? diagnostics.gpu_upload_time_ms,
    );
    const encodeMs = numberFrom(diagnostics.encodeTimeMs ?? diagnostics.encode_time_ms);
    const dropped = numberFrom(
      diagnostics.droppedFramesSinceLast ?? diagnostics.dropped_frames_since_last,
    );
    const qualityTier = stringFrom(diagnostics.qualityTier ?? diagnostics.quality_tier);

    if (numberFrom(meta.frameId ?? meta.frame_id) !== undefined) {
      frameCount += 1;
    }
    if (gpuMs !== undefined) {
      gpuFrameTimes.push(gpuMs);
    }
    if (gpuUploadMs !== undefined) {
      gpuUploadTimes.push(gpuUploadMs);
    }
    if (encodeMs !== undefined) {
      encodeTimes.push(encodeMs);
    }
    if (dropped !== undefined) {
      droppedFrames += dropped;
    }
    if (qualityTier) {
      qualityTiers.set(qualityTier, (qualityTiers.get(qualityTier) ?? 0) + 1);
    }
  }

  return {
    samples: {
      events: events.length,
      frames: frameCount,
      ackLatency: ackLatencies.length,
      gpuFrameTime: gpuFrameTimes.length,
      gpuUploadTime: gpuUploadTimes.length,
      encodeTime: encodeTimes.length,
    },
    ackLatencyMs: percentiles(ackLatencies),
    gpuFrameTimeMs: percentiles(gpuFrameTimes),
    gpuUploadTimeMs: percentiles(gpuUploadTimes),
    encodeTimeMs: percentiles(encodeTimes),
    droppedFrames,
    qualityTiers: Object.fromEntries([...qualityTiers.entries()].sort()),
  };
}

function percentiles(values) {
  if (values.length === 0) {
    return { p50: null, p95: null, p99: null, max: null };
  }

  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1] ?? null,
  };
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index] ?? null;
}

function numberFrom(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringFrom(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
