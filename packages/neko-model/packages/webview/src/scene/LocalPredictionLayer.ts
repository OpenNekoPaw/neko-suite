export type LocalPredictionKind =
  | 'transform'
  | 'camera'
  | 'morph'
  | 'ik'
  | 'brush'
  | 'selection'
  | 'snap'
  | 'topology';

export type LocalPredictionStatus =
  | 'active'
  | 'committed'
  | 'rolled-back'
  | 'timed-out'
  | 'invalidated';

export interface LocalPredictionInput {
  id?: string;
  kind: LocalPredictionKind;
  seq: number;
  viewportId: string;
  sceneRevision: number;
  characterId?: string;
  nodeId?: string;
  sessionId?: string;
  topologyVersion?: number;
  payload: Record<string, unknown>;
  nowMs?: number;
  timeoutMs?: number;
}

export interface LocalPredictionSnapshot extends Omit<LocalPredictionInput, 'nowMs' | 'timeoutMs'> {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  timeoutAtMs: number;
  status: LocalPredictionStatus;
}

const DEFAULT_TIMEOUT_MS = 2_000;

export class LocalPredictionLayer {
  private readonly predictions = new Map<string, LocalPredictionSnapshot>();

  create(input: LocalPredictionInput): LocalPredictionSnapshot {
    const nowMs = input.nowMs ?? Date.now();
    const id = input.id ?? predictionId(input);
    const prediction: LocalPredictionSnapshot = {
      id,
      kind: input.kind,
      seq: input.seq,
      viewportId: input.viewportId,
      sceneRevision: input.sceneRevision,
      characterId: input.characterId,
      nodeId: input.nodeId,
      sessionId: input.sessionId,
      topologyVersion: input.topologyVersion,
      payload: input.payload,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      timeoutAtMs: nowMs + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      status: 'active',
    };
    this.predictions.set(id, prediction);
    return prediction;
  }

  update(
    id: string,
    payload: Record<string, unknown>,
    nowMs = Date.now(),
  ): LocalPredictionSnapshot | null {
    const prediction = this.predictions.get(id);
    if (!prediction || prediction.status !== 'active') return null;
    const next = {
      ...prediction,
      payload: { ...prediction.payload, ...payload },
      updatedAtMs: nowMs,
    };
    this.predictions.set(id, next);
    return next;
  }

  commitThrough(appliedSeq: number): LocalPredictionSnapshot[] {
    return this.transition((prediction) => prediction.seq <= appliedSeq, 'committed');
  }

  rollback(idOrSeq: string | number): LocalPredictionSnapshot[] {
    return this.transition(
      (prediction) => prediction.id === idOrSeq || prediction.seq === idOrSeq,
      'rolled-back',
    );
  }

  timeout(nowMs = Date.now()): LocalPredictionSnapshot[] {
    return this.transition((prediction) => prediction.timeoutAtMs <= nowMs, 'timed-out');
  }

  invalidate(filter: {
    viewportId?: string;
    sessionId?: string;
    topologyVersion?: number;
    nodeId?: string;
    characterId?: string;
  }): LocalPredictionSnapshot[] {
    return this.transition((prediction) => {
      if (filter.viewportId && prediction.viewportId !== filter.viewportId) return false;
      if (filter.sessionId && prediction.sessionId !== filter.sessionId) return false;
      if (filter.nodeId && prediction.nodeId !== filter.nodeId) return false;
      if (filter.characterId && prediction.characterId !== filter.characterId) return false;
      if (
        filter.topologyVersion !== undefined &&
        prediction.topologyVersion !== undefined &&
        prediction.topologyVersion !== filter.topologyVersion
      ) {
        return true;
      }
      return filter.topologyVersion === undefined;
    }, 'invalidated');
  }

  active(): LocalPredictionSnapshot[] {
    return Array.from(this.predictions.values()).filter(
      (prediction) => prediction.status === 'active',
    );
  }

  clearFinalized(): void {
    for (const [id, prediction] of this.predictions) {
      if (prediction.status !== 'active') {
        this.predictions.delete(id);
      }
    }
  }

  private transition(
    predicate: (prediction: LocalPredictionSnapshot) => boolean,
    status: Exclude<LocalPredictionStatus, 'active'>,
  ): LocalPredictionSnapshot[] {
    const changed: LocalPredictionSnapshot[] = [];
    for (const [id, prediction] of this.predictions) {
      if (prediction.status !== 'active' || !predicate(prediction)) continue;
      const next = { ...prediction, status, updatedAtMs: Date.now() };
      this.predictions.set(id, next);
      changed.push(next);
    }
    return changed;
  }
}

export function predictionId(
  input: Pick<LocalPredictionInput, 'kind' | 'seq' | 'viewportId'>,
): string {
  return `${input.viewportId}:${input.kind}:${input.seq}`;
}
