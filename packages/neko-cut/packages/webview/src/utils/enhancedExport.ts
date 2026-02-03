/**
 * Enhanced Export Formats
 * 增强的导出格式支持 - GIF, PNG序列, JPEG序列
 */

import type { ProjectData } from '../types';
import type { ExportSettings, FrameRenderData } from './exportEngine';
import { calculateProjectDuration, generateFrameData } from './exportEngine';

// =============================================================================
// Extended Export Settings
// =============================================================================

export interface EnhancedExportSettings extends ExportSettings {
  format: 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'jpeg-sequence' | 'webp-sequence';
  // GIF specific
  gifColors?: number; // 2-256, default 256
  gifDither?: boolean; // default true
  gifQuality?: number; // 1-100, default 80
  // Image sequence specific
  imageQuality?: number; // 1-100, for JPEG/WebP
  frameNumberPadding?: number; // default 5 (e.g., 00001.jpg)
  // Performance
  maxConcurrentFrames?: number; // Limit memory usage
}

// =============================================================================
// GIF Export
// =============================================================================

/**
 * Export project as animated GIF
 * Uses gif.js library for encoding
 */
export async function exportToGIF(
  project: ProjectData,
  canvas: HTMLCanvasElement,
  settings: EnhancedExportSettings,
  onProgress?: (progress: number, message: string) => void
): Promise<Blob> {
  const duration = calculateProjectDuration(project);
  const totalFrames = Math.ceil(duration * settings.fps);

  // Dynamic import of gif.js (you'll need to install: npm install gif.js)
  // For now, we'll provide the structure
  const GIF = (window as any).GIF;
  if (!GIF) {
    throw new Error('GIF encoder not loaded. Please include gif.js library.');
  }

  const gif = new GIF({
    workers: Math.min(4, navigator.hardwareConcurrency || 2),
    quality: 100 - (settings.gifQuality || 80), // gif.js uses 1-100 where 1 is best
    width: settings.width,
    height: settings.height,
    workerScript: '/gif.worker.js', // You'll need to provide this
    dither: settings.gifDither !== false,
  });

  // Render frames
  const frameDuration = 1000 / settings.fps; // in ms

  for (let i = 0; i < totalFrames; i++) {
    const time = i / settings.fps;
    const frameData = generateFrameData(project, time, i, settings);

    // Render frame to canvas (implement rendering logic)
    await renderFrameToCanvas(canvas, frameData, project, settings);

    // Add frame to GIF
    gif.addFrame(canvas, { delay: frameDuration, copy: true });

    if (onProgress) {
      onProgress((i / totalFrames) * 0.9, `Encoding frame ${i + 1}/${totalFrames}`);
    }
  }

  // Render GIF
  return new Promise((resolve) => {
    gif.on('finished', (blob: Blob) => {
      if (onProgress) {
        onProgress(1, 'GIF export complete');
      }
      resolve(blob);
    });

    gif.on('progress', (p: number) => {
      if (onProgress) {
        onProgress(0.9 + p * 0.1, `Finalizing GIF: ${Math.round(p * 100)}%`);
      }
    });

    gif.render();
  });
}

// =============================================================================
// Image Sequence Export
// =============================================================================

export interface ImageSequenceFrame {
  frameNumber: number;
  blob: Blob;
  filename: string;
}

/**
 * Export project as image sequence (PNG/JPEG/WebP)
 */
export async function exportToImageSequence(
  project: ProjectData,
  canvas: HTMLCanvasElement,
  settings: EnhancedExportSettings,
  onProgress?: (progress: number, message: string) => void,
  onFrame?: (frame: ImageSequenceFrame) => void
): Promise<ImageSequenceFrame[]> {
  const duration = calculateProjectDuration(project);
  const totalFrames = Math.ceil(duration * settings.fps);
  const frames: ImageSequenceFrame[] = [];

  const mimeType = getMimeTypeForFormat(settings.format);
  const extension = getExtensionForFormat(settings.format);
  const quality = (settings.imageQuality || 95) / 100;
  const padding = settings.frameNumberPadding || 5;

  for (let i = 0; i < totalFrames; i++) {
    const time = i / settings.fps;
    const frameData = generateFrameData(project, time, i, settings);

    // Render frame to canvas
    await renderFrameToCanvas(canvas, frameData, project, settings);

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        },
        mimeType,
        quality
      );
    });

    const frameNumber = i + 1;
    const filename = `frame_${String(frameNumber).padStart(padding, '0')}${extension}`;

    const frame: ImageSequenceFrame = {
      frameNumber,
      blob,
      filename,
    };

    frames.push(frame);

    if (onFrame) {
      onFrame(frame);
    }

    if (onProgress) {
      onProgress((i + 1) / totalFrames, `Exported ${frameNumber}/${totalFrames} frames`);
    }
  }

  return frames;
}

/**
 * Download all frames as ZIP
 */
export async function downloadImageSequenceAsZip(
  frames: ImageSequenceFrame[],
  projectName: string,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  // Dynamic import of JSZip (you'll need to install: npm install jszip)
  const JSZip = (window as any).JSZip;
  if (!JSZip) {
    throw new Error('JSZip not loaded. Please include jszip library.');
  }

  const zip = new JSZip();
  const folder = zip.folder(projectName);

  if (onProgress) {
    onProgress(0, 'Creating ZIP archive...');
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    folder?.file(frame.filename, frame.blob);

    if (onProgress && i % 10 === 0) {
      onProgress((i / frames.length) * 0.9, `Adding frame ${i + 1}/${frames.length} to ZIP`);
    }
  }

  if (onProgress) {
    onProgress(0.9, 'Compressing ZIP...');
  }

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE' },
    (metadata: any) => {
      if (onProgress && metadata.percent) {
        onProgress(0.9 + metadata.percent / 1000, `Compressing: ${metadata.percent.toFixed(1)}%`);
      }
    }
  );

  // Download ZIP
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}_frames.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (onProgress) {
    onProgress(1, 'ZIP download complete');
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getMimeTypeForFormat(format: string): string {
  switch (format) {
    case 'png-sequence':
      return 'image/png';
    case 'jpeg-sequence':
      return 'image/jpeg';
    case 'webp-sequence':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function getExtensionForFormat(format: string): string {
  switch (format) {
    case 'png-sequence':
      return '.png';
    case 'jpeg-sequence':
      return '.jpg';
    case 'webp-sequence':
      return '.webp';
    default:
      return '.png';
  }
}

/**
 * Render a single frame to canvas
 * This is a placeholder - implement actual rendering logic
 */
async function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  frameData: FrameRenderData,
  _project: ProjectData,
  settings: EnhancedExportSettings
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Set canvas size if needed
  if (canvas.width !== settings.width || canvas.height !== settings.height) {
    canvas.width = settings.width;
    canvas.height = settings.height;
  }

  // Render background color (default to black if not specified)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sort elements by zIndex
  const sortedElements = [...frameData.elements].sort((a, b) => a.zIndex - b.zIndex);

  // Render each element
  for (const elementData of sortedElements) {
    await renderElement(ctx, elementData, canvas.width, canvas.height);
  }
}

/**
 * Render a single element to canvas
 */
async function renderElement(
  ctx: CanvasRenderingContext2D,
  elementData: any,
  canvasWidth: number,
  canvasHeight: number
): Promise<void> {
  const { element, transform, opacity } = elementData;

  ctx.save();

  // Apply transform
  const x = transform.x * canvasWidth;
  const y = transform.y * canvasHeight;

  ctx.translate(x, y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scaleX, transform.scaleY);
  ctx.globalAlpha = opacity;

  // Render based on element type
  if (element.type === 'media') {
    // Render video/image
    // Implementation depends on how media is loaded
  } else if (element.type === 'text') {
    // Render text
    ctx.font = `${element.fontWeight} ${element.fontStyle} ${element.fontSize}px ${element.fontFamily}`;
    ctx.fillStyle = element.color;
    ctx.textAlign = element.textAlign;
    ctx.fillText(element.content, 0, 0);
  }

  ctx.restore();
}

// =============================================================================
// Optimized Export (Batch Processing)
// =============================================================================

/**
 * Export with optimized memory usage (process in batches)
 */
export async function exportToImageSequenceOptimized(
  project: ProjectData,
  canvas: HTMLCanvasElement,
  settings: EnhancedExportSettings,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  const duration = calculateProjectDuration(project);
  const totalFrames = Math.ceil(duration * settings.fps);
  const batchSize = settings.maxConcurrentFrames || 10;

  const projectName = project.name || 'export';
  let allFrames: ImageSequenceFrame[] = [];

  // Process in batches
  for (let batchStart = 0; batchStart < totalFrames; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, totalFrames);
    const batchFrames: ImageSequenceFrame[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const time = i / settings.fps;
      const frameData = generateFrameData(project, time, i, settings);

      await renderFrameToCanvas(canvas, frameData, project, settings);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to create blob'));
          },
          getMimeTypeForFormat(settings.format),
          (settings.imageQuality || 95) / 100
        );
      });

      const frameNumber = i + 1;
      const filename = `frame_${String(frameNumber).padStart(settings.frameNumberPadding || 5, '0')}${getExtensionForFormat(settings.format)}`;

      batchFrames.push({
        frameNumber,
        blob,
        filename,
      });

      if (onProgress) {
        onProgress(
          (i + 1) / totalFrames * 0.8,
          `Processing batch ${Math.floor(batchStart / batchSize) + 1}: frame ${i + 1}/${totalFrames}`
        );
      }
    }

    allFrames = allFrames.concat(batchFrames);
  }

  // Create ZIP
  await downloadImageSequenceAsZip(allFrames, projectName, (progress, message) => {
    if (onProgress) {
      onProgress(0.8 + progress * 0.2, message);
    }
  });
}

// =============================================================================
// Export Presets
// =============================================================================

export const EXPORT_PRESETS: Record<string, Partial<EnhancedExportSettings>> = {
  // GIF presets
  'gif-small': {
    format: 'gif',
    width: 480,
    height: 270,
    fps: 15,
    gifColors: 128,
    gifQuality: 60,
  },
  'gif-medium': {
    format: 'gif',
    width: 640,
    height: 360,
    fps: 24,
    gifColors: 256,
    gifQuality: 80,
  },
  'gif-large': {
    format: 'gif',
    width: 800,
    height: 450,
    fps: 30,
    gifColors: 256,
    gifQuality: 90,
  },

  // PNG sequence presets
  'png-hd': {
    format: 'png-sequence',
    width: 1920,
    height: 1080,
    fps: 30,
  },
  'png-4k': {
    format: 'png-sequence',
    width: 3840,
    height: 2160,
    fps: 30,
  },

  // JPEG sequence presets
  'jpeg-hd-high': {
    format: 'jpeg-sequence',
    width: 1920,
    height: 1080,
    fps: 30,
    imageQuality: 95,
  },
  'jpeg-hd-medium': {
    format: 'jpeg-sequence',
    width: 1920,
    height: 1080,
    fps: 30,
    imageQuality: 85,
  },
};
