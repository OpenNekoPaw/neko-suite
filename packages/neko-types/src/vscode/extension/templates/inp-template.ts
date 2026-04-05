/**
 * Generates minimal Inochi2D (.inp) binary files in TypeScript.
 *
 * INP format:
 *   [0..8]    Magic: "TRNSRTS\0"
 *   [8..12]   u32 BE: JSON payload length
 *   [12..N]   UTF-8 JSON: puppet definition
 *   [N..N+8]  "TEX_SECT" header
 *   [N+8..12] u32 BE: texture count (0 for templates)
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

// ── Node builder ────────────────────────────────────────────────────────────

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
    transform: {
      trans: [tx, ty, 0.0],
      rot: [0.0, 0.0, 0.0],
      scale: [1.0, 1.0],
      pixelsnap: false,
    },
    children,
  };
}

// ── INP packer ──────────────────────────────────────────────────────────────

function packInp(payload: object): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(payload));
  return concat(MAGIC, writeU32BE(jsonBytes.length), jsonBytes, TEX_SECT, writeU32BE(0));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a minimal .inp with only a Root node and no textures.
 * Produces a valid puppet that the engine can load (~300 bytes).
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
 * Generate a simple humanoid .inp skeleton with body part nodes.
 * No textures — provides a structural starting point for rigging.
 *
 * Hierarchy:
 *   Root
 *   └─ Body (0, 0)
 *      ├─ Head (0, -150)
 *      ├─ LeftArm (-100, -50)
 *      ├─ RightArm (100, -50)
 *      ├─ LeftLeg (-40, 150)
 *      └─ RightLeg (40, 150)
 */
export function generateHumanoidInp(name: string): Uint8Array {
  const payload = {
    puppet: {
      meta: { name },
      nodes: makeNode(0, 'Root', 0, 0, [
        makeNode(1, 'Body', 0, 0, [
          makeNode(2, 'Head', 0, -150),
          makeNode(3, 'LeftArm', -100, -50),
          makeNode(4, 'RightArm', 100, -50),
          makeNode(5, 'LeftLeg', -40, 150),
          makeNode(6, 'RightLeg', 40, 150),
        ]),
      ]),
      param: [],
    },
  };
  return packInp(payload);
}
