import type { PanoramaCoverageAngle, PanoramaViewMode, PanoramaViewState } from '@neko/shared';
import { DEFAULT_PANORAMA_COVERAGE_ANGLE, DEFAULT_PANORAMA_VIEW_STATE } from '@neko/shared';

const MIN_FOV_DEG = 35;
const MAX_FOV_DEG = 120;
const MIN_PITCH_DEG = -89;
const MAX_PITCH_DEG = 89;

export class ViewStateController {
  private _state: PanoramaViewState;
  private _coverage: PanoramaCoverageAngle;
  private _viewportAspect: number;

  constructor(
    initial?: Partial<PanoramaViewState>,
    coverage: PanoramaCoverageAngle = DEFAULT_PANORAMA_COVERAGE_ANGLE,
    viewportAspect = 1,
  ) {
    this._coverage = coverage;
    this._viewportAspect = normalizeAspect(viewportAspect);
    this._state = normalizeState(
      { ...DEFAULT_PANORAMA_VIEW_STATE, ...initial },
      this._coverage,
      this._viewportAspect,
    );
  }

  get state(): PanoramaViewState {
    return this._state;
  }

  setMode(mode: PanoramaViewMode): PanoramaViewState {
    this._state = normalizeState({ ...this._state, mode }, this._coverage, this._viewportAspect);
    return this._state;
  }

  setCoverage(coverage: PanoramaCoverageAngle): PanoramaViewState {
    this._coverage = coverage;
    this._state = normalizeState(this._state, this._coverage, this._viewportAspect);
    return this._state;
  }

  setViewportAspect(aspect: number): PanoramaViewState {
    this._viewportAspect = normalizeAspect(aspect);
    this._state = normalizeState(this._state, this._coverage, this._viewportAspect);
    return this._state;
  }

  applyDrag(deltaX: number, deltaY: number): PanoramaViewState {
    this._state = normalizeState(
      {
        ...this._state,
        yawDeg: this._state.yawDeg - deltaX * 0.18,
        pitchDeg: this._state.pitchDeg + deltaY * 0.18,
      },
      this._coverage,
      this._viewportAspect,
    );
    return this._state;
  }

  applyWheel(deltaY: number): PanoramaViewState {
    this._state = normalizeState(
      {
        ...this._state,
        fovDeg: this._state.fovDeg + deltaY * 0.04,
      },
      this._coverage,
      this._viewportAspect,
    );
    return this._state;
  }

  setExposure(exposure: number): PanoramaViewState {
    this._state = normalizeState(
      { ...this._state, exposure },
      this._coverage,
      this._viewportAspect,
    );
    return this._state;
  }

  reset(next?: Partial<PanoramaViewState>): PanoramaViewState {
    this._state = normalizeState(
      { ...DEFAULT_PANORAMA_VIEW_STATE, ...next },
      this._coverage,
      this._viewportAspect,
    );
    return this._state;
  }
}

function normalizeState(
  state: PanoramaViewState,
  coverage: PanoramaCoverageAngle,
  viewportAspect: number,
): PanoramaViewState {
  const fovDeg = clamp(state.fovDeg, MIN_FOV_DEG, MAX_FOV_DEG);
  const horizontalFovDeg = radiansToDegrees(
    2 * Math.atan(Math.max(1, viewportAspect) * Math.tan(degreesToRadians(fovDeg) / 2)),
  );
  return {
    ...state,
    yawDeg:
      coverage.horizontalDeg >= 360
        ? wrapDegrees(state.yawDeg)
        : clamp(
            state.yawDeg,
            -Math.max(0, coverage.horizontalDeg / 2 - horizontalFovDeg / 2),
            Math.max(0, coverage.horizontalDeg / 2 - horizontalFovDeg / 2),
          ),
    pitchDeg:
      coverage.verticalDeg >= 180
        ? clamp(state.pitchDeg, MIN_PITCH_DEG, MAX_PITCH_DEG)
        : clamp(
            state.pitchDeg,
            -Math.max(0, coverage.verticalDeg / 2 - fovDeg / 2),
            Math.max(0, coverage.verticalDeg / 2 - fovDeg / 2),
          ),
    rollDeg: wrapDegrees(state.rollDeg),
    fovDeg,
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

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeAspect(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
