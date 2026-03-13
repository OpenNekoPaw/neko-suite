/**
 * ParameterPanel - interactive sliders for Inochi2D puppet parameters
 *
 * Displays all parameters from the loaded puppet with min/max/current values.
 * Slider changes are sent to the engine backend via the controller.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { IInochi2DController } from '../animation';

interface ParameterPanelProps {
  controller: IInochi2DController | null;
}

export function ParameterPanel({ controller }: ParameterPanelProps) {
  const { t } = useTranslation();
  const show = useSketchStore((s) => s.showLayerPanel);
  const puppetLoaded = useSketchStore((s) => s.puppetLoaded);
  const parameters = useSketchStore((s) => s.puppetParameters);
  const updateParameterValue = useSketchStore((s) => s.updateParameterValue);

  const handleChange = useCallback(
    (name: string, value: number) => {
      // Update store immediately for responsive UI
      updateParameterValue(name, value);
      // Send to engine backend
      void controller?.setParameter(name, value);
    },
    [controller, updateParameterValue],
  );

  if (!show || !puppetLoaded || parameters.length === 0) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.parameters')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.parameters')}</h3>

      <div className="flex flex-col gap-1">
        {parameters.map((param) => (
          <ParameterSlider
            key={param.name}
            name={param.name}
            min={param.min}
            max={param.max}
            value={param.current}
            defaultValue={param.default}
            onChange={handleChange}
          />
        ))}
      </div>
    </div>
  );
}

function ParameterSlider(props: {
  name: string;
  min: number;
  max: number;
  value: number;
  defaultValue: number;
  onChange: (name: string, value: number) => void;
}) {
  const { t } = useTranslation();
  const { name, min, max, value, defaultValue, onChange } = props;
  const range = max - min;
  const step = range > 0 ? range / 100 : 0.01;

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(name, parseFloat(e.target.value));
    },
    [name, onChange],
  );

  const handleReset = useCallback(() => {
    onChange(name, defaultValue);
  }, [name, defaultValue, onChange]);

  return (
    <div className="flex flex-col gap-0.5 px-1">
      <div className="flex items-center justify-between">
        <span className="text-xs truncate flex-1" title={name}>
          {name}
        </span>
        <button
          className="text-[10px] opacity-50 hover:opacity-100 px-1"
          onClick={handleReset}
          title={t('sketch.parameter.resetDefault')}
          aria-label={t('sketch.parameter.resetParam', { name })}
        >
          ↺
        </button>
        <span className="text-[10px] opacity-50 w-8 text-right tabular-nums">
          {value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="w-full h-1 accent-[var(--vscode-button-background)]"
        aria-label={name}
        onChange={handleInput}
      />
    </div>
  );
}
