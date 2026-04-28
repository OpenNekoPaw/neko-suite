import type { VertexBrushPatch } from '@neko/shared';
import type { VertexBrushPatchClient } from '@neko/neko-client';
import type { LocalPredictionInput } from './LocalPredictionLayer';

export interface SculptBrushSettings {
  radius: number;
  strength: number;
  falloff: number;
}

export interface SculptBrushSample {
  x: number;
  y: number;
  pressure: number;
}

export interface SculptBrushSessionConfig {
  viewportId: string;
  sceneRevision: number;
  sessionId: string;
  meshId: string;
  characterId?: string;
  topologyVersion: number;
  nextSeq: () => number;
  settings: SculptBrushSettings;
  client: Pick<VertexBrushPatchClient, 'sendPatch'>;
  createPrediction: (prediction: LocalPredictionInput) => void;
  recordPatchBytes: (bytes: number) => void;
}

export interface SculptBrushStrokeFlush {
  seq: number;
  strokeId: string;
  payloadBytes: number;
  sampleCount: number;
}

export class SculptBrushStrokeController {
  private activeStrokeId: string | null = null;
  private readonly samples: SculptBrushSample[] = [];

  constructor(private readonly config: SculptBrushSessionConfig) {}

  beginStroke(strokeId = `stroke-${Date.now()}`): void {
    this.activeStrokeId = strokeId;
    this.samples.length = 0;
  }

  addSample(sample: SculptBrushSample): void {
    if (!this.activeStrokeId) {
      this.beginStroke();
    }
    this.samples.push({
      x: clamp01(sample.x),
      y: clamp01(sample.y),
      pressure: clamp01(sample.pressure),
    });
  }

  flush(): SculptBrushStrokeFlush | null {
    if (!this.activeStrokeId || this.samples.length === 0) return null;
    const seq = this.config.nextSeq();
    const payload = encodeBrushSamples(this.samples, this.config.settings);
    const patch: VertexBrushPatch = {
      sessionId: this.config.sessionId,
      meshId: this.config.meshId,
      topologyVersion: this.config.topologyVersion,
      strokeId: this.activeStrokeId,
      seq,
      encoding: 'f32-delta',
      sparseIndices: this.samples.map((_sample, index) => index),
      affectedStart: 0,
      affectedCount: this.samples.length,
      payload,
    };

    this.config.client.sendPatch(patch);
    this.config.createPrediction({
      kind: 'brush',
      seq,
      viewportId: this.config.viewportId,
      sceneRevision: this.config.sceneRevision,
      characterId: this.config.characterId,
      nodeId: this.config.meshId,
      sessionId: this.config.sessionId,
      topologyVersion: this.config.topologyVersion,
      payload: {
        strokeId: this.activeStrokeId,
        radius: this.config.settings.radius,
        strength: this.config.settings.strength,
        sampleCount: this.samples.length,
      },
    });
    this.config.recordPatchBytes(payload.byteLength);

    const result = {
      seq,
      strokeId: this.activeStrokeId,
      payloadBytes: payload.byteLength,
      sampleCount: this.samples.length,
    };
    this.samples.length = 0;
    return result;
  }

  endStroke(): SculptBrushStrokeFlush | null {
    const result = this.flush();
    this.activeStrokeId = null;
    return result;
  }
}

export function modelingWebSocketUrl(enginePort: number, sessionId: string): string {
  return `ws://127.0.0.1:${enginePort}/v1/scenes/modeling/${encodeURIComponent(sessionId)}`;
}

export function encodeBrushSamples(
  samples: readonly SculptBrushSample[],
  settings: SculptBrushSettings,
): Uint8Array {
  const floatsPerSample = 6;
  const values = new Float32Array(samples.length * floatsPerSample);
  samples.forEach((sample, index) => {
    const offset = index * floatsPerSample;
    values[offset] = clamp01(sample.x);
    values[offset + 1] = clamp01(sample.y);
    values[offset + 2] = clamp01(sample.pressure);
    values[offset + 3] = settings.radius;
    values[offset + 4] = settings.strength;
    values[offset + 5] = settings.falloff;
  });
  return new Uint8Array(values.buffer);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
