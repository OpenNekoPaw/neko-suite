import { useEffect } from 'react';
import { useAudioStore } from '../stores/audioStore';
import { useAudioProjectStore } from '../stores/audioProjectStore';
import { postMessage } from '../shared/useVscodeMessage';

interface ShortcutCallbacks {
  onTogglePlay: () => void;
  onStop: () => void;
}

export function useKeyboardShortcuts({ onTogglePlay, onStop }: ShortcutCallbacks) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === 'z') {
        e.preventDefault();
        const store = useAudioProjectStore.getState();
        if (e.shiftKey) {
          if (store.canRedo()) store.opRedo();
        } else {
          if (store.canUndo()) store.opUndo();
        }
        return;
      }

      if (isMeta) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          onTogglePlay();
          break;

        case 'Escape':
          onStop();
          break;

        case 'l':
        case 'L': {
          e.preventDefault();
          const store = useAudioStore.getState();
          store.toggleLoop();
          postMessage({
            type: 'audio:playback',
            action: 'setLoop',
            loop: !store.isLooping,
            mode: store.projectMode ? 'project' : 'single-file',
          });
          break;
        }

        case 'm':
        case 'M': {
          const projStore = useAudioProjectStore.getState();
          const data = projStore.audioProjectData;
          if (data && data.tracks.length > 0) {
            projStore.toggleTrackField(data.tracks[0]!.id, 'muted');
          }
          break;
        }

        case 's':
        case 'S': {
          e.preventDefault();
          const currentTime = useAudioStore.getState().currentTime;
          const projStore = useAudioProjectStore.getState();
          const projData = projStore.audioProjectData;
          if (!projData) break;

          for (const track of projData.tracks) {
            for (const el of track.elements) {
              const elEnd = el.startTime + (el.duration ?? 0);
              if (currentTime > el.startTime + 0.01 && currentTime < elEnd - 0.01) {
                projStore.splitElementAt(track.id, el.id, currentTime);
                break;
              }
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTogglePlay, onStop]);
}
