/**
 * Minimal OSC (Open Sound Control) parser for VMC protocol.
 * VMC uses only string (s), float32 (f), and int32 (i) argument types.
 * See: http://opensoundcontrol.org/spec-1_0
 */

export interface OscMessage {
  address: string;
  args: OscArg[];
}

export type OscArg =
  | { type: 's'; value: string }
  | { type: 'f'; value: number }
  | { type: 'i'; value: number };

const OSC_BUNDLE_TAG = '#bundle\0';

/** Read a null-terminated string from buffer at offset. Returns [string, nextOffset]. */
function readOscString(buf: Buffer, offset: number): [string, number] {
  const end = buf.indexOf(0, offset);
  if (end === -1) {
    return [buf.subarray(offset).toString('ascii'), buf.length];
  }
  const str = buf.subarray(offset, end).toString('ascii');
  // OSC strings are padded to 4-byte boundary (including the null terminator)
  const padded = end + 1;
  const aligned = padded + ((4 - (padded % 4)) % 4);
  return [str, aligned];
}

/** Read a big-endian float32 from buffer. */
function readFloat32(buf: Buffer, offset: number): [number, number] {
  return [buf.readFloatBE(offset), offset + 4];
}

/** Read a big-endian int32 from buffer. */
function readInt32(buf: Buffer, offset: number): [number, number] {
  return [buf.readInt32BE(offset), offset + 4];
}

/** Parse a single OSC message from buffer. */
export function parseOscMessage(buf: Buffer, start = 0): OscMessage | undefined {
  if (start >= buf.length) return undefined;

  let offset = start;

  // Read address pattern
  const [address, afterAddr] = readOscString(buf, offset);
  if (!address.startsWith('/')) return undefined;
  offset = afterAddr;

  // Read type tag string (starts with ',')
  if (offset >= buf.length) return { address, args: [] };
  const [typeTag, afterType] = readOscString(buf, offset);
  offset = afterType;

  if (!typeTag.startsWith(',')) return { address, args: [] };

  const tags = typeTag.slice(1); // Remove leading ','
  const args: OscArg[] = [];

  for (const tag of tags) {
    if (offset >= buf.length) break;

    switch (tag) {
      case 's': {
        const [val, next] = readOscString(buf, offset);
        args.push({ type: 's', value: val });
        offset = next;
        break;
      }
      case 'f': {
        const [val, next] = readFloat32(buf, offset);
        args.push({ type: 'f', value: val });
        offset = next;
        break;
      }
      case 'i': {
        const [val, next] = readInt32(buf, offset);
        args.push({ type: 'i', value: val });
        offset = next;
        break;
      }
      default:
        // Unknown type tag — skip remaining args
        return { address, args };
    }
  }

  return { address, args };
}

/** Parse an OSC bundle or single message from a UDP packet. */
export function parseOscPacket(buf: Buffer): OscMessage[] {
  if (buf.length < 8) return [];

  // Check if it's a bundle
  const header = buf.subarray(0, 8).toString('ascii');
  if (header === OSC_BUNDLE_TAG) {
    return parseOscBundle(buf);
  }

  // Single message
  const msg = parseOscMessage(buf);
  return msg ? [msg] : [];
}

/** Parse an OSC bundle (recursive). */
function parseOscBundle(buf: Buffer): OscMessage[] {
  const messages: OscMessage[] = [];

  // Skip "#bundle\0" (8 bytes) + timetag (8 bytes)
  let offset = 16;

  while (offset < buf.length) {
    if (offset + 4 > buf.length) break;

    // Each element is prefixed with its size (int32 BE)
    const size = buf.readInt32BE(offset);
    offset += 4;

    if (size <= 0 || offset + size > buf.length) break;

    const element = buf.subarray(offset, offset + size);
    offset += size;

    // Recursively handle nested bundles
    const elementHeader = element.subarray(0, Math.min(8, element.length)).toString('ascii');
    if (elementHeader === OSC_BUNDLE_TAG) {
      messages.push(...parseOscBundle(element));
    } else {
      const msg = parseOscMessage(element);
      if (msg) messages.push(msg);
    }
  }

  return messages;
}
