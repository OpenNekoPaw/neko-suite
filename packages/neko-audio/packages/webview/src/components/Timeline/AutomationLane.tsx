import {
  getAutomatableAudioEffectParameters,
  type AudioAutomationLane,
  type AudioAutomationCurve,
  type AutomationTarget,
  ticksToSeconds,
} from '@neko/shared';
import { useAudioProjectStore, type AudioTrackUIState } from '../../stores/audioProjectStore';
import { useAudioStore } from '../../stores/audioStore';
import { getAutomationTargetLabel } from '../../utils/automation';
import { getProjectTempoMap } from '../../utils/beatGrid';
import { secondsToTicks } from '@neko/shared';

interface AutomationLaneProps {
  trackId: string;
  uiState: AudioTrackUIState;
  pps: number;
  width: number;
}

const AUTOMATION_LANE_HEIGHT = 44;

export function AutomationLane({ trackId, uiState, pps, width }: AutomationLaneProps) {
  const automation = uiState.automation ?? [];
  const addAutomationLane = useAudioProjectStore((s) => s.addAutomationLane);
  const updateAutomationLane = useAudioProjectStore((s) => s.updateAutomationLane);
  const removeAutomationLane = useAudioProjectStore((s) => s.removeAutomationLane);
  const addAutomationPoint = useAudioProjectStore((s) => s.addAutomationPoint);
  const updateAutomationPoint = useAudioProjectStore((s) => s.updateAutomationPoint);
  const removeAutomationPoint = useAudioProjectStore((s) => s.removeAutomationPoint);
  const tempoMap = useAudioProjectStore((s) => getProjectTempoMap(s.audioProjectData));
  const aiOperationHighlights = useAudioProjectStore((s) => s.aiOperationHighlights);

  const addLane = (value: string) => {
    const target = parseAutomationTarget(value);
    if (target) addAutomationLane(trackId, target);
  };

  return (
    <div className="border-t border-[var(--editor-border)] bg-[var(--timeline-bg)]">
      <div className="flex items-center gap-1 px-2 py-1">
        <select
          className="text-[11px] px-1 py-0.5 bg-[var(--btn-bg)] text-[var(--activity-fg)] border border-[var(--btn-border)] rounded"
          value=""
          onChange={(event) => addLane(event.target.value)}
        >
          <option value="">Automation</option>
          <option value="track-volume">Track volume</option>
          <option value="track-pan">Track pan</option>
          {uiState.effectChain.flatMap((effect) =>
            getAutomatableAudioEffectParameters(effect.effectType).map((metadata) => (
              <option
                key={`${effect.id}:${metadata.key}`}
                value={`effect-param:${effect.id}:${metadata.key}`}
              >
                {effect.effectType}.{metadata.key}
              </option>
            )),
          )}
        </select>
      </div>
      {automation.map((lane) => (
        <LaneEditor
          key={lane.id}
          lane={lane}
          trackId={trackId}
          uiState={uiState}
          pps={pps}
          width={width}
          onToggle={(enabled) => updateAutomationLane(trackId, lane.id, { enabled })}
          onRemove={() => removeAutomationLane(trackId, lane.id)}
          onCurve={(index, curve) => updateAutomationPoint(trackId, lane.id, index, { curve })}
          onPoint={(index, value) => updateAutomationPoint(trackId, lane.id, index, { value })}
          onDeletePoint={(index) => removeAutomationPoint(trackId, lane.id, index)}
          onAddPoint={(seconds) =>
            addAutomationPoint(trackId, lane.id, secondsToTicks(seconds, tempoMap))
          }
          aiHighlighted={isEffectParamHighlighted(lane, aiOperationHighlights)}
        />
      ))}
    </div>
  );
}

function LaneEditor({
  lane,
  trackId: _trackId,
  uiState,
  pps,
  width,
  onToggle,
  onRemove,
  onCurve,
  onPoint,
  onDeletePoint,
  onAddPoint,
  aiHighlighted,
}: {
  lane: AudioAutomationLane;
  trackId: string;
  uiState: AudioTrackUIState;
  pps: number;
  width: number;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onCurve: (index: number, curve: AudioAutomationCurve) => void;
  onPoint: (index: number, value: number) => void;
  onDeletePoint: (index: number) => void;
  onAddPoint: (seconds: number) => void;
  aiHighlighted: boolean;
}) {
  const getRange = useAudioProjectStore((s) => s.getAutomationValueRange);
  const tempoMap = useAudioProjectStore((s) => getProjectTempoMap(s.audioProjectData));
  const currentTime = useAudioStore((s) => s.currentTime);
  const range = getRange(_trackId, lane.target);
  if (!range) return null;

  const points = lane.points;
  const path = points
    .map((point, index) => {
      const x = secondsToPixels(point.ticks, tempoMap, pps);
      const y = valueToY(point.value, range.min, range.max);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div
      className={`relative border-t border-[var(--editor-border)] ${aiHighlighted ? 'neko-ai-effect-highlight' : ''}`}
      style={{ height: AUTOMATION_LANE_HEIGHT }}
    >
      <div className="absolute left-2 top-1 z-10 flex items-center gap-1">
        <input
          type="checkbox"
          checked={lane.enabled}
          onChange={(event) => onToggle(event.target.checked)}
          title="Enable automation"
        />
        <span className="text-[10px] text-[var(--activity-fg)]">
          {getAutomationTargetLabel(lane.target, uiState)}
        </span>
        {aiHighlighted && <span className="neko-ai-badge">AI</span>}
        <button className="neko-track-btn remove" onClick={onRemove} title="Remove automation">
          x
        </button>
      </div>
      <svg
        className="absolute inset-0"
        width={Math.max(width, 1)}
        height={AUTOMATION_LANE_HEIGHT}
        onDoubleClick={(event) => {
          const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
          onAddPoint((event.clientX - rect.left) / pps);
        }}
      >
        <path
          d={path}
          stroke="var(--accent)"
          strokeWidth={1.5}
          fill="none"
          opacity={lane.enabled ? 1 : 0.35}
        />
        {points.map((point, index) => {
          const x = secondsToPixels(point.ticks, tempoMap, pps);
          const y = valueToY(point.value, range.min, range.max);
          return (
            <g key={`${point.ticks}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={4}
                fill="var(--accent)"
                opacity={lane.enabled ? 1 : 0.35}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onDeletePoint(index);
                }}
              />
              <foreignObject x={x + 6} y={Math.max(0, y - 12)} width={92} height={22}>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={Number(point.value.toFixed(3))}
                    min={range.min}
                    max={range.max}
                    step="0.01"
                    onChange={(event) => onPoint(index, Number.parseFloat(event.target.value))}
                    className="w-12 text-[9px] bg-[var(--btn-bg)] text-[var(--activity-fg)] border border-[var(--btn-border)] rounded px-0.5"
                  />
                  <select
                    value={point.curve}
                    onChange={(event) => onCurve(index, event.target.value as AudioAutomationCurve)}
                    className="w-9 text-[9px] bg-[var(--btn-bg)] text-[var(--activity-fg)] border border-[var(--btn-border)] rounded px-0.5"
                  >
                    <option value="linear">lin</option>
                    <option value="hold">hold</option>
                    <option value="exponential">exp</option>
                  </select>
                </div>
              </foreignObject>
            </g>
          );
        })}
        <line
          x1={currentTime * pps}
          x2={currentTime * pps}
          y1={0}
          y2={AUTOMATION_LANE_HEIGHT}
          stroke="var(--waveform-cursor)"
          strokeWidth={1}
          opacity={0.5}
        />
      </svg>
    </div>
  );
}

function parseAutomationTarget(value: string): AutomationTarget | null {
  if (value === 'track-volume') return { kind: 'track-volume' };
  if (value === 'track-pan') return { kind: 'track-pan' };
  const [kind, effectId, param] = value.split(':');
  if (kind === 'effect-param' && effectId && param) {
    return { kind: 'effect-param', effectId, param };
  }
  return null;
}

function secondsToPixels(
  ticks: number,
  tempoMap: ReturnType<typeof getProjectTempoMap>,
  pps: number,
): number {
  return ticksToSeconds(ticks, tempoMap) * pps;
}

function valueToY(value: number, min: number, max: number): number {
  const ratio = max === min ? 0 : (value - min) / (max - min);
  return (
    AUTOMATION_LANE_HEIGHT - 6 - Math.max(0, Math.min(1, ratio)) * (AUTOMATION_LANE_HEIGHT - 12)
  );
}

function isEffectParamHighlighted(
  lane: AudioAutomationLane,
  highlights: ReturnType<typeof useAudioProjectStore.getState>['aiOperationHighlights'],
): boolean {
  if (lane.target.kind !== 'effect-param') return false;
  const effectId = lane.target.effectId;
  return Object.values(highlights).some((highlight) => highlight.effectIds.includes(effectId));
}
