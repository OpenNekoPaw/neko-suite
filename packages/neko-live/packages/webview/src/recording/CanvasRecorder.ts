/**
 * CanvasRecorder — captures the viewport canvas as WebM video.
 *
 * Uses canvas.captureStream() + MediaRecorder API, available in
 * VSCode's Electron/Chromium webview.
 *
 * The recorded blob is sent back to the extension host as a data URL
 * for saving to disk (webview has no fs access).
 */

export interface CanvasRecorderOptions {
  fps?: number;
  videoBitsPerSecond?: number;
}

export class CanvasRecorder {
  private mediaRecorder: MediaRecorder | undefined;
  private chunks: Blob[] = [];
  private _isRecording = false;

  get isRecording(): boolean {
    return this._isRecording;
  }

  /**
   * Start recording the given canvas element.
   * Returns an error message on failure, or undefined on success.
   */
  start(canvas: HTMLCanvasElement, options: CanvasRecorderOptions = {}): string | undefined {
    if (this._isRecording) return 'Already recording';

    const fps = options.fps ?? 30;

    // Check API availability
    if (typeof canvas.captureStream !== 'function') {
      return 'canvas.captureStream not available in this environment';
    }

    let stream: MediaStream;
    try {
      stream = canvas.captureStream(fps);
    } catch (err) {
      return `captureStream failed: ${(err as Error).message}`;
    }

    if (!stream.getVideoTracks().length) {
      return 'captureStream returned no video tracks';
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      return 'No supported video MIME type (need WebM VP8/VP9)';
    }

    this.chunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: options.videoBitsPerSecond ?? 2_500_000,
      });
    } catch (err) {
      return `MediaRecorder creation failed: ${(err as Error).message}`;
    }

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000);
    this._isRecording = true;
    return undefined;
  }

  /**
   * Stop recording and return the video as a Blob.
   */
  async stop(): Promise<Blob | null> {
    if (!this.mediaRecorder || !this._isRecording) return null;

    return new Promise((resolve) => {
      this.mediaRecorder!.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder!.mimeType });
        this.chunks = [];
        this._isRecording = false;
        resolve(blob);
      };

      this.mediaRecorder!.stop();
    });
  }

  /**
   * Convert a blob to a base64 data URL for sending via postMessage.
   */
  static async blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

function getSupportedMimeType(): string | undefined {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m));
}
