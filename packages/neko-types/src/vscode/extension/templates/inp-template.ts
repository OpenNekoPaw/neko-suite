/**
 * Generates Inochi2D (.inp) binary files in TypeScript.
 *
 * INP format:
 *   [0..8]    Magic: "TRNSRTS\0"
 *   [8..12]   u32 BE: JSON payload length
 *   [12..N]   UTF-8 JSON: puppet definition
 *   [N..N+8]  "TEX_SECT" header
 *   [N+8..12] u32 BE: texture count
 *   Per texture:
 *     u32 BE: data length
 *     u8: encoding (0=PNG)
 *     raw bytes: image data
 */

// ── Binary helpers ──────────────────────────────────────────────────────────

const MAGIC = new Uint8Array([0x54, 0x52, 0x4e, 0x53, 0x52, 0x54, 0x53, 0x00]); // "TRNSRTS\0"
const TEX_SECT = new Uint8Array([0x54, 0x45, 0x58, 0x5f, 0x53, 0x45, 0x43, 0x54]); // "TEX_SECT"

function writeU32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, false); // big-endian
  return buf;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// ── Minimal PNG generator ───────────────────────────────────────────────────

/** CRC32 for PNG chunks */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngU32BE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, false);
  return buf;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concat(typeBytes, data);
  const crc = crc32(crcInput);
  return concat(pngU32BE(data.length), typeBytes, data, pngU32BE(crc));
}

/**
 * Generate a tiny solid-color PNG image (no compression libraries needed).
 * Uses uncompressed deflate blocks (store mode).
 */
function generateSolidPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number,
): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit depth 8, color type 6 (RGBA)
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data: filter byte (0) + RGBA pixels per row
  const rowBytes = 1 + width * 4;
  const rawData = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * rowBytes;
    rawData[rowOff] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const off = rowOff + 1 + x * 4;
      rawData[off] = r;
      rawData[off + 1] = g;
      rawData[off + 2] = b;
      rawData[off + 3] = a;
    }
  }

  // Wrap in uncompressed deflate (zlib wrapper: CMF=0x78, FLG=0x01 + stored blocks)
  // For small data, use a single stored block
  const len = rawData.length;
  const nlen = ~len & 0xffff;
  // zlib header (2 bytes) + stored block header (5 bytes) + data + adler32 (4 bytes)
  const deflated = new Uint8Array(2 + 5 + len + 4);
  deflated[0] = 0x78; // CMF
  deflated[1] = 0x01; // FLG (no dict, check bits)
  deflated[2] = 0x01; // BFINAL=1, BTYPE=00 (stored)
  deflated[3] = len & 0xff;
  deflated[4] = (len >> 8) & 0xff;
  deflated[5] = nlen & 0xff;
  deflated[6] = (nlen >> 8) & 0xff;
  deflated.set(rawData, 7);
  // Adler32
  let s1 = 1,
    s2 = 0;
  for (let i = 0; i < rawData.length; i++) {
    s1 = (s1 + rawData[i]!) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  const adlerOff = 7 + len;
  deflated[adlerOff] = (adler >> 24) & 0xff;
  deflated[adlerOff + 1] = (adler >> 16) & 0xff;
  deflated[adlerOff + 2] = (adler >> 8) & 0xff;
  deflated[adlerOff + 3] = adler & 0xff;

  const iend = new Uint8Array(0);
  return concat(
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflated),
    pngChunk('IEND', iend),
  );
}

// ── Node builders ───────────────────────────────────────────────────────────

interface InpNode {
  uuid: number;
  name: string;
  type: string;
  enabled: boolean;
  zsort: number;
  lockToRoot: boolean;
  transform: {
    trans: [number, number, number];
    rot: [number, number, number];
    scale: [number, number];
    pixelsnap: boolean;
  };
  children: InpNode[];
  mesh?: { verts: number[]; uvs: number[]; indices: number[] };
  textures?: number[];
  blend_mode?: string;
  opacity?: number;
}

function makeNode(
  uuid: number,
  name: string,
  tx: number,
  ty: number,
  children: InpNode[] = [],
): InpNode {
  return {
    uuid,
    name,
    type: 'Node',
    enabled: true,
    zsort: 0.0,
    lockToRoot: false,
    transform: { trans: [tx, ty, 0.0], rot: [0.0, 0.0, 0.0], scale: [1.0, 1.0], pixelsnap: false },
    children,
  };
}

/** Create a Part node with a quad mesh (visible body part). */
function makePart(
  uuid: number,
  name: string,
  tx: number,
  ty: number,
  halfW: number,
  halfH: number,
  texIdx: number,
  zsort: number,
  children: InpNode[] = [],
): InpNode {
  return {
    uuid,
    name,
    type: 'Part',
    enabled: true,
    zsort,
    lockToRoot: false,
    transform: { trans: [tx, ty, 0.0], rot: [0.0, 0.0, 0.0], scale: [1.0, 1.0], pixelsnap: false },
    mesh: {
      verts: [-halfW, -halfH, halfW, -halfH, halfW, halfH, -halfW, halfH],
      uvs: [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0],
      indices: [0, 1, 2, 2, 3, 0],
    },
    textures: [texIdx],
    blend_mode: 'Normal',
    opacity: 1.0,
    children,
  };
}

// ── INP packer ──────────────────────────────────────────────────────────────

function packInp(payload: object, textures: Uint8Array[] = []): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(payload));

  const parts: Uint8Array[] = [
    MAGIC,
    writeU32BE(jsonBytes.length),
    jsonBytes,
    TEX_SECT,
    writeU32BE(textures.length),
  ];

  for (const tex of textures) {
    parts.push(writeU32BE(tex.length));
    parts.push(new Uint8Array([0])); // encoding: 0 = PNG
    parts.push(tex);
  }

  return concat(...parts);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a minimal .inp with only a Root node and no textures.
 */
export function generateMinimalInp(name: string): Uint8Array {
  const payload = {
    puppet: {
      meta: { name },
      nodes: makeNode(0, 'Root', 0, 0),
      param: [],
    },
  };
  return packInp(payload);
}

/**
 * Generate a humanoid puppet with visible body parts.
 *
 * Each body part is a Part node with a quad mesh and solid-color texture.
 * Textures: 0=skin (body/arms/legs), 1=head (slightly different tone).
 *
 * Hierarchy:
 *   Root
 *   └─ Body (Part, torso quad)
 *      ├─ Head (Part, head quad)
 *      ├─ LeftUpperArm → LeftLowerArm
 *      ├─ RightUpperArm → RightLowerArm
 *      ├─ LeftUpperLeg → LeftLowerLeg
 *      └─ RightUpperLeg → RightLowerLeg
 */
export function generateHumanoidInp(name: string): Uint8Array {
  // Textures: 4x4 solid color PNGs (tiny, ~100 bytes each)
  const skinTex = generateSolidPng(4, 4, 217, 190, 163, 255); // warm skin tone
  const headTex = generateSolidPng(4, 4, 230, 200, 175, 255); // slightly lighter

  const payload = {
    puppet: {
      meta: { name },
      nodes: makeNode(0, 'Root', 0, 0, [
        makePart(1, 'Body', 0, 0, 50, 80, 0, 1, [
          makePart(2, 'Head', 0, -120, 40, 45, 1, 5),
          makePart(3, 'LeftUpperArm', -70, -40, 18, 50, 0, 2, [
            makePart(4, 'LeftLowerArm', 0, 100, 15, 45, 0, 2),
          ]),
          makePart(5, 'RightUpperArm', 70, -40, 18, 50, 0, 2, [
            makePart(6, 'RightLowerArm', 0, 100, 15, 45, 0, 2),
          ]),
          makePart(7, 'LeftUpperLeg', -25, 100, 22, 55, 0, 0, [
            makePart(8, 'LeftLowerLeg', 0, 110, 18, 50, 0, 0),
          ]),
          makePart(9, 'RightUpperLeg', 25, 100, 22, 55, 0, 0, [
            makePart(10, 'RightLowerLeg', 0, 110, 18, 50, 0, 0),
          ]),
        ]),
      ]),
      param: [],
    },
  };

  return packInp(payload, [skinTex, headTex]);
}
