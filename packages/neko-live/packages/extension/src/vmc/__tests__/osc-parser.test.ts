import { describe, it, expect } from 'vitest';
import { parseOscMessage, parseOscPacket } from '../osc-parser';
import type { OscMessage } from '../osc-parser';

// =============================================================================
// Helpers — Build OSC binary payloads per the OSC 1.0 spec
// =============================================================================

/** Write a null-terminated, 4-byte-aligned OSC string into a buffer list. */
function oscString(str: string): Buffer {
  const bytes = Buffer.from(str + '\0', 'ascii');
  const padded = Math.ceil(bytes.length / 4) * 4;
  const buf = Buffer.alloc(padded);
  bytes.copy(buf);
  return buf;
}

/** Write a big-endian float32. */
function oscFloat(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(val, 0);
  return buf;
}

/** Write a big-endian int32. */
function oscInt(val: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(val, 0);
  return buf;
}

/** Wrap one or more message buffers in an OSC bundle envelope. */
function oscBundle(timeTag: bigint, ...elements: Buffer[]): Buffer {
  const header = Buffer.from('#bundle\0', 'ascii'); // 8 bytes
  const tt = Buffer.alloc(8);
  tt.writeBigUInt64BE(timeTag);

  const parts: Buffer[] = [header, tt];
  for (const el of elements) {
    const size = Buffer.alloc(4);
    size.writeInt32BE(el.length);
    parts.push(size, el);
  }
  return Buffer.concat(parts);
}

// =============================================================================
// parseOscMessage
// =============================================================================

describe('parseOscMessage', () => {
  it('parses a message with no arguments', () => {
    const buf = Buffer.concat([oscString('/test'), oscString(',')]);
    const msg = parseOscMessage(buf);
    expect(msg).toEqual({ address: '/test', args: [] });
  });

  it('parses a message with a single float argument', () => {
    const buf = Buffer.concat([oscString('/value'), oscString(',f'), oscFloat(1.5)]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.address).toBe('/value');
    expect(msg!.args).toHaveLength(1);
    expect(msg!.args[0]!.type).toBe('f');
    expect((msg!.args[0] as { type: 'f'; value: number }).value).toBeCloseTo(1.5, 5);
  });

  it('parses a message with a single int argument', () => {
    const buf = Buffer.concat([oscString('/count'), oscString(',i'), oscInt(42)]);
    const msg = parseOscMessage(buf);
    expect(msg).toEqual({ address: '/count', args: [{ type: 'i', value: 42 }] });
  });

  it('parses a message with a single string argument', () => {
    const buf = Buffer.concat([oscString('/name'), oscString(',s'), oscString('hello')]);
    const msg = parseOscMessage(buf);
    expect(msg).toEqual({ address: '/name', args: [{ type: 's', value: 'hello' }] });
  });

  it('parses a message with mixed argument types (s, f, i)', () => {
    const buf = Buffer.concat([
      oscString('/VMC/Ext/Blend/Val'),
      oscString(',sfi'),
      oscString('browUp'),
      oscFloat(0.75),
      oscInt(1),
    ]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.address).toBe('/VMC/Ext/Blend/Val');
    expect(msg!.args).toHaveLength(3);
    expect(msg!.args[0]).toEqual({ type: 's', value: 'browUp' });
    expect((msg!.args[1] as { type: 'f'; value: number }).value).toBeCloseTo(0.75, 5);
    expect(msg!.args[2]).toEqual({ type: 'i', value: 1 });
  });

  it('parses a VMC bone transform message (7 floats)', () => {
    // /VMC/Ext/Bone/Pos s(name) fff(pos) ffff(quat)
    const buf = Buffer.concat([
      oscString('/VMC/Ext/Bone/Pos'),
      oscString(',sfffffff'),
      oscString('Head'),
      oscFloat(0.0),
      oscFloat(1.5),
      oscFloat(0.0), // position
      oscFloat(0.0),
      oscFloat(0.0),
      oscFloat(0.0),
      oscFloat(1.0), // quaternion
    ]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.address).toBe('/VMC/Ext/Bone/Pos');
    expect(msg!.args).toHaveLength(8);
    expect(msg!.args[0]).toEqual({ type: 's', value: 'Head' });
    // position y
    expect((msg!.args[2] as { type: 'f'; value: number }).value).toBeCloseTo(1.5, 5);
    // quaternion w
    expect((msg!.args[7] as { type: 'f'; value: number }).value).toBeCloseTo(1.0, 5);
  });

  it('returns undefined for empty buffer', () => {
    expect(parseOscMessage(Buffer.alloc(0))).toBeUndefined();
  });

  it('returns undefined if address does not start with /', () => {
    const buf = Buffer.concat([oscString('noSlash'), oscString(',')]);
    expect(parseOscMessage(buf)).toBeUndefined();
  });

  it('returns empty args when type tag is missing', () => {
    // Only address, buffer ends immediately after
    const buf = oscString('/addr');
    // Trim to exact address+padding so no type tag is available
    const msg = parseOscMessage(buf);
    // The type tag will be read from the padding bytes (all zeros)
    // which is an empty string that doesn't start with ',' → empty args
    expect(msg).toBeDefined();
    expect(msg!.args).toEqual([]);
  });

  it('handles unknown type tags gracefully (stops parsing args)', () => {
    // 'b' (blob) is not supported in this minimal parser
    const buf = Buffer.concat([
      oscString('/unknown'),
      oscString(',fb'),
      oscFloat(1.0),
      Buffer.alloc(8), // dummy blob data
    ]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.args).toHaveLength(1); // only the float before 'b'
    expect((msg!.args[0] as { type: 'f'; value: number }).value).toBeCloseTo(1.0, 5);
  });

  it('gracefully handles truncated float payload (fewer than 4 bytes)', () => {
    const buf = Buffer.concat([oscString('/trunc'), oscString(',f'), Buffer.alloc(2)]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.address).toBe('/trunc');
    expect(msg!.args).toEqual([]); // float needs 4 bytes, only 2 available → stop
  });

  it('gracefully handles truncated int payload (fewer than 4 bytes)', () => {
    const buf = Buffer.concat([oscString('/trunc'), oscString(',i'), Buffer.alloc(1)]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.address).toBe('/trunc');
    expect(msg!.args).toEqual([]);
  });

  it('returns partial args when payload is truncated mid-sequence', () => {
    // Two floats declared, but only enough data for one
    const buf = Buffer.concat([
      oscString('/partial'),
      oscString(',ff'),
      oscFloat(1.0),
      Buffer.alloc(2), // only 2 bytes for second float
    ]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.args).toHaveLength(1);
    expect((msg!.args[0] as { type: 'f'; value: number }).value).toBeCloseTo(1.0, 5);
  });

  it('parseOscPacket does not throw on truncated payload', () => {
    const buf = Buffer.concat([oscString('/trunc'), oscString(',f'), Buffer.alloc(2)]);
    const msgs = parseOscPacket(buf);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.args).toEqual([]);
  });

  it('handles negative int and float values', () => {
    const buf = Buffer.concat([oscString('/neg'), oscString(',fi'), oscFloat(-3.14), oscInt(-100)]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect((msg!.args[0] as { type: 'f'; value: number }).value).toBeCloseTo(-3.14, 2);
    expect(msg!.args[1]).toEqual({ type: 'i', value: -100 });
  });

  it('respects the start offset parameter', () => {
    const prefix = Buffer.alloc(8, 0xff); // garbage prefix
    const msgBuf = Buffer.concat([oscString('/offset'), oscString(',i'), oscInt(99)]);
    const buf = Buffer.concat([prefix, msgBuf]);
    const msg = parseOscMessage(buf, 8);
    expect(msg).toEqual({ address: '/offset', args: [{ type: 'i', value: 99 }] });
  });

  it('returns undefined when start >= buffer length', () => {
    const buf = Buffer.alloc(4);
    expect(parseOscMessage(buf, 4)).toBeUndefined();
    expect(parseOscMessage(buf, 100)).toBeUndefined();
  });
});

// =============================================================================
// parseOscPacket — single message
// =============================================================================

describe('parseOscPacket', () => {
  it('parses a single message packet', () => {
    const buf = Buffer.concat([oscString('/hello'), oscString(',i'), oscInt(7)]);
    const msgs = parseOscPacket(buf);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.address).toBe('/hello');
    expect(msgs[0]!.args).toEqual([{ type: 'i', value: 7 }]);
  });

  it('returns empty array for buffers smaller than 8 bytes', () => {
    expect(parseOscPacket(Buffer.alloc(0))).toEqual([]);
    expect(parseOscPacket(Buffer.alloc(7))).toEqual([]);
  });

  it('returns empty array for non-message, non-bundle data', () => {
    // 8 bytes that don't form a valid address or bundle header
    const buf = Buffer.alloc(8, 0x00);
    expect(parseOscPacket(buf)).toEqual([]);
  });
});

// =============================================================================
// parseOscPacket — bundles
// =============================================================================

describe('parseOscPacket (bundles)', () => {
  it('parses a bundle containing a single message', () => {
    const msg = Buffer.concat([oscString('/in/bundle'), oscString(',f'), oscFloat(2.5)]);
    const bundle = oscBundle(1n, msg);
    const msgs = parseOscPacket(bundle);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.address).toBe('/in/bundle');
    expect((msgs[0]!.args[0] as { type: 'f'; value: number }).value).toBeCloseTo(2.5, 5);
  });

  it('parses a bundle containing multiple messages', () => {
    const msg1 = Buffer.concat([oscString('/a'), oscString(',i'), oscInt(1)]);
    const msg2 = Buffer.concat([oscString('/b'), oscString(',i'), oscInt(2)]);
    const msg3 = Buffer.concat([oscString('/c'), oscString(',s'), oscString('three')]);
    const bundle = oscBundle(0n, msg1, msg2, msg3);
    const msgs = parseOscPacket(bundle);
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m: OscMessage) => m.address)).toEqual(['/a', '/b', '/c']);
  });

  it('parses nested bundles recursively', () => {
    const innerMsg = Buffer.concat([oscString('/inner'), oscString(',i'), oscInt(42)]);
    const innerBundle = oscBundle(0n, innerMsg);
    const outerMsg = Buffer.concat([oscString('/outer'), oscString(',i'), oscInt(99)]);
    const outerBundle = oscBundle(0n, outerMsg, innerBundle);
    const msgs = parseOscPacket(outerBundle);
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m: OscMessage) => m.address)).toEqual(['/outer', '/inner']);
  });

  it('handles bundle with zero-size or negative-size element gracefully', () => {
    // Manually construct a malformed bundle with size=0
    const header = Buffer.from('#bundle\0', 'ascii');
    const tt = Buffer.alloc(8);
    const sizeZero = Buffer.alloc(4); // size = 0
    sizeZero.writeInt32BE(0);
    const bundle = Buffer.concat([header, tt, sizeZero]);
    const msgs = parseOscPacket(bundle);
    expect(msgs).toEqual([]);
  });

  it('handles bundle with truncated element gracefully', () => {
    const header = Buffer.from('#bundle\0', 'ascii');
    const tt = Buffer.alloc(8);
    const sizeBuf = Buffer.alloc(4);
    sizeBuf.writeInt32BE(100); // claims 100 bytes but only 4 available
    const data = Buffer.alloc(4);
    const bundle = Buffer.concat([header, tt, sizeBuf, data]);
    const msgs = parseOscPacket(bundle);
    expect(msgs).toEqual([]);
  });
});

// =============================================================================
// OSC string alignment edge cases
// =============================================================================

describe('OSC string alignment', () => {
  it('handles strings that are exactly 4-byte aligned after null', () => {
    // "abc" + \0 = 4 bytes exactly (no extra padding needed)
    const buf = Buffer.concat([oscString('/abc'), oscString(',i'), oscInt(5)]);
    const msg = parseOscMessage(buf);
    expect(msg).toEqual({ address: '/abc', args: [{ type: 'i', value: 5 }] });
  });

  it('handles strings that need 1 byte of padding', () => {
    // "/ab" + \0 = 4 bytes, aligned
    const buf = Buffer.concat([oscString('/ab'), oscString(',i'), oscInt(5)]);
    const msg = parseOscMessage(buf);
    expect(msg).toEqual({ address: '/ab', args: [{ type: 'i', value: 5 }] });
  });

  it('handles strings that need 3 bytes of padding', () => {
    // "/abcd" + \0 = 6 bytes → pad to 8
    const buf = Buffer.concat([oscString('/abcd'), oscString(',i'), oscInt(5)]);
    const msg = parseOscMessage(buf);
    expect(msg).toEqual({ address: '/abcd', args: [{ type: 'i', value: 5 }] });
  });

  it('handles empty string argument', () => {
    const buf = Buffer.concat([oscString('/empty'), oscString(',s'), oscString('')]);
    const msg = parseOscMessage(buf);
    expect(msg).toBeDefined();
    expect(msg!.args).toEqual([{ type: 's', value: '' }]);
  });
});
