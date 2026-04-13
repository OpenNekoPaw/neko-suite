import React, { useState, useCallback, useRef } from 'react';
import { PHONEME_ROTATIONS, type Phoneme } from '../../types/boneExpression';
import { postMessage } from '@neko/shared/vscode';

const PHONEMES: Phoneme[] = ['A', 'I', 'U', 'E', 'O', 'silent'];

/**
 * Bone Expression Panel - Lip sync, eye tracking, and eyebrow control.
 *
 * Sections:
 * - Lip Sync: 6 phoneme buttons (A/I/U/E/O/Silent)
 * - Eye Tracking: 128x128 trackpad for eye rotation
 * - Eyebrow: 3 sliders (raise/lower/furrow)
 */
export function BoneExpressionPanel(): React.JSX.Element {
  const [activePhoneme, setActivePhoneme] = useState<Phoneme>('silent');
  const [eyebrowRaise, setEyebrowRaise] = useState(0);
  const [eyebrowLower, setEyebrowLower] = useState(0);
  const [eyebrowFurrow, setEyebrowFurrow] = useState(0);
  const eyeTrackRef = useRef<HTMLDivElement>(null);

  const sendBoneTransform = useCallback(
    (nodeId: string, rotation: [number, number, number, number]) => {
      postMessage({
        type: 'updateBoneTransform',
        nodeId,
        rotation,
      });
    },
    [],
  );

  const handlePhonemeClick = useCallback(
    (phoneme: Phoneme) => {
      setActivePhoneme(phoneme);
      const rot = PHONEME_ROTATIONS[phoneme];
      sendBoneTransform('jaw', rot.jaw);
    },
    [sendBoneTransform],
  );

  const handleEyeTrack = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = eyeTrackRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Normalize to [-1, 1]
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      // Convert to small rotation quaternion (max ~15 deg)
      const maxAngle = 0.13; // ~15 deg in radians / 2
      const qx = -y * maxAngle;
      const qy = x * maxAngle;
      const qw = Math.sqrt(1 - qx * qx - qy * qy);

      const rotation: [number, number, number, number] = [qx, qy, 0, qw];
      sendBoneTransform('leftEye', rotation);
      sendBoneTransform('rightEye', rotation);
    },
    [sendBoneTransform],
  );

  const handleEyebrowChange = useCallback(
    (param: 'raise' | 'lower' | 'furrow', value: number) => {
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
        sendBoneTransform('leftEyebrow', rotation);
        sendBoneTransform('rightEyebrow', rotation);
      } else {
        // Furrow: opposing rotations for left/right
        sendBoneTransform('leftEyebrow', [angle, 0, angle * 0.5, Math.sqrt(1 - angle * angle)]);
        sendBoneTransform('rightEyebrow', [angle, 0, -angle * 0.5, Math.sqrt(1 - angle * angle)]);
      }
    },
    [sendBoneTransform],
  );

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">Bone Expression</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-2">Lip Sync</div>
          <div className="grid grid-cols-3 gap-1">
            {PHONEMES.map((p) => (
              <button
                key={p}
                onClick={() => handlePhonemeClick(p)}
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
          <div className="model-section-title mb-2">Eye Tracking</div>
          <div
            ref={eyeTrackRef}
            onMouseMove={handleEyeTrack}
            className="relative mx-auto h-32 w-32 cursor-crosshair rounded-lg border border-[var(--model-input-border)] bg-[var(--model-input-bg)]"
          >
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-px w-full bg-[var(--model-fg-muted)] opacity-60" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-[var(--model-fg-muted)] opacity-60" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] text-[var(--model-fg-secondary)] opacity-70">
                Move mouse
              </span>
            </div>
          </div>
        </div>

        <div className="px-3 py-2">
          <div className="model-section-title mb-2">Eyebrow</div>
          <EyebrowSlider
            label="Raise"
            value={eyebrowRaise}
            onChange={(v) => handleEyebrowChange('raise', v)}
          />
          <EyebrowSlider
            label="Lower"
            value={eyebrowLower}
            onChange={(v) => handleEyebrowChange('lower', v)}
          />
          <EyebrowSlider
            label="Furrow"
            value={eyebrowFurrow}
            onChange={(v) => handleEyebrowChange('furrow', v)}
          />
        </div>
      </div>
    </div>
  );
}

function EyebrowSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
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
        className="model-range flex-1"
      />
      <span className="w-8 text-right text-[10px] text-[var(--model-fg-secondary)]">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
