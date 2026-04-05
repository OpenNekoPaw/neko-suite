/**
 * INP binary parser — extracts textures from TEX_SECT.
 *
 * INP layout:
 *   [0..8]    "TRNSRTS\0"
 *   [8..12]   u32 BE: JSON length
 *   [12..N]   JSON payload
 *   [N..N+8]  "TEX_SECT"
 *   [N+8..12] u32 BE: texture count
 *   Per texture: u32 BE length + u8 encoding (0=PNG) + raw bytes
 */

function readU32BE(data: Uint8Array, offset: number): number {
  return (
    (((data[offset] ?? 0) << 24) |
      ((data[offset + 1] ?? 0) << 16) |
      ((data[offset + 2] ?? 0) << 8) |
      (data[offset + 3] ?? 0)) >>>
    0
  );
}

/**
 * Extract texture images from an INP binary buffer.
 * Returns an array of ImageBitmap (one per texture in the file).
 */
export async function parseInpTextures(data: Uint8Array): Promise<ImageBitmap[]> {
  // Skip MAGIC (8 bytes) + JSON length (4 bytes) + JSON payload
  const jsonLen = readU32BE(data, 8);
  let offset = 12 + jsonLen;

  // Skip TEX_SECT header (8 bytes)
  offset += 8;

  // Read texture count
  const texCount = readU32BE(data, offset);
  offset += 4;

  const textures: ImageBitmap[] = [];

  for (let i = 0; i < texCount; i++) {
    const texLen = readU32BE(data, offset);
    offset += 4;

    const encoding = data[offset];
    offset += 1;

    const texBytes = data.slice(offset, offset + texLen);
    offset += texLen;

    // Only PNG (encoding=0) and TGA (encoding=1) supported; create blob for PNG
    const mimeType = encoding === 0 ? 'image/png' : encoding === 1 ? 'image/tga' : null;
    if (mimeType === 'image/png') {
      const blob = new Blob([texBytes], { type: mimeType });
      const bitmap = await createImageBitmap(blob);
      textures.push(bitmap);
    } else {
      // TGA or unsupported — create a 1x1 fallback
      const fallback = await createImageBitmap(new ImageData(1, 1));
      textures.push(fallback);
    }
  }

  return textures;
}
