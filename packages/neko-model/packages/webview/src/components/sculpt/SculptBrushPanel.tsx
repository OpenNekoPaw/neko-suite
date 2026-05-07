import React, { useCallback, useMemo, useRef, useState } from 'react';
import { VertexBrushPatchClient } from '@neko/neko-client';
import type { LocalPredictionInput } from '../../scene/LocalPredictionLayer';
import {
  SculptBrushStrokeController,
  modelingWebSocketUrl,
  type SculptBrushSettings,
} from '../../scene/SculptBrushWorkflow';
import { useTranslation } from '../../i18n/I18nContext';

interface SculptBrushPanelProps {
  disabled?: boolean;
  enginePort: number | null;
  selectedNodeId: string | null;
  selectedCharacterId: string | null;
  topologyVersion: number;
  sceneRevision: number;
  nextSeq: () => number;
  onBeginSession: (payload: Record<string, unknown>) => void;
  onCommitSession: (payload: Record<string, unknown>) => void;
  onCancelSession: (payload: Record<string, unknown>) => void;
  onCreatePrediction: (prediction: LocalPredictionInput) => void;
  onRecordPatchBytes: (bytes: number) => void;
  onDropPrediction: (seq: number) => void;
}

export function SculptBrushPanel({
  disabled = false,
  enginePort,
  selectedNodeId,
  selectedCharacterId,
  topologyVersion,
  sceneRevision,
  nextSeq,
  onBeginSession,
  onCommitSession,
  onCancelSession,
  onCreatePrediction,
  onRecordPatchBytes,
  onDropPrediction,
}: SculptBrushPanelProps): React.JSX.Element {
  const [settings, setSettings] = useState<SculptBrushSettings>({
    radius: 12,
    strength: 0.45,
    falloff: 0.75,
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastStrokeSeq, setLastStrokeSeq] = useState<number | null>(null);
  const clientRef = useRef<VertexBrushPatchClient | null>(null);
  const controllerRef = useRef<SculptBrushStrokeController | null>(null);

  const { t } = useTranslation();
  const canEdit = !disabled && enginePort !== null && selectedNodeId !== null;
  const status = useMemo(() => {
    if (!selectedNodeId) return t('sculpt.selectMesh');
    if (!enginePort) return t('sculpt.engineUnavailable');
    return sessionId ? t('sculpt.sessionInfo', { id: sessionId }) : t('sculpt.ready');
  }, [enginePort, selectedNodeId, sessionId, t]);

  const beginSession = useCallback(() => {
    if (!canEdit || enginePort === null || !selectedNodeId) return;
    const nextSessionId = `sculpt-${Date.now()}`;
    clientRef.current?.dispose();
    clientRef.current = new VertexBrushPatchClient({
      websocketUrl: modelingWebSocketUrl(enginePort, nextSessionId),
      onBackpressure: onDropPrediction,
    });
    controllerRef.current = new SculptBrushStrokeController({
      viewportId: 'main',
      sceneRevision,
      sessionId: nextSessionId,
      meshId: selectedNodeId,
      characterId: selectedCharacterId ?? undefined,
      topologyVersion,
      nextSeq,
      settings,
      client: clientRef.current,
      createPrediction: onCreatePrediction,
      recordPatchBytes: onRecordPatchBytes,
    });
    setSessionId(nextSessionId);
    onBeginSession({
      sessionId: nextSessionId,
      meshId: selectedNodeId,
      characterId: selectedCharacterId ?? undefined,
      topologyMutable: true,
      beforeHash: `webview:${sceneRevision}:${selectedNodeId}`,
    });
  }, [
    canEdit,
    enginePort,
    nextSeq,
    onBeginSession,
    onCreatePrediction,
    onDropPrediction,
    onRecordPatchBytes,
    sceneRevision,
    selectedCharacterId,
    selectedNodeId,
    settings,
    topologyVersion,
  ]);

  const sampleStroke = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.beginStroke(`stroke-${Date.now()}`);
    controller.addSample({ x: 0.45, y: 0.45, pressure: 0.7 });
    controller.addSample({ x: 0.5, y: 0.5, pressure: 1 });
    controller.addSample({ x: 0.55, y: 0.53, pressure: 0.65 });
    const result = controller.endStroke();
    setLastStrokeSeq(result?.seq ?? null);
  }, []);

  const commitSession = useCallback(() => {
    if (!sessionId) return;
    onCommitSession({
      sessionId,
      operation: 'sculpt',
      vertexCountBefore: 0,
      vertexCountAfter: 0,
    });
    clientRef.current?.dispose();
    clientRef.current = null;
    controllerRef.current = null;
    setSessionId(null);
  }, [onCommitSession, sessionId]);

  const cancelSession = useCallback(() => {
    if (!sessionId) return;
    onCancelSession({ sessionId });
    clientRef.current?.dispose();
    clientRef.current = null;
    controllerRef.current = null;
    setSessionId(null);
  }, [onCancelSession, sessionId]);

  return (
    <div className="model-side-panel h-full w-64">
      <div className="model-panel-header">
        <h2 className="model-title">{t('sculpt.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('sculpt.brush')}</div>
          <BrushSlider
            label={t('sculpt.radius')}
            min={1}
            max={64}
            step={1}
            value={settings.radius}
            onChange={(radius) => setSettings((prev) => ({ ...prev, radius }))}
          />
          <BrushSlider
            label={t('sculpt.strength')}
            min={0}
            max={1}
            step={0.01}
            value={settings.strength}
            onChange={(strength) => setSettings((prev) => ({ ...prev, strength }))}
          />
          <BrushSlider
            label={t('sculpt.falloff')}
            min={0}
            max={1}
            step={0.01}
            value={settings.falloff}
            onChange={(falloff) => setSettings((prev) => ({ ...prev, falloff }))}
          />
        </div>

        <div className="model-panel-section">
          <div className="model-section-title mb-2">{t('sculpt.session')}</div>
          <div className="mb-2 text-[11px] text-[var(--model-fg-secondary)]">{status}</div>
          <button
            className="model-btn-primary mb-2 w-full"
            disabled={!canEdit || sessionId !== null}
            onClick={beginSession}
          >
            {t('sculpt.begin')}
          </button>
          <button
            className="model-btn-secondary mb-2 w-full"
            disabled={!sessionId}
            onClick={sampleStroke}
          >
            {t('sculpt.strokeSample')}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="model-btn-primary" disabled={!sessionId} onClick={commitSession}>
              {t('sculpt.commit')}
            </button>
            <button className="model-btn-secondary" disabled={!sessionId} onClick={cancelSession}>
              {t('sculpt.cancel')}
            </button>
          </div>
          {lastStrokeSeq !== null && (
            <div className="mt-2 text-[11px] text-[var(--model-fg-secondary)]">
              {t('sculpt.lastPatchSeq', { seq: lastStrokeSeq })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BrushSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10px] text-[var(--model-fg-secondary)]">{label}</span>
        <span className="text-[10px] text-[var(--model-fg-secondary)]">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input
        className="model-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
