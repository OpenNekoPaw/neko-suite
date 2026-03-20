/**
 * MacSlider - macOS-style slider component
 *
 * Features:
 * - Glass morphism track
 * - Smooth thumb animation
 * - Hover effects
 */

import { type InputHTMLAttributes } from 'react';

interface MacSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

export function MacSlider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  className = '',
  ...props
}: MacSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`relative w-full ${className}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mac-slider"
        style={{
          background: `linear-gradient(to right, var(--neko-preview-primary) 0%, var(--neko-preview-primary) ${percentage}%, rgba(255, 255, 255, 0.15) ${percentage}%, rgba(255, 255, 255, 0.15) 100%)`,
        }}
        {...props}
      />
      <style>{`
        .mac-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
       border-radius: 2px;
          outline: none;
          cursor: pointer;
          transition: height 0.15s;
        }

        .mac-slider:hover {
          height: 6px;
        }

        .mac-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
      background: var(--neko-preview-text-primary);
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      transition: transform 0.15s, opacity 0.15s;
          opacity: 0;
      }

        .mac-slider:hover::-webkit-slider-thumb {
          opacity: 1;
        }

        .mac-slider:active::-webkit-slider-thumb {
          transform: scale(1.2);
        }

        .mac-slider::-moz-range-thumb {
       width: 12px;
        height: 12px;
          border-radius: 50%;
       background: var(--neko-preview-text-primary);
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s, opacity 0.15s;
          opacity: 0;
        }

        .mac-slider:hover::-moz-range-thumb {
          opacity: 1;
     }

      .mac-slider:active::-moz-range-thumb {
        transform: scale(1.2);
        }
      `}</style>
    </div>
  );
}
