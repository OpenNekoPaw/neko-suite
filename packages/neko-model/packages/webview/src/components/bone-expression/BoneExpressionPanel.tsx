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
    <div className="w-64 h-full bg-[var(--vscode-sideBar-background)] border-l border-[var(--vscode-panel-border)] flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">Bone Expression</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Lip Sync Section */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">Lip Sync</div>
          <div className="grid grid-cols-3 gap-1">
            {PHONEMES.map((p) => (
              <button
                key={p}
                onClick={() => handlePhonemeClick(p)}
                className={`px-2 py-1.5 text-xs rounded transition-colors ${
                  activePhoneme === p
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                    : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
                }`}
              >
                {p === 'silent' ? '\u2014' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Eye Tracking Section */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">
            Eye Tracking
          </div>
          <div
            ref={eyeTrackRef}
            onMouseMove={handleEyeTrack}
            className="w-32 h-32 mx-auto rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] cursor-crosshair relative"
          >
            {/* Crosshair guides */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-px bg-[var(--vscode-panel-border)] opacity-30" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-[var(--vscode-panel-border)] opacity-30" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-50">
                Move mouse
              </span>
            </div>
          </div>
        </div>

        {/* Eyebrow Section */}
        <div className="px-3 py-2">
          <div className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">Eyebrow</div>
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
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-10 shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-[var(--vscode-button-background)]"
      />
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-8 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
