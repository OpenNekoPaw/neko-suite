import { describe, expect, it } from 'vitest';
import { encodeAsePalette, normalizeHexColor, parsePaletteFile } from './palette-file';

describe('palette file utilities', () => {
  it('normalizes valid hex colors', () => {
    expect(normalizeHexColor('ffcc00')).toBe('#FFCC00');
    expect(normalizeHexColor('#00aaee')).toBe('#00AAEE');
    expect(normalizeHexColor('bad-color')).toBeNull();
  });

  it('round-trips RGB colors through ASE encoding', () => {
    const encoded = encodeAsePalette({
      name: 'Warm',
      colors: ['#FF0000', '#00FF00', '#336699'],
    });
    const parsed = parsePaletteFile('warm.ase', encoded);

    expect(parsed).toEqual({
      name: 'warm',
      colors: ['#FF0000', '#00FF00', '#336699'],
    });
  });

  it('parses RGB records from ACO files', () => {
    const bytes = new Uint8Array(24);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 1, false);
    view.setUint16(2, 2, false);
    writeAcoRgb(view, 4, 65535, 0, 0);
    writeAcoRgb(view, 14, 0, 32768, 65535);

    expect(parsePaletteFile('sample.aco', bytes)).toEqual({
      name: 'sample',
      colors: ['#FF0000', '#0080FF'],
    });
  });

  it('parses text palettes', () => {
    const parsed = parsePaletteFile('palette.txt', new TextEncoder().encode('#123456\nabcdef'));

    expect(parsed).toEqual({
      name: 'palette',
      colors: ['#123456', '#ABCDEF'],
    });
  });
});

function writeAcoRgb(
  view: DataView,
  offset: number,
  red: number,
  green: number,
  blue: number,
): void {
  view.setUint16(offset, 0, false);
  view.setUint16(offset + 2, red, false);
  view.setUint16(offset + 4, green, false);
  view.setUint16(offset + 6, blue, false);
  view.setUint16(offset + 8, 0, false);
}
