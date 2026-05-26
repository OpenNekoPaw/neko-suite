import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@neko/ui/icons';
import type { PresetEntry } from '../shared/types';
import { postMessage } from '../shared/useVscodeMessage';
import { useAudioStore } from '../stores/audioStore';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { AudioButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

const CATEGORY_ORDER = ['voice-over', 'music', 'sound-design'] as const;

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  'voice-over': 'audio.presets.category.voiceOver',
  music: 'audio.presets.category.music',
  'sound-design': 'audio.presets.category.soundDesign',
};

export function PresetBrowser() {
  const [presets, setPresets] = useState<PresetEntry[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const projectMode = useAudioStore((s) => s.projectMode);
  const tracks = useAudioProjectStore((s) => s.audioProjectData?.tracks);

  useEffect(() => {
    postMessage({ type: 'presets:listRequest' });

    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string; payload?: PresetEntry[] };
      if (msg.type === 'presets:list' && msg.payload) {
        setPresets(msg.payload);
        if (msg.payload.length > 0 && !expandedCategory) {
          setExpandedCategory(msg.payload[0]!.category);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PresetEntry[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const preset of presets) {
      const list = map.get(preset.category);
      if (list) {
        list.push(preset);
      } else {
        map.set(preset.category, [preset]);
      }
    }
    return map;
  }, [presets]);

  const handleApply = useCallback((presetId: string, trackId?: string) => {
    postMessage({ type: 'presets:apply', presetId, trackId });
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  }, []);

  return (
    <div className="flex flex-col gap-1 p-2">
      {presets.length === 0 ? (
        <div className="text-[11px] opacity-50 text-center py-4">{t('audio.presets.empty')}</div>
      ) : (
        Array.from(grouped.entries()).map(([category, items]) => {
          if (items.length === 0) return null;
          const isExpanded = expandedCategory === category;
          return (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium bg-transparent border-none text-[var(--vscode-foreground)] cursor-pointer rounded hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                <span className="opacity-60" aria-hidden="true">
                  {isExpanded ? (
                    <ChevronDownIcon className="h-3 w-3" />
                  ) : (
                    <ChevronRightIcon className="h-3 w-3" />
                  )}
                </span>
                <span>{t(CATEGORY_LABEL_KEYS[category] ?? '') || category}</span>
                <span className="ml-auto text-[10px] opacity-40">{items.length}</span>
              </button>

              {isExpanded && (
                <div className="flex flex-col gap-1 pl-2 pr-0.5 pb-1">
                  {items.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      projectMode={projectMode}
                      tracks={tracks}
                      onApply={handleApply}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

interface PresetCardProps {
  preset: PresetEntry;
  projectMode: boolean;
  tracks?: Array<{ id: string; name: string }>;
  onApply: (presetId: string, trackId?: string) => void;
}

function PresetCard({ preset, projectMode, tracks, onApply }: PresetCardProps) {
  const [showTrackMenu, setShowTrackMenu] = useState(false);

  const effectSummary = preset.effectChain.map((e) => e.effectType.replace(/_/g, ' ')).join(' → ');

  const handleApplyClick = useCallback(() => {
    if (projectMode && tracks && tracks.length > 1) {
      setShowTrackMenu((v) => !v);
    } else {
      onApply(preset.id);
    }
  }, [projectMode, tracks, onApply, preset.id]);

  return (
    <div className="rounded border border-[var(--vscode-panel-border,#333)] bg-[var(--vscode-editor-background)] p-2">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium truncate">{preset.name}</div>
          <div className="text-[10px] opacity-50 mt-0.5 line-clamp-2">{preset.description}</div>
        </div>
      </div>

      <div className="text-[9px] opacity-40 mt-1 truncate font-mono">{effectSummary}</div>

      <div className="flex gap-1 mt-1.5 relative">
        <AudioButton
          variant="primary"
          onClick={handleApplyClick}
          className="text-[10px] px-2 py-0.5 flex-1"
        >
          {t('audio.presets.apply')}
        </AudioButton>

        {showTrackMenu && tracks && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setShowTrackMenu(false)} />
            <div className="absolute bottom-full left-0 z-[100] mb-1 min-w-[140px] p-1 rounded bg-[var(--vscode-menu-background,#252526)] border border-[var(--vscode-menu-border,#454545)] shadow-xl">
              <button
                onClick={() => {
                  onApply(preset.id);
                  setShowTrackMenu(false);
                }}
                className="block w-full text-left px-2 py-1 text-[10px] bg-transparent text-[var(--vscode-menu-foreground,#ccc)] border-none rounded cursor-pointer hover:bg-[var(--vscode-menu-selectionBackground,#094771)]"
              >
                {t('audio.presets.applyMaster')}
              </button>
              {tracks.map((track) => (
                <button
                  key={track.id}
                  onClick={() => {
                    onApply(preset.id, track.id);
                    setShowTrackMenu(false);
                  }}
                  className="block w-full text-left px-2 py-1 text-[10px] bg-transparent text-[var(--vscode-menu-foreground,#ccc)] border-none rounded cursor-pointer hover:bg-[var(--vscode-menu-selectionBackground,#094771)] truncate"
                >
                  {track.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
