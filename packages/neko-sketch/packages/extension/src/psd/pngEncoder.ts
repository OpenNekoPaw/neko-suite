import { deflateSync } from 'zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (width <= 0 || height <= 0) {
    throw new Error('PNG dimensions must be positive');
  }
  const expectedLength = width * height * 4;
  if (rgba.length !== expectedLength) {
    throw new Error(`Invalid RGBA buffer length: expected ${expectedLength}, got ${rgba.length}`);
  }

  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * scanlineLength;
    raw[rowStart] = 0;
    const sourceStart = y * width * 4;
    Buffer.from(rgba.buffer, rgba.byteOffset + sourceStart, width * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr(width, height)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // bit depth
  data[9] = 6; // RGBA
  data[10] = 0; // compression
  data[11] = 0; // filter
  data[12] = 0; // interlace
  return data;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const CRC_TABLE = createCrcTable();

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
