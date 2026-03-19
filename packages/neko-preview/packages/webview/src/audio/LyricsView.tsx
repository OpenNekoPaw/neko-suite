/**
 * LyricsView - Scrolling synced lyrics display
 *
 * Renders parsed LRC lyrics with the current line highlighted
 * and auto-scrolled to center. Falls back to placeholder when
 * no lyrics are available.
 */

import { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { findCurrentLineIndex, type LrcLine } from './lrc-parser';

interface LyricsViewProps {
  /** Parsed lyric lines (empty = no lyrics) */
  lyrics: LrcLine[];
  /** Current playback time in seconds */
  currentTime: number;
}

export function LyricsView({ lyrics, currentTime }: LyricsViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Detect plain-text (unsynchronized) lyrics — all lines have time === -1
  const isUnsynchronized = lyrics.length > 0 && lyrics[0]?.time === -1;

  const currentIndex = useMemo(
    () => (isUnsynchronized ? -1 : findCurrentLineIndex(lyrics, currentTime)),
    [lyrics, currentTime, isUnsynchronized],
  );

  // Auto-scroll active line to center (only for synced lyrics)
  useEffect(() => {
    const el = activeRef.current;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  // No lyrics — show placeholder
  if (lyrics.length === 0) {
    return (
      <div className="audio-player__lyrics">
        <div className="audio-player__lyrics-placeholder">
          <svg viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
          <div>{t('preview.audio.noLyrics')}</div>
        </div>
      </div>
    );
  }

  // Unsynchronized plain-text lyrics — static scrollable display
  if (isUnsynchronized) {
    return (
      <div className="audio-player__lyrics audio-player__lyrics--has-content" ref={containerRef}>
        <div className="audio-player__lyrics-scroll">
          <div className="audio-player__lyrics-spacer" />
          {lyrics.map((line, i) => (
            <div key={i} className="audio-player__lyrics-line audio-player__lyrics-line--static">
              {line.text}
            </div>
          ))}
          <div className="audio-player__lyrics-spacer" />
        </div>
      </div>
    );
  }

  return (
    <div className="audio-player__lyrics audio-player__lyrics--has-content" ref={containerRef}>
      <div className="audio-player__lyrics-scroll">
        {/* Top spacer for centering first line */}
        <div className="audio-player__lyrics-spacer" />

        {lyrics.map((line, i) => (
          <div
            key={`${i}-${line.time}`}
            ref={i === currentIndex ? activeRef : undefined}
            className={`audio-player__lyrics-line ${
              i === currentIndex ? 'audio-player__lyrics-line--active' : ''
            } ${i < currentIndex ? 'audio-player__lyrics-line--past' : ''}`}
          >
            {line.text}
          </div>
        ))}

        {/* Bottom spacer for centering last line */}
        <div className="audio-player__lyrics-spacer" />
      </div>
    </div>
  );
}
