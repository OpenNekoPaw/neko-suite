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

const CHUNK_TYPE_BIN = 0x004e4942;

// ── GLB packer ──────────────────────────────────────────────────────────────

function packGlb(gltfJson: object, binData?: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const jsonRaw = encoder.encode(JSON.stringify(gltfJson));
  const jsonPadded = pad4(jsonRaw, 0x20); // JSON chunks padded with spaces

  const headerSize = 12; // magic + version + length
  const chunkHeaderSize = 8; // chunkLength + chunkType

  if (binData && binData.length > 0) {
    const binPadded = pad4(binData, 0x00);
    const totalLength =
      headerSize + chunkHeaderSize + jsonPadded.length + chunkHeaderSize + binPadded.length;
    return concat(
      writeU32LE(GLB_MAGIC),
      writeU32LE(GLB_VERSION),
      writeU32LE(totalLength),
      writeU32LE(jsonPadded.length),
      writeU32LE(CHUNK_TYPE_JSON),
      jsonPadded,
      writeU32LE(binPadded.length),
      writeU32LE(CHUNK_TYPE_BIN),
      binPadded,
    );
  }

  const totalLength = headerSize + chunkHeaderSize + jsonPadded.length;
  return concat(
    writeU32LE(GLB_MAGIC),
    writeU32LE(GLB_VERSION),
    writeU32LE(totalLength),
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
  mesh?: number;
}

function buildGltfJson(sceneName: string, nodes: GltfNode[], rootIndices: number[]): object {
  return {
    asset: { version: '2.0', generator: 'neko-model' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: rootIndices }],
    nodes,
  };
}

/** Write f32 little-endian to buffer at offset */
function writeF32(buf: DataView, offset: number, value: number): void {
  buf.setFloat32(offset, value, true);
}

/** Write u16 little-endian to buffer at offset */
function writeU16(buf: DataView, offset: number, value: number): void {
  buf.setUint16(offset, value, true);
}

/**
 * Build a unit cube mesh binary data (positions + normals + indices).
 * Returns { binData, accessors, bufferViews, meshes } for glTF JSON.
 *
 * 24 vertices (4 per face × 6 faces), 36 indices (2 triangles per face).
 */
function buildCubeMesh() {
  // 6 faces, each with 4 vertices and flat normal
  const faces: { normal: [number, number, number]; verts: [number, number, number][] }[] = [
    {
      normal: [0, 0, 1],
      verts: [
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
        [-0.5, 0.5, 0.5],
      ],
    },
    {
      normal: [0, 0, -1],
      verts: [
        [0.5, -0.5, -0.5],
        [-0.5, -0.5, -0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, -0.5],
      ],
    },
    {
      normal: [0, 1, 0],
      verts: [
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, -0.5],
        [-0.5, 0.5, -0.5],
      ],
    },
    {
      normal: [0, -1, 0],
      verts: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5],
      ],
    },
    {
      normal: [1, 0, 0],
      verts: [
        [0.5, -0.5, 0.5],
        [0.5, -0.5, -0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
      ],
    },
    {
      normal: [-1, 0, 0],
      verts: [
        [-0.5, -0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
        [-0.5, 0.5, -0.5],
      ],
    },
  ];

  const vertCount = 24;
  const idxCount = 36;
  const posBytes = vertCount * 3 * 4; // 288
  const normBytes = vertCount * 3 * 4; // 288
  const idxBytes = idxCount * 2; // 72 → pad to 576+72=648
  const totalBin = posBytes + normBytes + idxBytes;

  const binBuf = new ArrayBuffer(totalBin);
  const view = new DataView(binBuf);

  let posOff = 0;
  let normOff = posBytes;
  let idxOff = posBytes + normBytes;
  let vertIdx = 0;

  for (const face of faces) {
    for (const v of face.verts) {
      writeF32(view, posOff, v[0]);
      posOff += 4;
      writeF32(view, posOff, v[1]);
      posOff += 4;
      writeF32(view, posOff, v[2]);
      posOff += 4;
      writeF32(view, normOff, face.normal[0]);
      normOff += 4;
      writeF32(view, normOff, face.normal[1]);
      normOff += 4;
      writeF32(view, normOff, face.normal[2]);
      normOff += 4;
    }
    // Two triangles: 0,1,2 and 0,2,3
    writeU16(view, idxOff, vertIdx);
    idxOff += 2;
    writeU16(view, idxOff, vertIdx + 1);
    idxOff += 2;
    writeU16(view, idxOff, vertIdx + 2);
    idxOff += 2;
    writeU16(view, idxOff, vertIdx);
    idxOff += 2;
    writeU16(view, idxOff, vertIdx + 2);
    idxOff += 2;
    writeU16(view, idxOff, vertIdx + 3);
    idxOff += 2;
    vertIdx += 4;
  }

  const binData = new Uint8Array(binBuf);

  return {
    binData,
    buffers: [{ byteLength: totalBin }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: normBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + normBytes, byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5126, count: vertCount, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idxCount, type: 'SCALAR' },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'Default',
        pbrMetallicRoughness: {
          baseColorFactor: [0.7, 0.7, 0.7, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.5,
        },
      },
    ],
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
  const cube = buildCubeMesh();

  const nodes: GltfNode[] = [
    { name: 'Hips', translation: [0, 1.0, 0], children: [1, 8, 10], mesh: 0 },
    { name: 'Spine', translation: [0, 0.2, 0], children: [2] },
    { name: 'Chest', translation: [0, 0.2, 0], children: [3, 4, 6] },
    { name: 'Head', translation: [0, 0.3, 0], scale: [0.3, 0.3, 0.3], mesh: 0 },
    { name: 'LeftUpperArm', translation: [-0.2, 0.15, 0], children: [5] },
    { name: 'LeftLowerArm', translation: [0, -0.3, 0] },
    { name: 'RightUpperArm', translation: [0.2, 0.15, 0], children: [7] },
    { name: 'RightLowerArm', translation: [0, -0.3, 0] },
    { name: 'LeftUpperLeg', translation: [-0.1, -0.05, 0], children: [9] },
    { name: 'LeftLowerLeg', translation: [0, -0.4, 0] },
    { name: 'RightUpperLeg', translation: [0.1, -0.05, 0], children: [11] },
    { name: 'RightLowerLeg', translation: [0, -0.4, 0] },
  ];

  const json = {
    ...buildGltfJson(name, nodes, [0]),
    ...(cube.buffers && { buffers: cube.buffers }),
    bufferViews: cube.bufferViews,
    accessors: cube.accessors,
    meshes: cube.meshes,
    materials: cube.materials,
  };

  return packGlb(json, cube.binData);
}
