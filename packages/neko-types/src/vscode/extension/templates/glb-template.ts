/**
 * Generates minimal glTF Binary (.glb) files in TypeScript.
 *
 * GLB format (glTF 2.0):
 *   [0..4]    Magic: "glTF"
 *   [4..8]    u32 LE: version (2)
 *   [8..12]   u32 LE: total file length
 *   [12..]    Chunks:
 *     [0..4]  u32 LE: chunk length (padded to 4-byte boundary)
 *     [4..8]  u32 LE: chunk type (0x4E4F534A = JSON, 0x004E4942 = BIN)
 *     [8..]   chunk data (padded with 0x20 for JSON, 0x00 for BIN)
 */

// ── Binary helpers ──────────────────────────────────────────────────────────

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_TYPE_JSON = 0x4e4f534a;

function writeU32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, true); // little-endian
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

/** Pad to 4-byte boundary with the given fill byte. */
function pad4(data: Uint8Array, fill: number): Uint8Array {
  const remainder = data.length % 4;
  if (remainder === 0) return data;
  const padding = new Uint8Array(4 - remainder);
  padding.fill(fill);
  return concat(data, padding);
}

// ── GLB packer ──────────────────────────────────────────────────────────────

function packGlb(gltfJson: object): Uint8Array {
  const encoder = new TextEncoder();
  const jsonRaw = encoder.encode(JSON.stringify(gltfJson));
  const jsonPadded = pad4(jsonRaw, 0x20); // JSON chunks padded with spaces

  const headerSize = 12; // magic + version + length
  const chunkHeaderSize = 8; // chunkLength + chunkType
  const totalLength = headerSize + chunkHeaderSize + jsonPadded.length;

  return concat(
    writeU32LE(GLB_MAGIC),
    writeU32LE(GLB_VERSION),
    writeU32LE(totalLength),
    // JSON chunk
    writeU32LE(jsonPadded.length),
    writeU32LE(CHUNK_TYPE_JSON),
    jsonPadded,
  );
}

// ── glTF node builder ───────────────────────────────────────────────────────

interface GltfNode {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  children?: number[];
}

function buildGltfJson(sceneName: string, nodes: GltfNode[], rootIndices: number[]): object {
  return {
    asset: { version: '2.0', generator: 'neko-model' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: rootIndices }],
    nodes,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a minimal .glb with a single root node and no meshes.
 * Produces a valid glTF 2.0 binary (~200 bytes).
 */
export function generateMinimalGlb(name: string): Uint8Array {
  const nodes: GltfNode[] = [{ name: 'Root' }];
  return packGlb(buildGltfJson(name, nodes, [0]));
}

/**
 * Generate a simple humanoid skeleton .glb with bone hierarchy.
 * No meshes, no skinning — provides a structural starting point.
 *
 * Hierarchy:
 *   0: Hips (0, 1.0, 0)
 *   ├─ 1: Spine (0, 0.2, 0)
 *   │  ├─ 2: Chest (0, 0.2, 0)
 *   │  │  ├─ 3: Head (0, 0.3, 0)
 *   │  │  ├─ 4: LeftUpperArm (-0.2, 0.15, 0)
 *   │  │  │  └─ 5: LeftLowerArm (0, -0.3, 0)
 *   │  │  └─ 6: RightUpperArm (0.2, 0.15, 0)
 *   │  │     └─ 7: RightLowerArm (0, -0.3, 0)
 *   ├─ 8: LeftUpperLeg (-0.1, -0.05, 0)
 *   │  └─ 9: LeftLowerLeg (0, -0.4, 0)
 *   └─ 10: RightUpperLeg (0.1, -0.05, 0)
 *      └─ 11: RightLowerLeg (0, -0.4, 0)
 */
export function generateHumanoidGlb(name: string): Uint8Array {
  const nodes: GltfNode[] = [
    { name: 'Hips', translation: [0, 1.0, 0], children: [1, 8, 10] },
    { name: 'Spine', translation: [0, 0.2, 0], children: [2] },
    { name: 'Chest', translation: [0, 0.2, 0], children: [3, 4, 6] },
    { name: 'Head', translation: [0, 0.3, 0] },
    { name: 'LeftUpperArm', translation: [-0.2, 0.15, 0], children: [5] },
    { name: 'LeftLowerArm', translation: [0, -0.3, 0] },
    { name: 'RightUpperArm', translation: [0.2, 0.15, 0], children: [7] },
    { name: 'RightLowerArm', translation: [0, -0.3, 0] },
    { name: 'LeftUpperLeg', translation: [-0.1, -0.05, 0], children: [9] },
    { name: 'LeftLowerLeg', translation: [0, -0.4, 0] },
    { name: 'RightUpperLeg', translation: [0.1, -0.05, 0], children: [11] },
    { name: 'RightLowerLeg', translation: [0, -0.4, 0] },
  ];
  return packGlb(buildGltfJson(name, nodes, [0]));
}
