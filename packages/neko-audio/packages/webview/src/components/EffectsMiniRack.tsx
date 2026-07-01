import {
  isEngineAudioEffectType,
  type AudioEffectConfig,
  type AudioEffectSnapshot,
} from '@neko/shared';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

type EffectsMiniRackTarget =
  { readonly kind: 'track'; readonly trackId: string } | { readonly kind: 'master' };

interface EffectsMiniRackProps {
  readonly target: EffectsMiniRackTarget;
}

const QUICK_EFFECTS: readonly AudioEffectConfig[] = [
  { id: 'quick-gain', effectType: 'gain', enabled: true, params: { gainDb: 0 } },
  {
    id: 'quick-compressor',
    effectType: 'compressor',
    enabled: true,
    params: { threshold: -18, ratio: 3 },
  },
  {
    id: 'quick-limiter',
    effectType: 'limiter',
    enabled: true,
    params: { threshold: -1, release: 100 },
  },
];

export function EffectsMiniRack({ target }: EffectsMiniRackProps) {
  const project = useAudioProjectStore((s) => s.audioProjectData);
  const addTrackEffect = useAudioProjectStore((s) => s.addTrackEffect);
  const updateTrackEffect = useAudioProjectStore((s) => s.updateTrackEffect);
  const removeTrackEffect = useAudioProjectStore((s) => s.removeTrackEffect);
  const addEffect = useAudioProjectStore((s) => s.addEffect);
  const toggleEffect = useAudioProjectStore((s) => s.toggleEffect);
  const removeEffect = useAudioProjectStore((s) => s.removeEffect);

  const effects =
    target.kind === 'track'
      ? (project?.trackMix?.[target.trackId]?.effectChain ?? [])
      : (project?.masterEffectsChain ?? []);

  const addQuickEffect = (effect: AudioEffectConfig) => {
    const nextEffect = { ...effect, id: crypto.randomUUID() };
    if (target.kind === 'track') {
      addTrackEffect(target.trackId, nextEffect);
      return;
    }
    addEffect(toSnapshot(nextEffect));
  };

  const toggle = (effectId: string, enabled: boolean) => {
    if (target.kind === 'track') {
      updateTrackEffect(target.trackId, effectId, { enabled: !enabled });
      return;
    }
    toggleEffect(effectId);
  };

  const remove = (effectId: string) => {
    if (target.kind === 'track') {
      removeTrackEffect(target.trackId, effectId);
      return;
    }
    removeEffect(effectId);
  };

  return (
    <div className="effects-mini-rack">
      <div className="audio-panel-title compact">
        <span>{t('audio.effectsMiniRack.title')}</span>
        <small>
          {target.kind === 'track'
            ? t('audio.effectsMiniRack.track')
            : t('audio.effectsMiniRack.master')}
        </small>
      </div>
      <div className="effects-mini-rack-actions">
        {QUICK_EFFECTS.map((effect) => (
          <AudioButton
            key={effect.effectType}
            variant="ghost"
            onClick={() => addQuickEffect(effect)}
          >
            {effect.effectType}
          </AudioButton>
        ))}
      </div>
      {effects.length === 0 ? (
        <div className="audio-panel-note">{t('audio.effects.noEffects')}</div>
      ) : (
        <div className="effects-mini-rack-list">
          {effects.map((effect) => {
            const renderable = 'effectType' in effect && isEngineAudioEffectType(effect.effectType);
            const label = 'effectType' in effect ? effect.effectType : effect.type;
            return (
              <div key={effect.id} className="effects-mini-rack-row">
                <button onClick={() => toggle(effect.id, effect.enabled)}>
                  {effect.enabled ? t('audio.effects.bypass') : t('audio.effects.enable')}
                </button>
                <span>{label}</span>
                {!renderable && <em>{t('audio.effects.unsupported')}</em>}
                <button onClick={() => remove(effect.id)}>{t('audio.effects.remove')}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function toSnapshot(effect: AudioEffectConfig): AudioEffectSnapshot {
  return {
    id: effect.id,
    type: effect.effectType,
    name: effect.effectType,
    enabled: effect.enabled,
    params: effect.params,
  };
}
