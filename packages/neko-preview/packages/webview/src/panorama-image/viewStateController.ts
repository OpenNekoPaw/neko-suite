import type { PanoramaViewMode, PanoramaViewState } from '@neko/shared';
import { DEFAULT_PANORAMA_VIEW_STATE } from '@neko/shared';

const MIN_FOV_DEG = 35;
const MAX_FOV_DEG = 120;
const MIN_PITCH_DEG = -89;
const MAX_PITCH_DEG = 89;

export class ViewStateController {
  private _state: PanoramaViewState;

  constructor(initial?: Partial<PanoramaViewState>) {
    this._state = normalizeState({ ...DEFAULT_PANORAMA_VIEW_STATE, ...initial });
  }

  get state(): PanoramaViewState {
    return this._state;
  }

  setMode(mode: PanoramaViewMode): PanoramaViewState {
    this._state = { ...this._state, mode };
    return this._state;
  }

  applyDrag(deltaX: number, deltaY: number): PanoramaViewState {
    this._state = normalizeState({
      ...this._state,
      yawDeg: this._state.yawDeg - deltaX * 0.18,
      pitchDeg: this._state.pitchDeg + deltaY * 0.18,
    });
    return this._state;
  }

  applyWheel(deltaY: number): PanoramaViewState {
    this._state = normalizeState({
      ...this._state,
      fovDeg: this._state.fovDeg + deltaY * 0.04,
    });
    return this._state;
  }

  setExposure(exposure: number): PanoramaViewState {
    this._state = normalizeState({ ...this._state, exposure });
    return this._state;
  }

  reset(next?: Partial<PanoramaViewState>): PanoramaViewState {
    this._state = normalizeState({ ...DEFAULT_PANORAMA_VIEW_STATE, ...next });
    return this._state;
  }
}

function normalizeState(state: PanoramaViewState): PanoramaViewState {
  return {
    ...state,
    yawDeg: wrapDegrees(state.yawDeg),
    pitchDeg: clamp(state.pitchDeg, MIN_PITCH_DEG, MAX_PITCH_DEG),
    rollDeg: wrapDegrees(state.rollDeg),
    fovDeg: clamp(state.fovDeg, MIN_FOV_DEG, MAX_FOV_DEG),
    exposure: clamp(state.exposure, -6, 6),
  };
}

function wrapDegrees(value: number): number {
  const wrapped = ((value + 180) % 360) - 180;
  return wrapped < -180 ? wrapped + 360 : wrapped;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
