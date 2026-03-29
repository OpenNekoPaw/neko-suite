/**
 * StoryboardExport - Export storyboard data in three formats:
 *
 * 1. PDF  — one page per shot (image + metadata), cover page with scene list
 *           Requires: `pnpm --filter neko-canvas-webview add jspdf`
 *
 * 2. ZIP  — flat image pack + manifest.json with all shot metadata
 *           Requires: `pnpm --filter neko-canvas-webview add jszip`
 *
 * 3. neko-cut timeline — postMessage to extension to import as MediaElement sequence
 *           No extra deps needed.
 *
 * Design: all functions are pure/stateless and receive canvas data as args,
 * making them easy to test independently of the React component tree.
 */

import type { ShotCanvasNode, SceneGroupCanvasNode } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface StoryboardExportData {
  /** Project / canvas name, used for file naming and PDF cover */
  projectName: string;
  scenes: SceneGroupCanvasNode[];
  shots: ShotCanvasNode[];
}

export interface ExportManifestShot {
  id: string;
  shotNumber: number;
  sceneId?: string;
  sceneTitle?: string;
  shotScale?: string;
  cameraMovement?: string;
  cameraAngle?: string;
  duration: number;
  visualDescription: string;
  characters: string[];
  emotion: string[];
  dialogue?: string;
  voiceOver?: string;
  soundCue?: string;
  /** Filename inside ZIP (e.g. "shots/001_MS_Alice.png"), or undefined if not generated */
  imageFile?: string;
}

export interface ExportManifest {
  projectName: string;
  exportedAt: string;
  totalShots: number;
  shots: ExportManifestShot[];
}

// =============================================================================
// Internal helpers
// =============================================================================

function buildManifestShot(
  shot: ShotCanvasNode,
  scenes: SceneGroupCanvasNode[],
  withImageFile: boolean,
): ExportManifestShot {
  const scene = scenes.find((s) => s.data.shotIds.includes(shot.id));
  const paddedNum = String(shot.data.shotNumber).padStart(3, '0');
  const scale = shot.data.shotScale ?? 'MS';
  const mainChar = shot.data.characters[0]?.characterName ?? '';
  const fileName = `shots/${paddedNum}_${scale}${mainChar ? `_${mainChar}` : ''}.png`;

  return {
    id: shot.id,
    shotNumber: shot.data.shotNumber,
    sceneId: scene?.id,
    sceneTitle: scene?.data.sceneTitle,
    shotScale: shot.data.shotScale,
    cameraMovement: shot.data.cameraMovement,
    cameraAngle: shot.data.cameraAngle,
    duration: shot.data.duration,
    visualDescription: shot.data.visualDescription,
    characters: shot.data.characters.map((c) => c.characterName),
    emotion: shot.data.emotion,
    dialogue: shot.data.dialogue,
    voiceOver: shot.data.voiceOver,
    soundCue: shot.data.soundCue,
    imageFile: withImageFile && shot.data.generatedImage ? fileName : undefined,
  };
}

/** Convert a base64 data URL to a Uint8Array. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('Invalid data URL');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// =============================================================================
// PDF export
// =============================================================================

/**
 * exportToPDF — Generates a storyboard PDF and triggers browser download.
 *
 * Layout per shot page (A4 landscape):
 *   Left  50%: generated image or grey placeholder
 *   Right 50%: shot metadata (scale / camera / characters / emotion / dialogue)
 * First page: cover with project name + scene list.
 *
 * TODO(P2): implement once jsPDF is installed.
 *   Run: `pnpm --filter neko-canvas-webview add jspdf`
 */
export async function exportToPDF(_data: StoryboardExportData): Promise<void> {
  throw new Error(
    'exportToPDF: jsPDF not yet installed.\n' + 'Run: pnpm --filter neko-canvas-webview add jspdf',
  );
}

// =============================================================================
// ZIP export
// =============================================================================

/**
 * exportToZip — Packs all generated images + manifest.json into a ZIP.
 *
 * Structure:
 *   shots/001_MS_Alice.png
 *   shots/002_LS.png
 *   manifest.json
 *
 * TODO(P2): implement once JSZip is installed.
 *   Run: `pnpm --filter neko-canvas-webview add jszip`
 */
export async function exportToZip(_data: StoryboardExportData): Promise<void> {
  throw new Error(
    'exportToZip: JSZip not yet installed.\n' + 'Run: pnpm --filter neko-canvas-webview add jszip',
  );
}

// =============================================================================
// neko-cut timeline import
// =============================================================================

export interface TimelineShot {
  id: string;
  shotNumber: number;
  duration: number;
  imageDataUrl?: string;
  dialogue?: string;
  voiceOver?: string;
  soundCue?: string;
  label: string;
}

/**
 * buildTimelineShots — Converts ShotNodes to the format neko-cut expects.
 * Exported separately so callers can inspect the payload before sending.
 */
export function buildTimelineShots(shots: ShotCanvasNode[]): TimelineShot[] {
  return [...shots]
    .sort((a, b) => a.data.shotNumber - b.data.shotNumber)
    .map((shot) => ({
      id: shot.id,
      shotNumber: shot.data.shotNumber,
      duration: shot.data.duration,
      imageDataUrl: shot.data.generatedImage,
      dialogue: shot.data.dialogue,
      voiceOver: shot.data.voiceOver,
      soundCue: shot.data.soundCue,
      label:
        `#${String(shot.data.shotNumber).padStart(3, '0')} ${shot.data.shotScale ?? ''}`.trim(),
    }));
}

/**
 * buildExportManifest — Builds the manifest without writing a ZIP.
 * Useful for previewing or logging what would be exported.
 */
export function buildExportManifest(data: StoryboardExportData): ExportManifest {
  const orderedShots = [...data.shots].sort((a, b) => a.data.shotNumber - b.data.shotNumber);
  return {
    projectName: data.projectName,
    exportedAt: new Date().toISOString(),
    totalShots: data.shots.length,
    shots: orderedShots.map((shot) => buildManifestShot(shot, data.scenes, true)),
  };
}

/**
 * exportToNekoCut — Posts a message to the extension host requesting timeline import.
 * The extension then calls `neko.cut.importStoryboard`, which creates a MediaElement
 * sequence + optional subtitle track (dialogue) + voice-over track.
 */
export function exportToNekoCut(
  data: StoryboardExportData,
  postMessage: (msg: unknown) => void,
): void {
  const shots = buildTimelineShots(data.shots);
  postMessage({
    type: 'importToTimeline',
    projectName: data.projectName,
    shots,
  });
}

/**
 * triggerDownload — Helper to programmatically save a Blob with a given filename.
 * Used by both PDF and ZIP exporters.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Re-export for external consumers that need access to the byte converter
export { dataUrlToBytes };
