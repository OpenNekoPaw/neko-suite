/**
 * StreamingVideoDiffViewer — Real-time H264 dual-stream video diff.
 *
 * Connects two H264StreamClients to the frame server, pairs decoded
 * VideoFrames via FramePairBuffer, and renders diffs via WebGL DiffRenderer.
 *
 * Seek handling follows the neko-preview pattern:
 * 1. Arm seekFilter — reject stale pre-seek frames still in WebSocket buffer
 * 2. Flush FramePairBuffer — discard queued frames
 * 3. Reset H264 decoders — start clean from next keyframe
 */

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import { H264StreamClient, AudioStreamClient } from '@neko/neko-client';
import { FramePairBuffer } from './FramePairBuffer';
import { DiffRenderer, type DiffMode } from './DiffRenderer';
import type { StreamConfig } from '@neko/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StreamingVideoDiffViewerProps {
  streamConfig: StreamConfig;
  diffMode: DiffMode;
  sliderPosition: number;
  onSliderChange?: (pos: number) => void;
  /** Send stream control messages (play/pause/seek) to extension */
  onStreamControl?: (
    action: 'play' | 'pause' | 'seek',
    payload?: { time?: number; speed?: number },
  ) => void;
  /** Report current playback time (seconds) from frame PTS */
  onTimeUpdate?: (time: number) => void;
  /** Report stream errors to parent for UI visibility */
  onError?: (error: string) => void;
  /** Pre-created AudioContext from user gesture to satisfy autoplay policy */
  audioContext?: AudioContext;
  /** Called when either video stream reaches end-of-stream */
  onStreamEnd?: () => void;
}

/** Imperative handle exposed via ref for parent-driven seek and static rendering */
export interface StreamingVideoDiffViewerHandle {
  /** Locally reset decoders and buffers for a seek at `time` (seconds) */
  seek(time: number): void;
  /** Render a static frame pair (Blob URLs) through the existing DiffRenderer */
  renderStaticPair(blobUrlA: string, blobUrlB: string): Promise<void>;
  /** Pause audio output (mute + discard incoming packets) */
  pauseAudio(): void;
  /** Resume audio output */
  resumeAudio(): void;
}

// ─── Seek filter tolerance (seconds) ─────────────────────────────────────────
// Frames arriving with PTS more than this far from seek target are rejected.
// Matches neko-preview's 2-second tolerance.
const SEEK_FILTER_TOLERANCE_SEC = 2.0;

// ─── Component ───────────────────────────────────────────────────────────────

export const StreamingVideoDiffViewer = memo(
  forwardRef<StreamingVideoDiffViewerHandle, StreamingVideoDiffViewerProps>(
    function StreamingVideoDiffViewer(
      {
        streamConfig,
        diffMode,
        sliderPosition,
        onSliderChange,
        onTimeUpdate,
        onError,
        audioContext,
        onStreamEnd,
      },
      ref,
    ) {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const rendererRef = useRef<DiffRenderer | null>(null);
      const bufferRef = useRef<FramePairBuffer | null>(null);
      const clientARef = useRef<H264StreamClient | null>(null);
      const clientBRef = useRef<H264StreamClient | null>(null);
      const audioClientRef = useRef<AudioStreamClient | null>(null);
      const containerRef = useRef<HTMLDivElement>(null);

      // ── Slider drag state ────────────────────────────────────────────────
      const isDraggingRef = useRef(false);

      // ── Seek filter state (neko-preview pattern) ─────────────────────────
      // When set, onFrame rejects stale pre-seek frames whose PTS is far
      // from the target. Cleared when the first valid post-seek frame arrives.
      const seekFilterRef = useRef<number | null>(null);

      // ── Expose seek handle to parent ─────────────────────────────────────
      useImperativeHandle(
        ref,
        () => ({
          seek(time: number) {
            // 1. Arm seek filter — reject stale WebSocket-buffered frames
            seekFilterRef.current = time;
            // 2. Flush FramePairBuffer — discard queued frames
            bufferRef.current?.flush();
            // 3. Reset H264 decoders — start clean from next keyframe
            clientARef.current?.resetDecoder();
            clientBRef.current?.resetDecoder();
            // 4. Reset audio clock for seek
            audioClientRef.current?.resetClock();
          },
          async renderStaticPair(blobUrlA: string, blobUrlB: string) {
            const renderer = rendererRef.current;
            if (!renderer) return;
            const [blobA, blobB] = await Promise.all([
              fetch(blobUrlA).then((r) => r.blob()),
              fetch(blobUrlB).then((r) => r.blob()),
            ]);
            const [bitmapA, bitmapB] = await Promise.all([
              createImageBitmap(blobA),
              createImageBitmap(blobB),
            ]);
            // renderPair accepts DiffFrame (VideoFrame | ImageBitmap) and closes them
            renderer.renderPair(bitmapA, bitmapB);
          },
          pauseAudio() {
            audioClientRef.current?.pause();
          },
          resumeAudio() {
            audioClientRef.current?.resume();
          },
        }),
        [],
      );

      // ── Setup streaming pipeline ─────────────────────────────────────────
      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const {
          port,
          currentStreamId,
          previousStreamId,
          currentAudioStreamId,
          width,
          height,
          fps,
        } = streamConfig;

        console.log('[StreamingDiff] Pipeline setup:', {
          port,
          currentStreamId,
          previousStreamId,
          width,
          height,
          fps,
        });

        // 1. Create DiffRenderer (WebGL)
        const renderer = new DiffRenderer({ canvas, width, height });
        renderer.setMode(diffMode);
        renderer.setSliderPosition(sliderPosition);
        rendererRef.current = renderer;

        // 2. Create FramePairBuffer
        const halfFrameUs = 1_000_000 / fps / 2; // half-frame tolerance in microseconds
        let pairCount = 0;
        let singleCount = 0;
        const buffer = new FramePairBuffer({
          toleranceUs: halfFrameUs,
          maxBufferSize: 10,
          onPair: (pair) => {
            pairCount++;
            if (pairCount <= 3 || pairCount % 30 === 0) {
              console.log(
                `[StreamingDiff] Pair #${pairCount}: PTS A=${pair.frameA.timestamp} B=${pair.frameB.timestamp}`,
              );
            }
            renderer.renderPair(pair.frameA, pair.frameB);
            // Report current time from frame PTS
            const timeSec = pair.frameA.timestamp / 1_000_000;
            onTimeUpdate?.(timeSec);
          },
          onSingle: (frame, side) => {
            singleCount++;
            if (singleCount <= 3 || singleCount % 30 === 0) {
              console.log(
                `[StreamingDiff] Single #${singleCount}: side=${side} PTS=${frame.timestamp}`,
              );
            }
            renderer.renderSingle(frame, side);
            // Report current time
            const timeSec = frame.timestamp / 1_000_000;
            onTimeUpdate?.(timeSec);
          },
        });
        bufferRef.current = buffer;

        // 3. Create H264 stream clients with seek-filter-aware onFrame callbacks
        const baseUrl = `ws://127.0.0.1:${port}/v1/streams`;

        const filterFrame = (frame: VideoFrame, feed: (f: VideoFrame) => void) => {
          const seekTarget = seekFilterRef.current;
          if (seekTarget !== null) {
            const frameSec = frame.timestamp / 1_000_000;
            if (Math.abs(frameSec - seekTarget) > SEEK_FILTER_TOLERANCE_SEC) {
              // Stale pre-seek frame — discard
              frame.close();
              return;
            }
            // First valid frame near seek target — disable filter
            seekFilterRef.current = null;
          }
          feed(frame);
        };

        let frameCountA = 0;
        let frameCountB = 0;

        const clientA = new H264StreamClient({
          websocketUrl: `${baseUrl}/${currentStreamId}`,
          width,
          height,
          onFrame: (frame) => {
            frameCountA++;
            if (frameCountA <= 5 || frameCountA % 60 === 0) {
              console.log(
                `[StreamingDiff] Frame A #${frameCountA}: PTS=${frame.timestamp} size=${frame.displayWidth}x${frame.displayHeight}`,
              );
            }
            filterFrame(frame, (f) => buffer.feedA(f));
          },
          onError: (err) => {
            console.error('[StreamingDiff] Stream A error:', err);
            onError?.(err.message);
          },
          onConnectionChange: (connected) => {
            console.log(`[StreamingDiff] Stream A connection: ${connected ? 'OPEN' : 'CLOSED'}`);
          },
          onStreamEnd: () => {
            console.log('[StreamingDiff] Stream A ended (EOF)');
            buffer.markEndOfStream('A');
            onStreamEnd?.();
          },
        });

        const clientB = new H264StreamClient({
          websocketUrl: `${baseUrl}/${previousStreamId}`,
          width,
          height,
          onFrame: (frame) => {
            frameCountB++;
            if (frameCountB <= 5 || frameCountB % 60 === 0) {
              console.log(
                `[StreamingDiff] Frame B #${frameCountB}: PTS=${frame.timestamp} size=${frame.displayWidth}x${frame.displayHeight}`,
              );
            }
            filterFrame(frame, (f) => buffer.feedB(f));
          },
          onError: (err) => {
            console.error('[StreamingDiff] Stream B error:', err);
            onError?.(err.message);
          },
          onConnectionChange: (connected) => {
            console.log(`[StreamingDiff] Stream B connection: ${connected ? 'OPEN' : 'CLOSED'}`);
          },
          onStreamEnd: () => {
            console.log('[StreamingDiff] Stream B ended (EOF)');
            buffer.markEndOfStream('B');
            onStreamEnd?.();
          },
        });

        clientARef.current = clientA;
        clientBRef.current = clientB;

        // 4. Connect both video streams
        void clientA.connect();
        void clientB.connect();

        // 5. Create AudioStreamClient if audio track exists
        console.log('[StreamingDiff] Audio setup:', {
          currentAudioStreamId,
          hasAudioContext: !!audioContext,
          audioContextState: audioContext?.state,
        });
        if (currentAudioStreamId) {
          const audioClient = new AudioStreamClient({
            websocketUrl: `${baseUrl}/${currentAudioStreamId}`,
            volume: 1.0,
            onError: (err) => {
              console.error('[StreamingDiff] Audio error:', err);
            },
            onConnectionChange: (connected) => {
              console.log(`[StreamingDiff] Audio connection: ${connected ? 'OPEN' : 'CLOSED'}`);
            },
            onStreamEnd: () => {
              console.log('[StreamingDiff] Audio stream ended (EOF)');
            },
          });
          audioClientRef.current = audioClient;
          void audioClient.connect(audioContext);
        } else {
          console.log('[StreamingDiff] No audio stream ID — skipping audio');
        }

        // 6. Cleanup
        return () => {
          clientA.dispose();
          clientB.dispose();
          audioClientRef.current?.dispose();
          buffer.dispose();
          renderer.dispose();
          clientARef.current = null;
          clientBRef.current = null;
          audioClientRef.current = null;
          bufferRef.current = null;
          rendererRef.current = null;
          seekFilterRef.current = null;
        };
      }, [streamConfig]); // Re-create pipeline only when config changes

      // ── Sync diff mode ───────────────────────────────────────────────────
      useEffect(() => {
        rendererRef.current?.setMode(diffMode);
      }, [diffMode]);

      // ── Sync slider position ─────────────────────────────────────────────
      useEffect(() => {
        rendererRef.current?.setSliderPosition(sliderPosition);
      }, [sliderPosition]);

      // ── Slider drag handlers (for curtain mode) ──────────────────────────
      const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
          if (diffMode !== 'curtain') return;
          isDraggingRef.current = true;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          onSliderChange?.(Math.max(0, Math.min(1, pos)));
        },
        [diffMode, onSliderChange],
      );

      const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
          if (!isDraggingRef.current || diffMode !== 'curtain') return;
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          onSliderChange?.(Math.max(0, Math.min(1, pos)));
        },
        [diffMode, onSliderChange],
      );

      const handlePointerUp = useCallback(() => {
        isDraggingRef.current = false;
      }, []);

      return (
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden bg-black relative"
        >
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain"
            style={{ cursor: diffMode === 'curtain' ? 'col-resize' : 'default' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {/* Curtain mode slider line indicator */}
          {diffMode === 'curtain' && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/60 pointer-events-none"
              style={{ left: `${sliderPosition * 100}%` }}
            />
          )}
        </div>
      );
    },
  ),
);

export default StreamingVideoDiffViewer;
