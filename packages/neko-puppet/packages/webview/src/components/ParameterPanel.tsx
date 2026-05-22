/**
 * ParameterPanel - interactive sliders for puppet parameters
 *
 * Displays all parameters from the loaded puppet with min/max/current values.
 * Slider changes are sent to the engine backend via the controller.
 */
import { useCallback, useMemo } from 'react';
import { usePuppetStore } from '../stores/puppet-store';
import { useTranslation } from '../i18n/I18nContext';
import { FaceParameterSection } from './FaceParameterSection';
import { PUPPET_FACE_PARAMETERS } from '@neko/shared';
import type { IPuppetController } from '../animation';

interface ParameterPanelProps {
  controller: IPuppetController | null;
}

export function ParameterPanel({ controller }: ParameterPanelProps) {
  const { t } = useTranslation();
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);
  const parameters = usePuppetStore((s) => s.puppetParameters);
  const nativeBlendShapes = usePuppetStore((s) => s.nativeBlendShapes);
  const updateParameterValue = usePuppetStore((s) => s.updateParameterValue);
  const updateNativeBlendShapeWeight = usePuppetStore((s) => s.updateNativeBlendShapeWeight);
  const setNativeRevision = usePuppetStore((s) => s.setNativeRevision);
  const nextNativeSeq = usePuppetStore((s) => s.nextNativeSeq);
  const addPendingNativeCommand = usePuppetStore((s) => s.addPendingNativeCommand);
  const removePendingNativeCommand = usePuppetStore((s) => s.removePendingNativeCommand);

  const handleChange = useCallback(
    (name: string, value: number) => {
      // Update store immediately for responsive UI
      updateParameterValue(name, value);
      // Send to engine backend
      void controller?.setParameter(name, value);
    },
    [controller, updateParameterValue],
  );

  const handleNativeBlendShapeChange = useCallback(
    (name: string, value: number) => {
      updateNativeBlendShapeWeight(name, value);
      const seq = nextNativeSeq();
      const transactionId = `blendshape:${name}:${seq}`;
      addPendingNativeCommand(transactionId);
      const activeController = controller;
      void controller
        ?.applyNativeCommand(
          seq,
          usePuppetStore.getState().nativeRevision,
          { type: 'setNativeBlendShape', name, weight: value },
          transactionId,
        )
        .then(async (ack) => {
          setNativeRevision(ack.revision);
          const meshes = await activeController?.getMeshes();
          if (!meshes) return;
          usePuppetStore.getState().setDeformedMeshes(meshes);
        })
        .catch(() => {
          void activeController?.getMeshes().then((meshes) => {
            usePuppetStore.getState().setDeformedMeshes(meshes);
          });
        })
        .finally(() => removePendingNativeCommand(transactionId));
    },
    [
      addPendingNativeCommand,
      controller,
      nextNativeSeq,
      removePendingNativeCommand,
      setNativeRevision,
      updateNativeBlendShapeWeight,
    ],
  );

  // Check if any puppet parameters match the standard face parameter template
  const hasFaceParams = useMemo(() => {
    const faceNames = new Set(PUPPET_FACE_PARAMETERS.map((p) => p.name));
    return parameters.some((p) => faceNames.has(p.name));
  }, [parameters]);

  if (!puppetLoaded || (parameters.length === 0 && nativeBlendShapes.length === 0)) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('puppet.panel.parameters')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('puppet.panel.parameters')}</h3>

      {nativeBlendShapes.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {nativeBlendShapes.map((shape) => (
            <ParameterSlider
              key={`${shape.meshId}:${shape.name}`}
              name={shape.name}
              min={0}
              max={1}
              value={shape.current}
              defaultValue={0}
              onChange={handleNativeBlendShapeChange}
            />
          ))}
        </div>
      )}

      {parameters.length > 0 && hasFaceParams ? (
        <FaceParameterSection parameters={parameters} onParameterChange={handleChange} />
      ) : parameters.length > 0 ? (
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
      ) : null}
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
          title={t('puppet.parameter.resetDefault')}
          aria-label={t('puppet.parameter.resetParam', { name })}
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
