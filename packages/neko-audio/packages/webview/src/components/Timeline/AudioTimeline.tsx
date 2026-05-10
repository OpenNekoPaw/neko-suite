/**
 * AudioTimeline — Multi-track timeline container
 *
 * Layout: TimelineRuler on top, TrackLane rows below.
 * Left column: track headers. Right column: scrollable element lanes.
 */

import { useRef, useCallback, useMemo, useEffect } from 'react';
import { useAudioProjectStore } from '../../stores/audioProjectStore';
import { useAudioStore } from '../../stores/audioStore';
import { TimelineRuler } from './TimelineRuler';
import { TrackLane } from './TrackLane';
import { PIXELS_PER_SECOND, TRACK_HEIGHT, RULER_HEIGHT, TRACK_LABEL_WIDTH } from '../../constants';
import { getTotalDuration } from '@neko/shared';
import { t } from '../../i18n';

export function AudioTimeline() {
  const tracks = useAudioProjectStore((s) => s.audioProjectData?.tracks ?? []);
  const waveforms = useAudioProjectStore((s) => s.waveforms);
  const currentTime = useAudioStore((s) => s.currentTime);
  const playbackState = useAudioStore((s) => s.playbackState);
  const zoom = useAudioStore((s) => s.zoom);
  const setZoom = useAudioStore((s) => s.setZoom);

  const tracksRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalDuration = useMemo(() => {
    return Math.max(getTotalDuration(tracks), 30);
  }, [tracks]);

  const timelineWidth = Math.max((totalDuration + 10) * PIXELS_PER_SECOND * zoom, 800);

  const handleSeek = useCallback((time: number) => {
    useAudioStore.getState().setCurrentTime(time);
  }, []);

  const playheadLeft = currentTime * PIXELS_PER_SECOND * zoom;

  // Ctrl+Wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const currentZoom = useAudioStore.getState().zoom;
      setZoom(currentZoom + delta * currentZoom);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  // Playhead auto-scroll during playback
  useEffect(() => {
    if (playbackState !== 'playing') return;
    const el = tracksRef.current;
    if (!el) return;

    let rafId: number;
    const autoScroll = () => {
      const time = useAudioStore.getState().currentTime;
      const headX = TRACK_LABEL_WIDTH + time * PIXELS_PER_SECOND * useAudioStore.getState().zoom;
      const viewLeft = el.scrollLeft;
      const viewRight = viewLeft + el.clientWidth;
      if (headX > viewRight - 60 || headX < viewLeft + 60) {
        el.scrollLeft = headX - el.clientWidth * 0.3;
      }
      rafId = requestAnimationFrame(autoScroll);
    };

    rafId = requestAnimationFrame(autoScroll);
    return () => cancelAnimationFrame(rafId);
  }, [playbackState]);

  // Keyboard zoom: Cmd+= / Cmd+-
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const z = useAudioStore.getState().zoom;
        setZoom(z * 1.25);
      } else if (e.key === '-') {
        e.preventDefault();
        const z = useAudioStore.getState().zoom;
        setZoom(z / 1.25);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setZoom]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 overflow-hidden bg-[var(--timeline-bg)]"
    >
      {/* Ruler row */}
      <div
        className="flex shrink-0 border-b border-[var(--editor-border)]"
        style={{ height: RULER_HEIGHT }}
      >
        <div
          className="shrink-0 border-r border-[var(--editor-border)]"
          style={{ width: TRACK_LABEL_WIDTH, minWidth: TRACK_LABEL_WIDTH }}
        />
        <div className="flex-1 overflow-hidden relative">
          <TimelineRuler
            totalDuration={totalDuration}
            zoomLevel={zoom}
            timelineWidth={timelineWidth}
            onSeek={handleSeek}
            scrollRef={tracksRef}
          />
        </div>
      </div>

      {/* Tracks area */}
      <div ref={tracksRef} className="flex-1 overflow-auto relative">
        <div className="flex flex-col" style={{ minWidth: timelineWidth + TRACK_LABEL_WIDTH }}>
          {tracks.map((track) => (
            <TrackLane
              key={track.id}
              track={track}
              zoomLevel={zoom}
              pixelsPerSecond={PIXELS_PER_SECOND}
              labelWidth={TRACK_LABEL_WIDTH}
              timelineWidth={timelineWidth}
              waveforms={waveforms}
            />
          ))}

          {tracks.length === 0 && (
            <div
              className="neko-timeline-guides flex items-center justify-center text-[13px] text-[var(--activity-inactive)]"
              style={{ height: TRACK_HEIGHT * 6, width: '100%' }}
            >
              {t('audio.timeline.empty')}
            </div>
          )}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-[var(--waveform-cursor)] pointer-events-none z-10"
          style={{ left: TRACK_LABEL_WIDTH + playheadLeft }}
        />
      </div>
    </div>
  );
}
