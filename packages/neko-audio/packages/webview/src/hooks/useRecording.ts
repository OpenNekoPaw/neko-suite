/**
 * useRecording - Microphone recording via getUserMedia + MediaRecorder
 *
 * Captures audio from the user's microphone, provides a level meter via
 * AnalyserNode, and converts the recording to base64 for postMessage transfer.
 */

import { useCallback, useRef, useState, useEffect } from 'react';

export type RecordingState = 'idle' | 'recording' | 'paused';

export interface RecordingResult {
  state: RecordingState;
  duration: number;
  level: number;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  selectDevice: (deviceId: string) => void;
}

export function useRecording(): RecordingResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef(0);
  const startTimeRef = useRef(0);
  const durationTimerRef = useRef(0);
  const resolveStopRef = useRef<((data: string | null) => void) | null>(null);

  // Enumerate audio input devices
  useEffect(() => {
    async function enumerate() {
      try {
        // Request permission first to get device labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
        setDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0]?.deviceId ?? null);
        }
      } catch {
        // Permission denied or no devices
      }
    }
    enumerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Level meter animation
  const updateLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      setLevel(0);
      return;
    }

    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);

    // RMS level
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const val = ((data[i] ?? 128) - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / data.length);
    setLevel(Math.min(1, rms * 3)); // Scale for visibility

    animFrameRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Setup analyser for level meter
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start level meter
      animFrameRef.current = requestAnimationFrame(updateLevel);

      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1] ?? '';
          resolveStopRef.current?.(base64);
          resolveStopRef.current = null;
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(100); // 100ms chunks for responsive level meter
      startTimeRef.current = Date.now();
      setState('recording');

      // Duration timer
      durationTimerRef.current = window.setInterval(() => {
        setDuration((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Recording failed: ${msg}`);
    }
  }, [selectedDeviceId, updateLevel]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }

      resolveStopRef.current = resolve;
      recorder.stop();

      // Cleanup
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(durationTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      try {
        analyserRef.current?.disconnect();
      } catch {
        // May already be disconnected
      }
      analyserRef.current = null;

      try {
        void audioCtxRef.current?.close();
      } catch {
        // May already be closed
      }
      audioCtxRef.current = null;

      setState('idle');
      setLevel(0);
    });
  }, []);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      setState('paused');
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      setState('recording');
    }
  }, []);

  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearInterval(durationTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        analyserRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        void audioCtxRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    state,
    duration,
    level,
    devices,
    selectedDeviceId,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    selectDevice,
  };
}
