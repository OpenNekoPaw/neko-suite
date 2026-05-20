import React, { useState, useCallback, useRef } from 'react';
import { PHONEME_ROTATIONS, type Phoneme } from '../../types/boneExpression';
import { useTranslation } from '../../i18n/I18nContext';

const PHONEMES: Phoneme[] = ['A', 'I', 'U', 'E', 'O', 'silent'];

interface BoneExpressionPanelProps {
  characterId: string | null;
  disabled?: boolean;
  onSetBonePose: (boneId: string, rotation: [number, number, number, number]) => void;
}

/**
 * Bone Expression Panel - Lip sync, eye tracking, and eyebrow control.
 *
 * Sections:
 * - Lip Sync: 6 phoneme buttons (A/I/U/E/O/Silent)
 * - Eye Tracking: 128x128 trackpad for eye rotation
 * - Eyebrow: 3 sliders (raise/lower/furrow)
 */
export function BoneExpressionPanel({
  characterId,
  disabled = false,
  onSetBonePose,
}: BoneExpressionPanelProps): React.JSX.Element {
  const [activePhoneme, setActivePhoneme] = useState<Phoneme>('silent');
  const [eyebrowRaise, setEyebrowRaise] = useState(0);
  const [eyebrowLower, setEyebrowLower] = useState(0);
  const [eyebrowFurrow, setEyebrowFurrow] = useState(0);
  const [manualBoneId, setManualBoneId] = useState('hips');
  const [manualRotation, setManualRotation] = useState<[number, number, number, number]>([
    0, 0, 0, 1,
  ]);
  const eyeTrackRef = useRef<HTMLDivElement>(null);

  const controlsDisabled = disabled || !characterId;
  const { t } = useTranslation();

  const handlePhonemeClick = useCallback(
    (phoneme: Phoneme) => {
      if (controlsDisabled) return;
      setActivePhoneme(phoneme);
      const rot = PHONEME_ROTATIONS[phoneme];
      onSetBonePose('jaw', rot.jaw);
    },
    [controlsDisabled, onSetBonePose],
  );

  const handleEyeTrack = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = eyeTrackRef.current?.getBoundingClientRect();
      if (!rect || controlsDisabled) return;

      // Normalize to [-1, 1]
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      // Convert to small rotation quaternion (max ~15 deg)
      const maxAngle = 0.13; // ~15 deg in radians / 2
      const qx = -y * maxAngle;
      const qy = x * maxAngle;
      const qw = Math.sqrt(1 - qx * qx - qy * qy);

      const rotation: [number, number, number, number] = [qx, qy, 0, qw];
      onSetBonePose('leftEye', rotation);
      onSetBonePose('rightEye', rotation);
    },
    [controlsDisabled, onSetBonePose],
  );

  const handleEyebrowChange = useCallback(
    (param: 'raise' | 'lower' | 'furrow', value: number) => {
      if (controlsDisabled) return;
      switch (param) {
        case 'raise':
          setEyebrowRaise(value);
          break;
        case 'lower':
          setEyebrowLower(value);
          break;
        case 'furrow':
          setEyebrowFurrow(value);
          break;
      }

      // Map slider value to small rotation
      const angle = value * 0.1; // max ~6 deg
      const rotation: [number, number, number, number] = [
        angle,
        0,
        0,
        Math.sqrt(1 - angle * angle),
      ];

      if (param === 'raise' || param === 'lower') {
        onSetBonePose('leftEyebrow', rotation);
        onSetBonePose('rightEyebrow', rotation);
      } else {
        // Furrow: opposing rotations for left/right
        onSetBonePose('leftEyebrow', [angle, 0, angle * 0.5, Math.sqrt(1 - angle * angle)]);
        onSetBonePose('rightEyebrow', [angle, 0, -angle * 0.5, Math.sqrt(1 - angle * angle)]);
      }
    },
    [controlsDisabled, onSetBonePose],
  );

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('bone.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.lipSync')}</div>
          <div className="grid grid-cols-3 gap-1">
            {PHONEMES.map((p) => (
              <button
                key={p}
                onClick={() => handlePhonemeClick(p)}
                disabled={controlsDisabled}
                className={`${activePhoneme === p ? 'model-btn-primary' : 'model-btn-secondary'} px-2 py-1.5 text-xs ${
                  activePhoneme === p ? '' : ''
                }`}
              >
                {p === 'silent' ? '\u2014' : p}
              </button>
            ))}
          </div>
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.eyeTracking')}</div>
          <div
            ref={eyeTrackRef}
            onMouseMove={handleEyeTrack}
            className={`relative mx-auto h-32 w-32 rounded-lg border border-[var(--model-input-border)] bg-[var(--model-input-bg)] ${
              controlsDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
            }`}
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-px w-full bg-[var(--model-fg-muted)] opacity-60" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-[var(--model-fg-muted)] opacity-60" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] text-[var(--model-fg-secondary)] opacity-70">
                {t('bone.moveMouse')}
              </span>
            </div>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="model-section-title mb-2">{t('bone.eyebrow')}</div>
          <EyebrowSlider
            label={t('bone.raise')}
            value={eyebrowRaise}
            onChange={(v) => handleEyebrowChange('raise', v)}
            disabled={controlsDisabled}
          />
          <EyebrowSlider
            label={t('bone.lower')}
            value={eyebrowLower}
            onChange={(v) => handleEyebrowChange('lower', v)}
            disabled={controlsDisabled}
          />
          <EyebrowSlider
            label={t('bone.furrow')}
            value={eyebrowFurrow}
            onChange={(v) => handleEyebrowChange('furrow', v)}
            disabled={controlsDisabled}
          />
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('bone.poseEdit')}</div>
          <label className="mb-2 block text-[10px] text-[var(--model-fg-secondary)]">
            {t('bone.boneId')}
            <input
              className="model-input mt-1 w-full px-2 py-1 text-xs"
              value={manualBoneId}
              disabled={controlsDisabled}
              onChange={(event) => setManualBoneId(event.currentTarget.value)}
            />
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(['x', 'y', 'z', 'w'] as const).map((axis, index) => (
              <QuaternionField
                key={axis}
                label={axis.toUpperCase()}
                value={manualRotation[index] ?? 0}
                disabled={controlsDisabled}
                onChange={(value) =>
                  setManualRotation((rotation) => {
                    const next: [number, number, number, number] = [...rotation];
                    next[index] = value;
                    return next;
                  })
                }
              />
            ))}
          </div>
          <button
            className="model-btn-primary mt-2 w-full px-2 py-1 text-xs"
            disabled={controlsDisabled || manualBoneId.trim().length === 0}
            onClick={() => onSetBonePose(manualBoneId.trim(), normalizeQuaternion(manualRotation))}
          >
            {t('bone.applyPose')}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuaternionField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <label className="text-[10px] text-[var(--model-fg-secondary)]">
      {label}
      <input
        type="number"
        step={0.001}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number.parseFloat(event.currentTarget.value) || 0)}
        className="model-input mt-1 w-full px-1 py-0.5 text-center text-[10px]"
      />
    </label>
  );
}

function normalizeQuaternion(
  rotation: [number, number, number, number],
): [number, number, number, number] {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]);
  if (!Number.isFinite(length) || length <= 0.000001) {
    return [0, 0, 0, 1];
  }
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
}

function EyebrowSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-10 shrink-0 text-[10px] text-[var(--model-fg-secondary)]">{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="model-range flex-1"
      />
      <span className="w-8 text-right text-[10px] text-[var(--model-fg-secondary)]">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
