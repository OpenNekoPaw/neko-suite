/**
 * EffectsPanel - Side panel for audio effects chain
 *
 * Displays the current effects chain with add/remove/reorder controls.
 * Groups available effects by category in the Add dropdown.
 */

import { useCallback, useState } from 'react';
import type { AudioEffectType, AudioEffectCategory } from '../types/audioEffects';
import { AUDIO_EFFECT_DEFINITIONS } from '../types/audioEffects';
import type { EffectsChain } from '../hooks/useEffectsChain';
import { EffectEditor } from './EffectEditor';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

interface EffectsPanelProps {
  chain: EffectsChain;
}

// Group effects by category for the Add dropdown
const CATEGORY_LABELS: Record<AudioEffectCategory, string> = {
  dynamics: 'Dynamics',
  filter: 'Filter',
  spatial: 'Spatial',
  modulation: 'Modulation',
  utility: 'Utility',
};

const CATEGORY_ORDER: AudioEffectCategory[] = [
  'dynamics',
  'filter',
  'spatial',
  'modulation',
  'utility',
];

function getEffectsByCategory(): Map<
  AudioEffectCategory,
  Array<{ type: AudioEffectType; nameKey: string }>
> {
  const map = new Map<AudioEffectCategory, Array<{ type: AudioEffectType; nameKey: string }>>();

  for (const category of CATEGORY_ORDER) {
    map.set(category, []);
  }

  const entries = Object.values(AUDIO_EFFECT_DEFINITIONS);
  for (const def of entries) {
    const list = map.get(def.category);
    if (list) {
      list.push({ type: def.type, nameKey: def.nameKey });
    }
  }

  return map;
}

const effectsByCategory = getEffectsByCategory();

export function EffectsPanel({ chain }: EffectsPanelProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const handleAdd = useCallback(
    (type: AudioEffectType) => {
      chain.addEffect(type);
      setShowAddMenu(false);
    },
    [chain],
  );

  const handleApply = useCallback(() => {
    if (chain.effects.length === 0) return;

    // Send enabled effects to extension for transcode
    const enabledEffects = chain.effects
      .filter((e) => e.enabled)
      .map((e) => ({
        type: e.type as string,
        params: e.params as unknown as Record<string, unknown>,
      }));

    postMessage({
      type: 'editor:applyEffects',
      effects: enabledEffects,
    });
  }, [chain.effects]);

  return (
    <div
      style={{
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button
            className="btn"
            onClick={() => setShowAddMenu(!showAddMenu)}
            style={{ fontSize: 11, padding: '2px 8px' }}
          >
            + {t('audio.effects.add')}
          </button>

          {/* Add dropdown */}
          {showAddMenu && (
            <AddEffectMenu onSelect={handleAdd} onClose={() => setShowAddMenu(false)} />
          )}
        </div>
      </div>

      {/* Effects list */}
      {chain.effects.length === 0 ? (
        <div style={{ fontSize: 11, opacity: 0.5, textAlign: 'center', padding: 12 }}>
          {t('audio.effects.noEffects')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {chain.effects.map((effect, index) => (
            <EffectEditor
              key={effect.id}
              effect={effect}
              onUpdateParams={chain.updateParams}
              onRemove={chain.removeEffect}
              onToggle={chain.toggleEffect}
              onMoveUp={index > 0 ? () => chain.moveEffect(index, index - 1) : undefined}
              onMoveDown={
                index < chain.effects.length - 1
                  ? () => chain.moveEffect(index, index + 1)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Apply / Clear buttons */}
      {chain.effects.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn"
            onClick={handleApply}
            style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
          >
            {t('audio.effects.apply')}
          </button>
          <button
            className="btn"
            onClick={chain.clearAll}
            style={{ fontSize: 11, padding: '4px 8px', opacity: 0.7 }}
          >
            {t('audio.effects.clear')}
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Add Effect Dropdown Menu
// =============================================================================

interface AddEffectMenuProps {
  onSelect: (type: AudioEffectType) => void;
  onClose: () => void;
}

function AddEffectMenu({ onSelect, onClose }: AddEffectMenuProps) {
  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={onClose} />
      {/* Menu */}
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          zIndex: 100,
          background: 'var(--vscode-menu-background, #252526)',
          border: '1px solid var(--vscode-menu-border, #454545)',
          borderRadius: 4,
          padding: 4,
          minWidth: 180,
          maxHeight: 300,
          overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        {CATEGORY_ORDER.map((category) => {
          const effects = effectsByCategory.get(category);
          if (!effects || effects.length === 0) return null;
          return (
            <div key={category}>
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.5,
                  padding: '4px 8px 2px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {CATEGORY_LABELS[category]}
              </div>
              {effects.map((effect) => (
                <button
                  key={effect.type}
                  onClick={() => onSelect(effect.type)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 8px',
                    fontSize: 12,
                    background: 'transparent',
                    color: 'var(--vscode-menu-foreground, #ccc)',
                    border: 'none',
                    borderRadius: 3,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'var(--vscode-menu-selectionBackground, #094771)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {t(effect.nameKey) || effect.type}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
