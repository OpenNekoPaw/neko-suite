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
import { MacButton } from '@neko/shared/components';
import { t } from '../i18n';

interface EffectsPanelProps {
  chain: EffectsChain;
}

// i18n keys for category labels
const CATEGORY_LABEL_KEYS: Record<AudioEffectCategory, string> = {
  dynamics: 'audioEffects.category.dynamics',
  filter: 'audioEffects.category.filter',
  spatial: 'audioEffects.category.spatial',
  modulation: 'audioEffects.category.modulation',
  utility: 'audioEffects.category.utility',
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
    <div className="flex flex-col gap-2 p-2">
      {/* Header actions */}
      <div className="flex items-center">
        <span className="flex-1" />
        <div className="relative">
          <MacButton
            variant="ghost"
            size="sm"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="text-[11px] px-2 py-0.5"
          >
            + {t('audio.effects.add')}
          </MacButton>

          {/* Add dropdown */}
          {showAddMenu && (
            <AddEffectMenu onSelect={handleAdd} onClose={() => setShowAddMenu(false)} />
          )}
        </div>
      </div>

      {/* Effects list */}
      {chain.effects.length === 0 ? (
        <div className="text-[11px] opacity-50 text-center py-3">
          {t('audio.effects.noEffects')}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
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
        <div className="flex gap-1.5">
          <MacButton
            variant="primary"
            size="sm"
            onClick={handleApply}
            className="flex-1 text-[11px]"
          >
            {t('audio.effects.apply')}
          </MacButton>
          <MacButton
            variant="ghost"
            size="sm"
            onClick={chain.clearAll}
            className="text-[11px] opacity-70"
          >
            {t('audio.effects.clear')}
          </MacButton>
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
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      {/* Menu */}
      <div className="absolute top-full right-0 z-[100] min-w-[180px] max-h-[300px] overflow-y-auto p-1 rounded bg-[var(--vscode-menu-background,#252526)] border border-[var(--vscode-menu-border,#454545)] shadow-xl">
        {CATEGORY_ORDER.map((category) => {
          const effects = effectsByCategory.get(category);
          if (!effects || effects.length === 0) return null;
          return (
            <div key={category}>
              <div className="text-[10px] opacity-50 px-2 pt-1 pb-0.5 uppercase tracking-wider">
                {t(CATEGORY_LABEL_KEYS[category]) || category}
              </div>
              {effects.map((effect) => (
                <button
                  key={effect.type}
                  onClick={() => onSelect(effect.type)}
                  className="block w-full text-left px-2 py-1 text-xs bg-transparent text-[var(--vscode-menu-foreground,#ccc)] border-none rounded cursor-pointer hover:bg-[var(--vscode-menu-selectionBackground,#094771)]"
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
