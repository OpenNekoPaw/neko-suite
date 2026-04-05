/**
 * CanvasRecorder — captures the viewport canvas as WebM video.
 *
 * Uses canvas.captureStream() + MediaRecorder API, available in
 * VSCode's Electron/Chromium webview without restrictions.
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
   * Finds the canvas in the viewport container automatically.
   */
  start(canvas: HTMLCanvasElement, options: CanvasRecorderOptions = {}): boolean {
    if (this._isRecording) return false;

    const fps = options.fps ?? 30;
    const stream = canvas.captureStream(fps);

    // Check for supported codec
    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      console.error('[CanvasRecorder] No supported video MIME type');
      return false;
    }

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond ?? 2_500_000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000); // Request data every 1s
    this._isRecording = true;
    return true;
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
