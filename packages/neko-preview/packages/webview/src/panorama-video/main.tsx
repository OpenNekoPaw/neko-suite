import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioStreamClient, FrameScheduler, H264StreamClient } from '@neko/neko-client';
import { DEFAULT_PANORAMA_VIEW_STATE, type PanoramaViewState } from '@neko/shared';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import type { PanoramaInitMessage, PreviewStreamReadyMessage } from '../shared/types';
import { ViewStateController } from '../panorama-image/viewStateController';
import { PanoramicVideoRenderer } from './panoramicVideoRenderer';
import '../styles/panorama.css';

function PanoramaVideoApp(): JSX.Element {
  const { postMessage } = useVscodeReady();
  const [init, setInit] = useState<PanoramaInitMessage['payload'] | null>(null);
  const [stream, setStream] = useState<PreviewStreamReadyMessage['payload'] | null>(null);
  const controller = useMemo(() => new ViewStateController(DEFAULT_PANORAMA_VIEW_STATE), []);
  const [viewState, setViewState] = useState(controller.state);
  const [playing, setPlaying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [flatFallback, setFlatFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PanoramicVideoRenderer | null>(null);
  const clientRef = useRef<H264StreamClient | null>(null);
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const playbackStartRef = useRef({ mediaTime: 0, wallTime: 0 });
  const viewStateRef = useRef(viewState);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new PanoramicVideoRenderer(canvas);
    if (renderer.initialize()) {
      rendererRef.current = renderer;
      setWebglAvailable(true);
    } else {
      setFlatFallback(true);
    }
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const renderFrame = useCallback((frame: VideoFrame) => {
    const renderer = rendererRef.current;
    if (renderer?.renderFrame(frame, viewStateRef.current)) {
      frame.close();
      return;
    }
    const canvas = fallbackCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      frame.close();
      return;
    }
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
    }
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    setFlatFallback(true);
    frame.close();
  }, []);

  useExtensionMessage((message) => {
    if (message.type === 'panorama:init') {
      setInit((message as PanoramaInitMessage).payload);
    }
    if (message.type === 'preview:streamReady') {
      setStream((message as PreviewStreamReadyMessage).payload);
    }
    if (message.type === 'panorama:error') {
      setError(message.payload.message);
    }
  });

  useEffect(() => {
    if (!stream?.streamUrl || !init) return;
    clientRef.current?.dispose();
    audioClientRef.current?.dispose();
    schedulerRef.current?.dispose();
    const scheduler = new FrameScheduler(init.manifest.media.codec?.fps ?? 25);
    schedulerRef.current = scheduler;
    const client = new H264StreamClient({
      websocketUrl: stream.streamUrl,
      width: init.manifest.media.dimensions?.width ?? 1920,
      height: init.manifest.media.dimensions?.height ?? 1080,
      onFrame: (frame) => scheduler.enqueue(frame),
      onConnectionChange: setConnected,
      onError: (nextError) => setError(nextError.message),
      onStreamEnd: () => {
        setPlaying(false);
        postMessage({ type: 'preview:eof' });
      },
    });
    clientRef.current = client;
    void client.connect();

    let audioClient: AudioStreamClient | null = null;
    if (stream.audioStreamUrl) {
      audioClient = new AudioStreamClient({
        websocketUrl: stream.audioStreamUrl,
        onError: (nextError) => setError(nextError.message),
      });
      audioClientRef.current = audioClient;
      void audioClient.connect(audioContextRef.current ?? undefined);
    }

    return () => {
      client.dispose();
      audioClient?.dispose();
      scheduler.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      if (audioClientRef.current === audioClient) {
        audioClientRef.current = null;
      }
      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null;
      }
    };
  }, [init, postMessage, stream]);

  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      const audioClock = audioClientRef.current;
      const mediaTime = audioClock?.isClockReady
        ? audioClock.getCurrentTime()
        : playbackStartRef.current.mediaTime +
          (performance.now() - playbackStartRef.current.wallTime) / 1000;
      const result = schedulerRef.current?.schedule(mediaTime * 1_000_000);
      if (result?.action === 'render' && result.frame) {
        renderFrame(result.frame);
      }
      setCurrentTime(mediaTime);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, renderFrame]);

  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      audioClientRef.current?.dispose();
      schedulerRef.current?.dispose();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close().catch(() => {});
      }
      postMessage({ type: 'preview:stop' });
    };
  }, [postMessage]);

  const startPlayback = useCallback(() => {
    if (!init) return;
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
    }
    audioContextRef.current.resume().catch(() => {});
    if (stream) return;
    postMessage({ type: 'preview:play', startTime: currentTime, speed: 1 });
    playbackStartRef.current = { mediaTime: currentTime, wallTime: performance.now() };
    setPlaying(true);
  }, [currentTime, init, postMessage, stream]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    setConnected(false);
    setStream(null);
    schedulerRef.current?.flush();
    audioClientRef.current?.pause();
    clientRef.current?.dispose();
    audioClientRef.current?.dispose();
    schedulerRef.current?.dispose();
    clientRef.current = null;
    audioClientRef.current = null;
    schedulerRef.current = null;
    postMessage({ type: 'preview:stop' });
  }, [postMessage]);

  if (!init) {
    return <main className="panorama-loading">Loading panorama…</main>;
  }

  return (
    <main className="panorama-shell panorama-video-shell">
      <section className="panorama-stage">
        <div
          className="panorama-viewport"
          role="application"
          tabIndex={0}
          aria-label={init.manifest.sourceName}
          onPointerDown={(event) => {
            pointerRef.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const previous = pointerRef.current;
            if (!previous) return;
            setViewState(
              controller.applyDrag(event.clientX - previous.x, event.clientY - previous.y),
            );
            pointerRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            pointerRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            pointerRef.current = null;
          }}
          onWheel={(event) => {
            event.preventDefault();
            setViewState(controller.applyWheel(event.deltaY));
          }}
          onKeyDown={(event) => {
            const next = applyKeyboardView(event, controller);
            if (!next) return;
            event.preventDefault();
            setViewState(next);
          }}
        >
          <canvas
            ref={canvasRef}
            className={webglAvailable ? 'panorama-canvas' : 'panorama-canvas is-hidden'}
          />
          <canvas
            ref={fallbackCanvasRef}
            className={flatFallback ? 'panorama-canvas' : 'panorama-canvas is-hidden'}
          />
          {flatFallback ? <div className="fallback-badge">Flat fallback</div> : null}
        </div>
      </section>
      <aside className="panorama-inspector">
        <div>
          <h1>{init.manifest.sourceName}</h1>
          <p>
            {connected ? 'connected' : stream ? 'connecting' : 'stream pending'} ·{' '}
            {webglAvailable ? 'sphere' : 'flat'}
          </p>
        </div>
        {error ? <div className="variant-status is-error">{error}</div> : null}
        <dl className="metadata-grid">
          <div>
            <dt>Dimensions</dt>
            <dd>{formatDimensions(init.manifest.media.dimensions)}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{currentTime.toFixed(1)}s</dd>
          </div>
          <div>
            <dt>View</dt>
            <dd>
              {viewState.yawDeg.toFixed(0)} / {viewState.pitchDeg.toFixed(0)} /{' '}
              {viewState.fovDeg.toFixed(0)}
            </dd>
          </div>
        </dl>
        <div className="semantic-actions">
          <button type="button" onClick={playing ? stopPlayback : startPlayback}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewState(controller.reset(DEFAULT_PANORAMA_VIEW_STATE));
            }}
          >
            Reset
          </button>
          <button type="button" onClick={stopPlayback}>
            Stop
          </button>
        </div>
      </aside>
    </main>
  );
}

function applyKeyboardView(
  event: React.KeyboardEvent,
  controller: ViewStateController,
): PanoramaViewState | null {
  switch (event.key) {
    case 'ArrowLeft':
      return controller.applyDrag(18, 0);
    case 'ArrowRight':
      return controller.applyDrag(-18, 0);
    case 'ArrowUp':
      return controller.applyDrag(0, 18);
    case 'ArrowDown':
      return controller.applyDrag(0, -18);
    case '+':
    case '=':
      return controller.applyWheel(-120);
    case '-':
    case '_':
      return controller.applyWheel(120);
    case '0':
    case 'Home':
      return controller.reset();
    default:
      return null;
  }
}

function formatDimensions(dimensions: { width: number; height: number } | undefined): string {
  if (!dimensions) return 'Unknown';
  return `${dimensions.width} x ${dimensions.height}`;
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PanoramaVideoApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
