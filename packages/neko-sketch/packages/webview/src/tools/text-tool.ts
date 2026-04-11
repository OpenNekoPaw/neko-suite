/**
 * Text Tool
 *
 * Renders text to an offscreen Canvas2D, then uploads as a WebGL texture.
 * Text layers are re-editable by double-clicking to enter edit mode.
 */

export interface TextLayerData {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly align: 'left' | 'center' | 'right';
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strokeWidth: number;
  readonly strokeColor: string;
}

export const DEFAULT_TEXT_DATA: TextLayerData = {
  text: 'Text',
  fontFamily: 'sans-serif',
  fontSize: 48,
  color: '#ffffff',
  align: 'left',
  bold: false,
  italic: false,
  strokeWidth: 0,
  strokeColor: '#000000',
};

/**
 * Render text to an ImageData suitable for uploading to a WebGL texture.
 * Returns ImageData with premultiplied alpha.
 */
export function renderTextToImageData(
  data: TextLayerData,
  width: number,
  height: number,
  x: number,
  y: number,
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new ImageData(width, height);

  const style = `${data.italic ? 'italic ' : ''}${data.bold ? 'bold ' : ''}${data.fontSize}px ${data.fontFamily}`;
  ctx.font = style;
  ctx.textAlign = data.align;
  ctx.textBaseline = 'top';

  // Stroke first if requested
  if (data.strokeWidth > 0) {
    ctx.strokeStyle = data.strokeColor;
    ctx.lineWidth = data.strokeWidth;
    ctx.lineJoin = 'round';

    const lines = data.text.split('\n');
    let lineY = y;
    for (const line of lines) {
      ctx.strokeText(line, x, lineY);
      lineY += data.fontSize * 1.2;
    }
  }

  // Fill text
  ctx.fillStyle = data.color;
  const lines = data.text.split('\n');
  let lineY = y;
  for (const line of lines) {
    ctx.fillText(line, x, lineY);
    lineY += data.fontSize * 1.2;
  }

  return ctx.getImageData(0, 0, width, height);
}
